// =============================================================================
// AGORA MAINTENANCE SERVICE
// Zero-touch cleanup daemon that runs alongside the app
// Light daily cleanup + heavy weekly cleanup
// =============================================================================

const cron = require('node-cron');
const { Client } = require('pg');
const { execSync } = require('child_process');
const fs = require('fs');

// =============================================================================
// CONFIG
// =============================================================================

const CONFIG = {
  // Data retention (in days)
  NOTIFICATION_RETENTION_DAYS: 90,       // Delete read notifications older than 90 days
  UNREAD_NOTIFICATION_MAX_DAYS: 180,     // Delete even unread notifications after 180 days
  ACTIVITY_LOG_RETENTION_DAYS: 21,       // Match your existing 3-week retention
  AUDIT_LOG_RETENTION_DAYS: 365,         // Keep audit logs for 1 year
  EXPIRED_SESSION_BUFFER_HOURS: 24,      // Clean sessions expired more than 24h ago
  PASSWORD_RESET_RETENTION_DAYS: 7,      // Clean used/expired password reset tokens
  APPROVAL_LEDGER_RETENTION_DAYS: 0,     // 0 = keep forever (immutable audit trail)

  // Docker cleanup
  DOCKER_SOCKET: '/var/run/docker.sock',

  // Logging
  LOG_DIR: '/var/log/agora-maintenance',

  // Schedules (cron syntax)
  DAILY_SCHEDULE: '0 3 * * *',          // 3:00 AM daily
  WEEKLY_SCHEDULE: '0 4 * * 0',         // 4:00 AM Sunday
  HEALTHCHECK_SCHEDULE: '*/30 * * * *', // Every 30 minutes
};

// Override config from environment
if (process.env.NOTIFICATION_RETENTION_DAYS) CONFIG.NOTIFICATION_RETENTION_DAYS = parseInt(process.env.NOTIFICATION_RETENTION_DAYS);
if (process.env.ACTIVITY_LOG_RETENTION_DAYS) CONFIG.ACTIVITY_LOG_RETENTION_DAYS = parseInt(process.env.ACTIVITY_LOG_RETENTION_DAYS);
if (process.env.AUDIT_LOG_RETENTION_DAYS) CONFIG.AUDIT_LOG_RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS);
if (process.env.DAILY_SCHEDULE) CONFIG.DAILY_SCHEDULE = process.env.DAILY_SCHEDULE;
if (process.env.WEEKLY_SCHEDULE) CONFIG.WEEKLY_SCHEDULE = process.env.WEEKLY_SCHEDULE;

// =============================================================================
// LOGGING
// =============================================================================

function ensureLogDir() {
  if (!fs.existsSync(CONFIG.LOG_DIR)) {
    fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
  }
}

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, message, ...(data && { data }) };
  const line = JSON.stringify(entry);

  // Console output (Docker logs)
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }

  // File output (persistent)
  try {
    ensureLogDir();
    const logFile = `${CONFIG.LOG_DIR}/maintenance.log`;
    fs.appendFileSync(logFile, line + '\n');

    // Rotate log if > 10MB
    const stats = fs.statSync(logFile);
    if (stats.size > 10 * 1024 * 1024) {
      const rotated = `${CONFIG.LOG_DIR}/maintenance.${Date.now()}.log`;
      fs.renameSync(logFile, rotated);
      // Keep only last 3 rotated logs
      cleanOldLogs();
    }
  } catch (err) {
    // Don't crash if logging fails
    console.error(`Log write failed: ${err.message}`);
  }
}

function cleanOldLogs() {
  try {
    const files = fs.readdirSync(CONFIG.LOG_DIR)
      .filter(f => f.startsWith('maintenance.') && f.endsWith('.log') && f !== 'maintenance.log')
      .sort()
      .reverse();

    // Keep only 3 most recent
    files.slice(3).forEach(f => {
      fs.unlinkSync(`${CONFIG.LOG_DIR}/${f}`);
    });
  } catch (err) {
    // Ignore cleanup errors
  }
}

// =============================================================================
// DATABASE CONNECTION
// =============================================================================

function getDbClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
  });
}

