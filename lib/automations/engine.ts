// ============================================================
// lib/automations/engine.ts
// Core automation runtime — evaluates triggers, runs actions
// ============================================================

import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { logActivity } from '@/lib/activityLog';

// ---- Types ----

export type TriggerType =
  | 'row_created'
  | 'row_updated'
  | 'row_deleted'
  | 'column_match'
  | 'form_submit'
  | 'scheduled'
  | 'webhook';

export type ActionType =
  | 'update_field'
  | 'create_row'
  | 'send_email'
  | 'webhook'
  | 'lock_row'
  | 'notify';

export interface TriggerEvent {
  type: TriggerType;
  tableId: string;
  rowId?: string;
  rowData?: Record<string, any>;
  previousData?: Record<string, any>;
  webhookPayload?: any;
  formId?: string;
  userId?: string;
}

interface StepResult {
  actionId: string;
  actionType: string;
  status: 'success' | 'failed' | 'skipped';
  output?: any;
  error?: string;
  durationMs: number;
}

// ---- Template Engine ----
// Resolves {{row.FieldName}}, {{trigger.tableId}}, etc.

export function resolveTemplate(
  template: string,
  context: Record<string, any>
): string {
  return template.replace(/\{\{(.+?)\}\}/g, function(_, path) {
    var keys = path.trim().split('.');
    var value: any = context;
    for (var i = 0; i < keys.length; i++) {
      if (value == null) return '';
      value = value[keys[i]];
    }
    return value != null ? String(value) : '';
  });
}

// ---- Condition Evaluator ----

