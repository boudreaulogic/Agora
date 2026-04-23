import { WebSocketServer } from 'ws';
import http from 'http';
import cron from 'node-cron';
import { jwtVerify } from 'jose';
import { parse } from 'url';
import crypto from 'crypto';

const PORT = process.env.WS_PORT || 3001;
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
const BROADCAST_SECRET = process.env.BROADCAST_SECRET || NEXTAUTH_SECRET;

if (!NEXTAUTH_SECRET) {
  console.error('FATAL: NEXTAUTH_SECRET not set.');
  process.exit(1);
}

const secretKey = new TextEncoder().encode(NEXTAUTH_SECRET);

// ---- Connection tracking ----
const MAX_CONNECTIONS_PER_USER = 5;
const CONNECTION_RATE_LIMIT = 20; // per IP per minute
const MESSAGE_RATE_LIMIT = 50; // per connection per second
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 35000; // 35 seconds

const connectionAttempts = new Map(); // IP -> { count, resetAt }
const userConnectionCounts = new Map(); // userId -> count

function checkConnectionRateLimit(ip) {
  const now = Date.now();
  const record = connectionAttempts.get(ip);
  if (!record || now > record.resetAt) {
    connectionAttempts.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  record.count++;
  return record.count <= CONNECTION_RATE_LIMIT;
}

// ---- Token verification ----
async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'], // Pin algorithm — prevents alg:none attacks
    });
    return payload;
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return null;
  }
}

// ---- WebSocket server ----
const wss = new WebSocketServer({ noServer: true });
const clients = new Map();

// ---- Heartbeat ----
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(`Heartbeat timeout: ${ws.userId}`);
      const clientData = clients.get(ws);
      if (clientData) {
        broadcastToTable(clientData.tableId, { type: 'user-disconnected', userId: ws.userId }, ws);
        clients.delete(ws);
      }
      decrementUserConnections(ws.userId);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

function decrementUserConnections(userId) {
  if (!userId) return;
  const count = userConnectionCounts.get(userId) || 0;
  if (count <= 1) {
    userConnectionCounts.delete(userId);
  } else {
    userConnectionCounts.set(userId, count - 1);
  }
}

