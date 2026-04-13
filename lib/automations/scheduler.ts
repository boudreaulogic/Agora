// ============================================================
// lib/automations/scheduler.ts
// Cron-based scheduled trigger runner
// Call checkScheduledAutomations() every minute from the cron API route
// ============================================================

import { db } from '@/lib/db';
import { fireTrigger } from './engine';

/**
 * Parse a simple cron expression and check if it matches now.
 * Format: minute hour dayOfMonth month dayOfWeek
 * Supports: * (wildcard), * /N (every N), comma-separated values
 */
function cronMatchesNow(cronExpr: string): boolean {
  var now = new Date();
  var parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  var fields = [
    now.getMinutes(),
    now.getHours(),
    now.getDate(),
    now.getMonth() + 1,
    now.getDay(),
  ];

  for (var i = 0; i < 5; i++) {
    var part = parts[i];
    if (part === '*') continue;

    if (part.indexOf('*/') === 0) {
      var interval = parseInt(part.substring(2), 10);
      if (isNaN(interval) || interval <= 0) return false;
      if (fields[i] % interval !== 0) return false;
      continue;
    }

    var values = part.split(',').map(function(v) { return parseInt(v, 10); });
    if (values.indexOf(fields[i]) === -1) return false;
  }

  return true;
}

/**
 * Check and fire all scheduled automations whose cron expression
 * matches the current time.
 */
export async function checkScheduledAutomations(): Promise<number> {
  var scheduledAutomations = await db.automation.findMany({
    where: {
      enabled: true,
      triggerType: 'scheduled',
    },
  });

  var fired = 0;

  for (var i = 0; i < scheduledAutomations.length; i++) {
    var automation = scheduledAutomations[i];
    var cfg = automation.triggerConfig as any;
    var cronExpr = cfg.cron || cfg.cronExpression;

    if (!cronExpr) continue;

    if (cronMatchesNow(cronExpr)) {
      console.log('[Scheduler] Firing automation "' + automation.name + '" (' + automation.id + ')');

      await fireTrigger({
        type: 'scheduled',
        tableId: cfg.tableId || '',
        rowData: { scheduledAt: new Date().toISOString() },
      });

      fired++;
    }
  }

  return fired;
}