async function withDb(fn) {
  const client = getDbClient();
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

// =============================================================================
// DAILY CLEANUP TASKS
// =============================================================================

async function cleanExpiredSessions(client) {
  const bufferHours = CONFIG.EXPIRED_SESSION_BUFFER_HOURS;
  const result = await client.query(
    `DELETE FROM sessions WHERE expires < NOW() - INTERVAL '${bufferHours} hours'`
  );
  return result.rowCount;
}

async function cleanOldNotifications(client) {
  // Delete read notifications older than retention period
  const readResult = await client.query(
    `DELETE FROM notifications 
     WHERE "isRead" = true 
     AND "createdAt" < NOW() - INTERVAL '${CONFIG.NOTIFICATION_RETENTION_DAYS} days'`
  );

  // Delete even unread notifications after max retention
  const unreadResult = await client.query(
    `DELETE FROM notifications 
     WHERE "createdAt" < NOW() - INTERVAL '${CONFIG.UNREAD_NOTIFICATION_MAX_DAYS} days'`
  );

  return { read: readResult.rowCount, unread: unreadResult.rowCount };
}

async function cleanActivityLogs(client) {
  const result = await client.query(
    `DELETE FROM table_activities 
     WHERE "createdAt" < NOW() - INTERVAL '${CONFIG.ACTIVITY_LOG_RETENTION_DAYS} days'`
  );
  return result.rowCount;
}

async function cleanAuditLogs(client) {
  if (CONFIG.AUDIT_LOG_RETENTION_DAYS === 0) return 0; // Keep forever
  const result = await client.query(
    `DELETE FROM audit_logs 
     WHERE "createdAt" < NOW() - INTERVAL '${CONFIG.AUDIT_LOG_RETENTION_DAYS} days'`
  );
  return result.rowCount;
}

async function cleanPasswordResetTokens(client) {
  const result = await client.query(
    `DELETE FROM password_reset_tokens 
     WHERE (used = true OR expires < NOW()) 
     AND "createdAt" < NOW() - INTERVAL '${CONFIG.PASSWORD_RESET_RETENTION_DAYS} days'`
  );
  return result.rowCount;
}

async function cleanExpiredVerificationTokens(client) {
  const result = await client.query(
    `DELETE FROM verification_tokens WHERE expires < NOW()`
  );
  return result.rowCount;
}

async function cleanOrphanedApprovalRequests(client) {
  // Clean approval requests where the row no longer exists
  const result = await client.query(
    `DELETE FROM approval_requests ar
     WHERE NOT EXISTS (
       SELECT 1 FROM agora_rows r WHERE r.id = ar."rowId"
     )`
  );
  return result.rowCount;
}

async function vacuumLight(client) {
  // VACUUM without FULL — non-blocking, reclaims dead tuples
  await client.query('VACUUM');
  return true;
}

// =============================================================================
// WEEKLY CLEANUP TASKS
// =============================================================================

async function vacuumAnalyze(client) {
  // Full VACUUM ANALYZE — updates planner statistics + reclaims space
  // This runs table by table to avoid locking the whole DB
  const tables = [
    'sessions', 'notifications', 'table_activities', 'audit_logs',
    'approval_requests', 'approval_actions', 'approval_ledger',
    'row_comments', 'linked_records', 'agora_rows', 'password_reset_tokens'
  ];

  const results = {};
  for (const table of tables) {
    try {
      await client.query(`VACUUM ANALYZE ${table}`);
      results[table] = 'ok';
    } catch (err) {
      results[table] = err.message;
    }
  }
  return results;
}

async function getDbStats(client) {
  // Get database size
  const sizeResult = await client.query(
    `SELECT pg_size_pretty(pg_database_size(current_database())) as db_size`
  );

  // Get table sizes (top 10)
  const tableResult = await client.query(`
    SELECT 
      schemaname || '.' || tablename as table_name,
      pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size,
      pg_total_relation_size(schemaname || '.' || tablename) as raw_size
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
    LIMIT 15
  `);

  // Get row counts for key tables
  const countResult = await client.query(`
    SELECT 
      'sessions' as table_name, COUNT(*) as count FROM sessions
    UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
    UNION ALL SELECT 'table_activities', COUNT(*) FROM table_activities
    UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs
    UNION ALL SELECT 'approval_ledger', COUNT(*) FROM approval_ledger
    UNION ALL SELECT 'agora_rows', COUNT(*) FROM agora_rows
    UNION ALL SELECT 'row_comments', COUNT(*) FROM row_comments
    UNION ALL SELECT 'linked_records', COUNT(*) FROM linked_records
    UNION ALL SELECT 'users', COUNT(*) FROM users
    UNION ALL SELECT 'agora_tables', COUNT(*) FROM agora_tables
    ORDER BY count DESC
  `);

  return {
    databaseSize: sizeResult.rows[0].db_size,
    tableSizes: tableResult.rows,
    rowCounts: countResult.rows,
  };
}

function getDockerStats() {
  try {
    // Check if Docker socket is available
    if (!fs.existsSync(CONFIG.DOCKER_SOCKET)) {
      return { available: false, reason: 'Docker socket not mounted' };
    }

    const dfOutput = execSync('docker system df --format "{{json .}}"', {
      timeout: 30000,
      encoding: 'utf-8',
    });

    const lines = dfOutput.trim().split('\n').map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    return { available: true, usage: lines };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

function pruneDocker() {
  try {
    if (!fs.existsSync(CONFIG.DOCKER_SOCKET)) {
      return { pruned: false, reason: 'Docker socket not mounted' };
    }

    // Prune dangling images (not all images — just untagged ones)
    const imageResult = execSync('docker image prune -f 2>&1', {
      timeout: 60000,
      encoding: 'utf-8',
    });

    // Prune stopped containers
    const containerResult = execSync('docker container prune -f 2>&1', {
      timeout: 60000,
      encoding: 'utf-8',
    });

    // Prune unused volumes (NOT the active postgres-data volume)
    const volumeResult = execSync('docker volume prune -f 2>&1', {
      timeout: 60000,
      encoding: 'utf-8',
    });

    // Prune build cache older than 7 days
    const cacheResult = execSync('docker builder prune -f --filter "until=168h" 2>&1', {
      timeout: 120000,
      encoding: 'utf-8',
    });

    return {
      pruned: true,
      images: imageResult.trim(),
      containers: containerResult.trim(),
      volumes: volumeResult.trim(),
      buildCache: cacheResult.trim(),
    };
  } catch (err) {
    return { pruned: false, reason: err.message };
  }
}

// =============================================================================
// CONTAINER LOG SIZE MANAGEMENT
// =============================================================================

function checkContainerLogSizes() {
  try {
    if (!fs.existsSync(CONFIG.DOCKER_SOCKET)) return null;

    // Get container log file paths and sizes
    const output = execSync(
      'docker ps --format "{{.Names}}" | while read name; do ' +
      'LOG=$(docker inspect --format="{{.LogPath}}" "$name" 2>/dev/null); ' +
      'if [ -f "$LOG" ]; then SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0); ' +
      'echo "$name|$LOG|$SIZE"; fi; done',
      { timeout: 30000, encoding: 'utf-8' }
    );

    return output.trim().split('\n').filter(Boolean).map(line => {
      const [name, path, size] = line.split('|');
      return { name, path, sizeMB: Math.round(parseInt(size || 0) / 1024 / 1024 * 100) / 100 };
    });
  } catch {
    return null;
  }
}

// =============================================================================
// JOB RUNNERS
// =============================================================================

async function runDailyCleanup() {
  const startTime = Date.now();
  log('INFO', '=== DAILY CLEANUP STARTING ===');

  const results = {};

  try {
    await withDb(async (client) => {
      results.expiredSessions = await cleanExpiredSessions(client);
      log('INFO', `Cleaned ${results.expiredSessions} expired sessions`);

      results.notifications = await cleanOldNotifications(client);
      log('INFO', `Cleaned notifications`, results.notifications);

      results.activityLogs = await cleanActivityLogs(client);
      log('INFO', `Cleaned ${results.activityLogs} old activity log entries`);

      results.auditLogs = await cleanAuditLogs(client);
      log('INFO', `Cleaned ${results.auditLogs} old audit log entries`);

      results.passwordResetTokens = await cleanPasswordResetTokens(client);
      log('INFO', `Cleaned ${results.passwordResetTokens} expired password reset tokens`);

      results.verificationTokens = await cleanExpiredVerificationTokens(client);
      log('INFO', `Cleaned ${results.verificationTokens} expired verification tokens`);

      results.orphanedApprovals = await cleanOrphanedApprovalRequests(client);
      log('INFO', `Cleaned ${results.orphanedApprovals} orphaned approval requests`);

      results.vacuum = await vacuumLight(client);
      log('INFO', 'Light VACUUM completed');
    });
  } catch (err) {
    log('ERROR', 'Daily cleanup failed', { error: err.message, stack: err.stack });
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  log('INFO', `=== DAILY CLEANUP COMPLETE (${duration}s) ===`, results);
}

async function runWeeklyCleanup() {
  const startTime = Date.now();
  log('INFO', '=== WEEKLY CLEANUP STARTING ===');

  const results = {};

  // Run daily cleanup first
  await runDailyCleanup();

  try {
    // Database maintenance
    await withDb(async (client) => {
      results.vacuumAnalyze = await vacuumAnalyze(client);
      log('INFO', 'VACUUM ANALYZE completed', results.vacuumAnalyze);

      results.dbStats = await getDbStats(client);
      log('INFO', 'Database stats collected', results.dbStats);
    });
  } catch (err) {
    log('ERROR', 'Weekly DB maintenance failed', { error: err.message });
  }

  try {
    // Docker cleanup
    results.dockerPrune = pruneDocker();
    log('INFO', 'Docker prune completed', results.dockerPrune);

    results.dockerStats = getDockerStats();
    log('INFO', 'Docker stats collected', results.dockerStats);

    results.containerLogs = checkContainerLogSizes();
    if (results.containerLogs) {
      log('INFO', 'Container log sizes', results.containerLogs);
    }
  } catch (err) {
    log('ERROR', 'Weekly Docker cleanup failed', { error: err.message });
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  log('INFO', `=== WEEKLY CLEANUP COMPLETE (${duration}s) ===`, results);
}

async function runHealthCheck() {
  try {
    await withDb(async (client) => {
      const result = await client.query('SELECT 1 as ok');
      if (result.rows[0].ok !== 1) throw new Error('DB health check failed');
    });
    // Don't log every healthcheck to avoid noise — only log failures
  } catch (err) {
    log('ERROR', 'Health check failed — database unreachable', { error: err.message });
  }
}

// =============================================================================
// STARTUP & SCHEDULING
// =============================================================================

async function main() {
  log('INFO', '========================================');
  log('INFO', 'Agora Maintenance Service Starting');
  log('INFO', '========================================');
  log('INFO', 'Configuration', {
    dailySchedule: CONFIG.DAILY_SCHEDULE,
    weeklySchedule: CONFIG.WEEKLY_SCHEDULE,
    notificationRetention: `${CONFIG.NOTIFICATION_RETENTION_DAYS} days`,
    activityLogRetention: `${CONFIG.ACTIVITY_LOG_RETENTION_DAYS} days`,
    auditLogRetention: CONFIG.AUDIT_LOG_RETENTION_DAYS === 0 ? 'forever' : `${CONFIG.AUDIT_LOG_RETENTION_DAYS} days`,
    approvalLedgerRetention: 'forever (immutable)',
  });

  // Verify DB connection on startup
  try {
    await withDb(async (client) => {
      const result = await client.query('SELECT current_database() as db, pg_size_pretty(pg_database_size(current_database())) as size');
      log('INFO', 'Database connection verified', result.rows[0]);
    });
  } catch (err) {
    log('ERROR', 'Failed to connect to database on startup', { error: err.message });
    log('ERROR', 'Maintenance service will retry on next scheduled run');
  }

  // Schedule daily cleanup (3 AM)
  cron.schedule(CONFIG.DAILY_SCHEDULE, () => {
    runDailyCleanup().catch(err => {
      log('ERROR', 'Daily cleanup crashed', { error: err.message });
    });
  });
  log('INFO', `Daily cleanup scheduled: ${CONFIG.DAILY_SCHEDULE}`);

  // Schedule weekly cleanup (4 AM Sunday)
  cron.schedule(CONFIG.WEEKLY_SCHEDULE, () => {
    runWeeklyCleanup().catch(err => {
      log('ERROR', 'Weekly cleanup crashed', { error: err.message });
    });
  });
  log('INFO', `Weekly cleanup scheduled: ${CONFIG.WEEKLY_SCHEDULE}`);

  // Health check every 30 minutes
  cron.schedule(CONFIG.HEALTHCHECK_SCHEDULE, () => {
    runHealthCheck().catch(() => {});
  });

  // Run initial cleanup on first start (delayed 60s to let other services boot)
  setTimeout(() => {
    log('INFO', 'Running initial cleanup after startup...');
    runDailyCleanup().catch(err => {
      log('ERROR', 'Initial cleanup failed', { error: err.message });
    });
  }, 60000);

  log('INFO', 'Maintenance service is running. Waiting for scheduled tasks...');
}

main().catch(err => {
  console.error('Fatal error starting maintenance service:', err);
  process.exit(1);
});

// Keep process alive
process.on('SIGTERM', () => {
  log('INFO', 'Maintenance service shutting down (SIGTERM)');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('INFO', 'Maintenance service shutting down (SIGINT)');
  process.exit(0);
});