// ---- HTTP server with authenticated broadcast ----
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/broadcast') {
    // Authenticate broadcast requests with timing-safe comparison
    const authHeader = req.headers['authorization'] || '';
    const expected = 'Bearer ' + BROADCAST_SECRET;
    const authBuf = Buffer.from(authHeader);
    const expectedBuf = Buffer.from(expected);
    if (authBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(authBuf, expectedBuf)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const message = JSON.parse(body);
        const tableId = message.tableId;

        if (!tableId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'tableId required' }));
          return;
        }

        // Broadcast to all clients watching this table
        const broadcastMsg = JSON.stringify(message);
        let count = 0;
        clients.forEach((clientData, clientWs) => {
          if (clientData.tableId === tableId && clientWs.readyState === 1) {
            clientWs.send(broadcastMsg);
            count++;
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, recipients: count }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

// ---- WebSocket upgrade with auth ----
server.on('upgrade', async (req, socket, head) => {
  try {
    // Rate limit connection attempts by IP
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    // Validate WebSocket origin — prevents Cross-Site WebSocket Hijacking
    const origin = req.headers.origin;
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
    if (origin && !allowedOrigins.includes(origin)) {
      console.log('WS rejected: invalid origin', origin);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    if (!checkConnectionRateLimit(ip)) {
      console.log('WS rejected: rate limited IP', ip);
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    const { query } = parse(req.url || '', true);
    const token = query.token;

    if (!token) {
      console.log('WS rejected: no token');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const payload = await verifyToken(token);
    if (!payload || !payload.id) {
      console.log('WS rejected: invalid token');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Check per-user connection limit
    const currentCount = userConnectionCounts.get(payload.id) || 0;
    if (currentCount >= MAX_CONNECTIONS_PER_USER) {
      console.log('WS rejected: max connections for user', payload.id);
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = payload.id;
      ws.userName = payload.name || payload.email || 'Unknown';
      ws.authenticated = true;
      ws.isAlive = true;
      ws.messageCount = 0;
      ws.messageCountReset = Date.now() + 1000;

      userConnectionCounts.set(payload.id, currentCount + 1);
      console.log(`WS authenticated: ${ws.userName} (${ws.userId})`);
      wss.emit('connection', ws, req);
    });
  } catch (err) {
    console.error('WS upgrade error:', err);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

// ---- Connection handler ----
wss.on('connection', (ws) => {
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    // Message rate limiting
    const now = Date.now();
    if (now > ws.messageCountReset) {
      ws.messageCount = 0;
      ws.messageCountReset = now + 1000;
    }
    ws.messageCount++;
    if (ws.messageCount > MESSAGE_RATE_LIMIT) {
      console.log(`Message rate limit exceeded: ${ws.userId}`);
      ws.close(1008, 'Message rate limit exceeded');
      return;
    }

    try {
      const message = JSON.parse(data.toString());
      message.userId = ws.userId;

      switch (message.type) {
        case 'register':
          clients.set(ws, { userId: ws.userId, tableId: message.tableId });
          console.log(`User ${ws.userId} registered for table ${message.tableId}`);
          break;
        case 'cell-focus':
          broadcastToTable(message.tableId, { type: 'cell-focus', userId: ws.userId, userName: message.userName, cellId: message.cellId, color: message.color }, ws);
          break;
        case 'cell-blur':
          broadcastToTable(message.tableId, { type: 'cell-blur', userId: ws.userId, cellId: message.cellId }, ws);
          break;
        case 'cell-update':
          broadcastToTable(message.tableId, { type: 'cell-update', rowId: message.rowId, columnId: message.columnId, value: message.value, userId: ws.userId, timestamp: Date.now() }, ws);
          break;
        case 'row-lock':
          broadcastToTable(message.tableId, { type: 'row-lock', rowId: message.rowId, isLocked: message.isLocked, userId: ws.userId, timestamp: Date.now() }, ws);
          break;
        case 'column-permissions-changed':
          broadcastToTable(message.tableId, { type: 'column-permissions-changed', columnId: message.columnId, userId: ws.userId, timestamp: Date.now() }, ws);
          break;
        case 'row-comment':
          broadcastToTable(message.tableId, { type: 'row-comment', rowId: message.rowId, comment: message.comment, userId: ws.userId, timestamp: Date.now() }, ws);
          break;
        case 'row-editing':
          broadcastToTable(message.tableId, { type: 'row-editing', rowId: message.rowId, userId: ws.userId, userName: message.userName, color: message.color, timestamp: Date.now() }, ws);
          break;
        case 'row-editing-done':
          broadcastToTable(message.tableId, { type: 'row-editing-done', rowId: message.rowId, userId: ws.userId, timestamp: Date.now() }, ws);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    const clientData = clients.get(ws);
    if (clientData) {
      broadcastToTable(clientData.tableId, { type: 'user-disconnected', userId: ws.userId }, ws);
      clients.delete(ws);
    }
    decrementUserConnections(ws.userId);
    console.log(`Client disconnected: ${ws.userId}`);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function broadcastToTable(tableId, message, sender) {
  const messageStr = JSON.stringify(message);
  clients.forEach((clientData, clientWs) => {
    if (clientData.tableId === tableId && clientWs !== sender && clientWs.readyState === 1) {
      clientWs.send(messageStr);
    }
  });
}

server.listen(PORT, () => {
  console.log(`Authenticated WebSocket server running on ws://localhost:${PORT}`);
});

// ---- Hourly cron for approval reminders ----
cron.schedule('0 * * * *', async () => {
  console.log('Hourly cron: checking for approval reminders...');
  try {
    const res = await fetch('http://agora-web:3000/api/cron/reminders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': NEXTAUTH_SECRET,
      },
    });
    const data = await res.json();
    console.log(`Reminders sent: ${data.remindersSent || 0}`);
  } catch (err) {
    console.error('Reminder cron failed:', err.message);
  }
});

// ---- Cleanup on shutdown ----
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  clearInterval(heartbeatInterval);
  server.close();
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});