export function evaluateCondition(
  expr: string,
  context: Record<string, any>
): boolean {
  if (!expr || expr.trim() === '') return true;

  var resolved = resolveTemplate(expr, context);

  var operators = ['==', '!=', '>=', '<=', '>', '<', 'contains', 'startsWith', 'endsWith'];
  var operator = '';
  var left = '';
  var right = '';

  for (var i = 0; i < operators.length; i++) {
    var op = operators[i];
    var idx = resolved.indexOf(' ' + op + ' ');
    if (idx !== -1) {
      operator = op;
      left = resolved.substring(0, idx).trim();
      right = resolved.substring(idx + op.length + 2).trim();
      break;
    }
  }

  if (!operator) return true;

  function strip(v: string) { return v.replace(/^['"]|['"]$/g, ''); }
  left = strip(left);
  right = strip(right);

  switch (operator) {
    case '==':  return left === right;
    case '!=':  return left !== right;
    case '>':   return Number(left) > Number(right);
    case '<':   return Number(left) < Number(right);
    case '>=':  return Number(left) >= Number(right);
    case '<=':  return Number(left) <= Number(right);
    case 'contains':    return left.includes(right);
    case 'startsWith':  return left.startsWith(right);
    case 'endsWith':    return left.endsWith(right);
    default: return true;
  }
}

// ---- Action Executors ----

async function executeUpdateField(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var targetTableId = config.targetTableId || context.trigger.tableId;
  var resolvedRowId = resolveTemplate(config.targetRowId || '{{row.id}}', context);

  var updates: Record<string, any> = {};
  var mappings = config.fieldMappings || [];
  for (var i = 0; i < mappings.length; i++) {
    updates[mappings[i].column] = resolveTemplate(mappings[i].value, context);
  }

  var row = await db.agoraRow.findFirst({
    where: { id: resolvedRowId, tableId: targetTableId },
  });
  if (!row) throw new Error('Row ' + resolvedRowId + ' not found in table ' + targetTableId);

  var existingData = (row.data as any) || {};
  var merged = Object.assign({}, existingData, updates);

  await db.agoraRow.update({
    where: { id: resolvedRowId },
    data: { data: merged },
  });


  // Log activity
  try {
    var autoInfo = context._automation || {};
    await logActivity({ tableId: targetTableId, rowId: resolvedRowId, userId: autoInfo.createdById || "system", action: "AUTOMATION_UPDATE", details: { automationId: autoInfo.id, automationName: autoInfo.name, fields: updates } });
  } catch (logErr) { console.error("[Automations] Activity log failed:", logErr); }
  return { updated: resolvedRowId, fields: updates };
}

async function executeCreateRow(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var targetTableId = config.targetTableId;
  if (!targetTableId) throw new Error('targetTableId is required for create_row');

  var rowData: Record<string, any> = {};
  var mappings = config.fieldMappings || [];
  for (var i = 0; i < mappings.length; i++) {
    rowData[mappings[i].column] = resolveTemplate(mappings[i].value, context);
  }

  var maxRow = await db.agoraRow.findFirst({
    where: { tableId: targetTableId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  var position = (maxRow?.position ?? -1) + 1;

  var newRow = await db.agoraRow.create({
    data: {
      tableId: targetTableId,
      data: rowData,
      position: position,
    },
  });


  // Log activity
  try {
    var autoInfo = context._automation || {};
    await logActivity({ tableId: targetTableId, rowId: newRow.id, userId: autoInfo.createdById || "system", action: "AUTOMATION_CREATE_ROW", details: { automationId: autoInfo.id, automationName: autoInfo.name, data: rowData } });
  } catch (logErr) { console.error("[Automations] Activity log failed:", logErr); }
  return { createdRowId: newRow.id, data: rowData };
}

async function executeSendEmail(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var resolvedTo = resolveTemplate(config.to || '', context);
  var resolvedSubject = resolveTemplate(config.subject || '', context);
  var resolvedBody = resolveTemplate(config.body || '', context);

  if (!resolvedTo) throw new Error('Email "to" is required');

  var result = await sendEmail({
    to: resolvedTo,
    subject: resolvedSubject,
    html: resolvedBody,
  });

  return result;
}

async function executeWebhook(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var resolvedUrl = resolveTemplate(config.url || '', context);
  if (!resolvedUrl) throw new Error('Webhook URL is required');

  var resolvedBody = config.bodyTemplate
    ? resolveTemplate(JSON.stringify(config.bodyTemplate), context)
    : JSON.stringify(context.row || {});

  var res = await fetch(resolvedUrl, {
    method: config.method || 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      config.headers || {}
    ),
    body: resolvedBody,
  });

  var responseText = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    body: responseText.substring(0, 500),
  };
}

async function executeLockRow(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var targetTableId = config.targetTableId || context.trigger.tableId;
  var resolvedRowId = resolveTemplate(config.targetRowId || '{{row.id}}', context);

  await db.agoraRow.update({
    where: { id: resolvedRowId },
    data: { isLocked: true },
  });


  // Log activity
  try {
    var autoInfo = context._automation || {};
    await logActivity({ tableId: targetTableId, rowId: resolvedRowId, userId: autoInfo.createdById || "system", action: "AUTOMATION_LOCK_ROW", details: { automationId: autoInfo.id, automationName: autoInfo.name } });
  } catch (logErr) { console.error("[Automations] Activity log failed:", logErr); }
  return { locked: resolvedRowId };
}

async function executeNotify(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var resolvedMessage = resolveTemplate(config.message || '', context);
  var userIds = config.userIds || [];
  var notifications = [];

  for (var i = 0; i < userIds.length; i++) {
    try {
      var notif = await createNotification({
        userId: userIds[i],
        type: 'automation',
        title: 'Automation Notification',
        message: resolvedMessage,
        tableId: context.trigger?.tableId || undefined,
        rowId: context.trigger?.rowId || undefined,
        sendEmailNotification: false,
      });
      notifications.push(notif.id);
    } catch (err) {
      console.warn('[Automations] Notification failed for user ' + userIds[i] + ':', err);
    }
  }

  return { notified: userIds, notificationIds: notifications };
}

// ---- Action Router ----

async function executeAction(
  action: any,
  context: Record<string, any>
): Promise<StepResult> {
  var start = Date.now();
  var config = action.actionConfig || action.actionConfig || {};

  try {
    // Check condition
    var condExpr = action.conditionExpr || action.conditionExpr || '';
    if (condExpr && !evaluateCondition(condExpr, context)) {
      return {
        actionId: action.id,
        actionType: action.actionType || action.actionType,
        status: 'skipped',
        output: { reason: 'Condition not met' },
        durationMs: Date.now() - start,
      };
    }

    var actionType = action.actionType || action.actionType;
    var output: any;

    switch (actionType) {
      case 'update_field':
        output = await executeUpdateField(config, context);
        break;
      case 'create_row':
        output = await executeCreateRow(config, context);
        break;
      case 'send_email':
        output = await executeSendEmail(config, context);
        break;
      case 'webhook':
        output = await executeWebhook(config, context);
        break;
      case 'lock_row':
        output = await executeLockRow(config, context);
        break;
      case 'notify':
        output = await executeNotify(config, context);
        break;
      default:
        throw new Error('Unknown action type: ' + actionType);
    }

    return {
      actionId: action.id,
      actionType: actionType,
      status: 'success',
      output: output,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      actionId: action.id,
      actionType: action.actionType || action.actionType,
      status: 'failed',
      error: error.message,
      durationMs: Date.now() - start,
    };
  }
}

// ---- Main Engine: Fire Trigger ----

export async function fireTrigger(event: TriggerEvent): Promise<void> {
  // Find all enabled automations matching this trigger type
  var automations = await db.automation.findMany({
    where: {
      enabled: true,
      triggerType: event.type,
    },
    include: {
      actions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  // Filter by table match in triggerConfig
  var matching = automations.filter(function(auto) {
    var cfg = auto.triggerConfig as any;

    if (cfg.tableId && cfg.tableId !== event.tableId) return false;
    if (cfg.tableIds && cfg.tableIds.indexOf(event.tableId) === -1) return false;

    // Column match trigger: check column condition
    if (event.type === 'column_match' && cfg.column && cfg.value) {
      var currentVal = event.rowData ? event.rowData[cfg.column] : undefined;
      if (String(currentVal) !== String(cfg.value)) return false;
    }

    // Form submit trigger: check formId
    if (event.type === 'form_submit' && cfg.formId) {
      if (cfg.formId !== event.formId) return false;
    }

    return true;
  });

  // Execute each matching automation
  for (var m = 0; m < matching.length; m++) {
    var automation = matching[m];

    // Create run record
    var run = await db.automationRun.create({
      data: {
        automationId: automation.id,
        status: 'running',
        triggerData: {
          type: event.type,
          tableId: event.tableId,
          rowId: event.rowId,
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Build context for template resolution
    // Store automation info for activity logging
    var context: Record<string, any> = {
      _automation: { id: automation.id, name: automation.name, createdById: automation.createdById },
      row: event.rowData || {},
      previous: event.previousData || {},
      trigger: {
        type: event.type,
        tableId: event.tableId,
        rowId: event.rowId,
      },
      webhook: event.webhookPayload || {},
    };

    // Execute actions in order
    var stepResults: StepResult[] = [];
    var overallStatus: 'success' | 'failed' = 'success';

    for (var a = 0; a < automation.actions.length; a++) {
      var action = automation.actions[a];
      var result = await executeAction(action, context);
      stepResults.push(result);

      // Add action output to context for downstream actions
      context['step_' + a] = result.output;

      if (result.status === 'failed') {
        overallStatus = 'failed';
        break;
      }
    }

    // Update run record
    await db.automationRun.update({
      where: { id: run.id },
      data: {
        status: overallStatus,
        stepResults: stepResults as any,
        completedAt: new Date(),
        errorMessage: overallStatus === 'failed'
          ? (stepResults.find(function(r) { return r.status === 'failed'; }) || {}).error || null
          : null,
      },
    });
  }
}

// ---- Webhook Handler ----

export async function handleWebhookTrigger(
  slug: string,
  payload: any
): Promise<{ automationId: string; runId: string } | null> {
  var automation = await db.automation.findFirst({
    where: { webhookSlug: slug, enabled: true },
    include: { actions: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!automation) return null;

  var cfg = automation.triggerConfig as any;

  await fireTrigger({
    type: 'webhook',
    tableId: cfg.tableId || '',
    rowData: payload,
    webhookPayload: payload,
  });

  var latestRun = await db.automationRun.findFirst({
    where: { automationId: automation.id },
    orderBy: { startedAt: 'desc' },
  });

  return latestRun
    ? { automationId: automation.id, runId: latestRun.id }
    : null;
}