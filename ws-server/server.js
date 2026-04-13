import { WebSocketServer } from 'ws';
import http from 'http';
import cron from 'node-cron';
import { jwtVerify } from 'jose';
import { parse } from 'url';

const PORT = process.env.WS_PORT || 3001;
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

if (!NEXTAUTH_SECRET) {
  console.error('FATAL: NEXTAUTH_SECRET not set.');
  process.exit(1);
}

const secretKey = new TextEncoder().encode(NEXTAUTH_SECRET);

async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload;
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return null;
  }
}

const wss = new WebSocketServer({ noServer: true });
const clients = new Map();

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/broadcast') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const message = JSON.parse(body);
        if (message.type === 'form-submission' && message.tableId) {
          const broadcastMsg = JSON.stringify({
            type: 'form-submission',
            row: message.row,
            tableId: message.tableId,
            timestamp: Date.now(),
          });
          clients.forEach((clientData, clientWs) => {
            if (clientData.tableId === message.tableId && clientWs.readyState === 1) {
              clientWs.send(broadcastMsg);
            }
          });
          console.log(`Broadcast form submission to table ${message.tableId}`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.on('upgrade', async (req, socket, head) => {
  try {
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

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = payload.id;
      ws.userName = payload.name || payload.email || 'Unknown';
      ws.authenticated = true;
      console.log(`WS authenticated: ${ws.userName} (${ws.userId})`);
      wss.emit('connection', ws, req);
    });
  } catch (err) {
    console.error('WS upgrade error:', err);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
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

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close();
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});