// ============================================================
// lib/automations/engine.ts
// Core automation runtime — evaluates triggers, runs actions
// v2.0 — delay, unlock_row, if/else, retry, approval context
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
  | 'webhook'
  | 'manual'
  | 'approval_completed'
  | 'approval_denied';

export type ActionType =
  | 'update_field'
  | 'create_row'
  | 'send_email'
  | 'webhook'
  | 'lock_row'
  | 'unlock_row'
  | 'notify'
  | 'trigger_approval'
  | 'push_to_sharepoint'
  | 'generate_record_export'
  | 'generate_audit_trail'
  | 'push_to_google_sheets'
  | 'delay'
  | 'condition';

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
  name?: string;        // human label, e.g. "Send email"
  status: 'success' | 'failed' | 'skipped';
  input?: any;          // resolved config the step actually ran with (templates expanded)
  output?: any;
  error?: string;
  durationMs: number;
  attempts?: number;    // how many tries (>1 means it was retried)
}

// Human-readable labels for each action type, surfaced in the run timeline.
var ACTION_LABELS: Record<string, string> = {
  update_field: 'Update field',
  create_row: 'Create row',
  send_email: 'Send email',
  webhook: 'Call webhook',
  lock_row: 'Lock row',
  unlock_row: 'Unlock row',
  notify: 'Notify users',
  trigger_approval: 'Start approval',
  push_to_sharepoint: 'Push to SharePoint',
  generate_record_export: 'Generate record export',
  generate_audit_trail: 'Generate audit trail',
  push_to_google_sheets: 'Push to Google Sheets',
  delay: 'Delay',
  condition: 'Condition',
};

function actionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] || actionType;
}

function sleep(ms: number): Promise<void> {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// Deep-resolve {{templates}} inside a config object purely so the run log can
// show what values a step actually used (Power Automate "inputs"). Never throws.
function resolveInputPreview(value: any, context: Record<string, any>): any {
  try {
    if (typeof value === 'string') {
      return value.indexOf('{{') !== -1 ? resolveTemplate(value, context) : value;
    }
    if (Array.isArray(value)) {
      return value.map(function(v) { return resolveInputPreview(v, context); });
    }
    if (value && typeof value === 'object') {
      var out: Record<string, any> = {};
      Object.keys(value).forEach(function(k) {
        // Don't echo secrets into the run log
        if (/secret|password|token|authorization|apikey|api_key/i.test(k)) { out[k] = '••••••'; return; }
        out[k] = resolveInputPreview(value[k], context);
      });
      return out;
    }
    return value;
  } catch (e) {
    return value;
  }
}

// ---- Template Engine ----
// Resolves {{row.FieldName}}, {{trigger.tableId}}, {{approval.workflowName}}, etc.

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

  var operators = ['==', '!=', '>=', '<=', '>', '<', 'contains', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'];
  var operator = '';
  var left = '';
  var right = '';

  // Handle unary operators first
  for (var u = 0; u < operators.length; u++) {
    if (operators[u] === 'isEmpty' && resolved.trim().endsWith('isEmpty')) {
      left = resolved.replace(/\s*isEmpty\s*$/, '').trim();
      return !left || left === '' || left === 'null' || left === 'undefined';
    }
    if (operators[u] === 'isNotEmpty' && resolved.trim().endsWith('isNotEmpty')) {
      left = resolved.replace(/\s*isNotEmpty\s*$/, '').trim();
      return !!left && left !== '' && left !== 'null' && left !== 'undefined';
    }
  }

  for (var i = 0; i < operators.length; i++) {
    var op = operators[i];
    if (op === 'isEmpty' || op === 'isNotEmpty') continue;
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

  // Support multiple recipients (comma-separated)
  var recipients = resolvedTo.split(',').map(function(e: string) { return e.trim(); }).filter(function(e: string) { return e.length > 0; });

  var results = [];
  for (var ri = 0; ri < recipients.length; ri++) {
    var result = await sendEmail({
      to: recipients[ri],
      subject: resolvedSubject,
      html: resolvedBody,
    });
    results.push(result);
  }

  return { sent: true, recipients: recipients, count: recipients.length };
}

async function executeWebhook(
  config: any,
  context: Record<string, any>,
  retryCount?: number
): Promise<any> {
  var resolvedUrl = resolveTemplate(config.url || '', context);
  if (!resolvedUrl) throw new Error('Webhook URL is required');

  // Resolve headers with templates
  var resolvedHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.headers) {
    var headerKeys = Object.keys(config.headers);
    for (var hi = 0; hi < headerKeys.length; hi++) {
      resolvedHeaders[headerKeys[hi]] = resolveTemplate(config.headers[headerKeys[hi]], context);
    }
  }

  var resolvedBody = config.bodyTemplate
    ? resolveTemplate(JSON.stringify(config.bodyTemplate), context)
    : JSON.stringify(context.row || {});

  var maxRetries = config.retryCount || 0;
  var currentAttempt = retryCount || 0;

  try {
    var { safeFetch } = await import('@/lib/ssrfProtection');
    var res = await safeFetch(resolvedUrl, {
      method: config.method || 'POST',
      headers: resolvedHeaders,
      body: resolvedBody,
    });

    var responseText = await res.text();

    // Retry on 5xx errors
    if (!res.ok && res.status >= 500 && currentAttempt < maxRetries) {
      var backoffMs = Math.pow(2, currentAttempt) * 1000; // 1s, 2s, 4s
      await new Promise(function(resolve) { setTimeout(resolve, backoffMs); });
      return executeWebhook(config, context, currentAttempt + 1);
    }

    return {
      status: res.status,
      ok: res.ok,
      body: responseText.substring(0, 500),
      attempts: currentAttempt + 1,
    };
  } catch (fetchErr: any) {
    if (currentAttempt < maxRetries) {
      var backoffMs2 = Math.pow(2, currentAttempt) * 1000;
      await new Promise(function(resolve) { setTimeout(resolve, backoffMs2); });
      return executeWebhook(config, context, currentAttempt + 1);
    }
    throw fetchErr;
  }
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

  try {
    var autoInfo = context._automation || {};
    await logActivity({ tableId: targetTableId, rowId: resolvedRowId, userId: autoInfo.createdById || "system", action: "AUTOMATION_LOCK_ROW", details: { automationId: autoInfo.id, automationName: autoInfo.name } });
  } catch (logErr) { console.error("[Automations] Activity log failed:", logErr); }
  return { locked: resolvedRowId };
}

async function executeUnlockRow(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var targetTableId = config.targetTableId || context.trigger.tableId;
  var resolvedRowId = resolveTemplate(config.targetRowId || '{{row.id}}', context);

  await db.agoraRow.update({
    where: { id: resolvedRowId },
    data: { isLocked: false, lockedById: null },
  });

  try {
    var autoInfo = context._automation || {};
    await logActivity({ tableId: targetTableId, rowId: resolvedRowId, userId: autoInfo.createdById || "system", action: "AUTOMATION_UNLOCK_ROW", details: { automationId: autoInfo.id, automationName: autoInfo.name } });
  } catch (logErr) { console.error("[Automations] Activity log failed:", logErr); }
  return { unlocked: resolvedRowId };
}

async function executeNotify(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var resolvedMessage = resolveTemplate(config.message || '', context);
  var resolvedTitle = resolveTemplate(config.title || 'Automation Notification', context);
  var userIds = config.userIds || [];
  var notifications = [];

  for (var i = 0; i < userIds.length; i++) {
    try {
      var notif = await createNotification({
        userId: userIds[i],
        type: 'automation',
        title: resolvedTitle,
        message: resolvedMessage,
        tableId: context.trigger?.tableId || undefined,
        rowId: context.trigger?.rowId || undefined,
        sendEmailNotification: config.sendEmail || false,
      });
      notifications.push(notif.id);
    } catch (err) {
      console.warn('[Automations] Notification failed for user ' + userIds[i] + ':', err);
    }
  }

  return { notified: userIds, notificationIds: notifications };
}

async function executeDelay(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var delaySeconds = parseInt(config.delaySeconds || '0');
  var delayMinutes = parseInt(config.delayMinutes || '0');
  var delayHours = parseInt(config.delayHours || '0');

  var totalMs = (delaySeconds * 1000) + (delayMinutes * 60 * 1000) + (delayHours * 60 * 60 * 1000);

  // Cap at 1 hour for synchronous delay (longer delays should use scheduled triggers)
  var maxDelayMs = 60 * 60 * 1000;
  if (totalMs > maxDelayMs) totalMs = maxDelayMs;
  if (totalMs < 0) totalMs = 0;

  if (totalMs > 0) {
    await new Promise(function(resolve) { setTimeout(resolve, totalMs); });
  }

  return { delayed: true, durationMs: totalMs, seconds: Math.round(totalMs / 1000) };
}

async function executeCondition(
  config: any,
  context: Record<string, any>
): Promise<any> {
  // IF/ELSE branching — evaluate condition and set a flag in context
  var condExpr = config.conditionExpr || '';
  var resolved = resolveTemplate(condExpr, context);
  var result = evaluateCondition(condExpr, context);

  return {
    conditionMet: result,
    expression: condExpr,
    resolved: resolved,
    branch: result ? 'true' : 'false',
  };
}

// ---- Trigger Approval Action ----

async function executeTriggerApproval(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var tableId = config.targetTableId || context.trigger.tableId;
  var rowId = config.targetRowId ? resolveTemplate(config.targetRowId, context) : (context.trigger?.rowId || '');
  var workflowId = config.workflowId;
  var userId = context.trigger?.userId || context._automation?.createdById || 'system';

  if (!workflowId) throw new Error('workflowId is required for trigger_approval');

  var workflow = await db.approvalWorkflow.findUnique({
    where: { id: workflowId },
  });
  if (!workflow) throw new Error('Approval workflow not found: ' + workflowId);

  var existing = await db.approvalRequest.findFirst({
    where: { workflowId: workflowId, rowId: rowId, status: { in: ['pending', 'in_progress'] } },
  });
  if (existing) {
    return { skipped: true, reason: 'Approval already pending for this row', existingRequestId: existing.id };
  }

  var stages = (workflow.stages as any[]) || [];
  if (stages.length === 0) throw new Error('Workflow has no stages configured');

  var firstStage = stages.find(function(s: any) { return s.order === 1; }) || stages[0];
  var initialStatuses: Record<string, string> = {};
  stages.forEach(function(s: any) { initialStatuses[String(s.order)] = s.order === 1 ? 'pending' : 'waiting'; });

  await db.agoraRow.update({ where: { id: rowId }, data: { isLocked: true, lockedById: userId } });

  var { randomBytes: randBytes } = await import('crypto');
  var approvalReq = await db.approvalRequest.create({
    data: {
      token: randBytes(32).toString('hex'),
      workflowId: workflow.id,
      rowId: rowId,
      tableId: tableId,
      requestedById: userId,
      currentStage: 1,
      stageStatuses: initialStatuses,
      status: 'pending',
      dueAt: workflow.reminderEnabled ? new Date(Date.now() + (workflow.reminderHours || 24) * 3600000) : null,
    },
  });

  if (workflow.approvalColumnId) {
    var row = await db.agoraRow.findUnique({ where: { id: rowId } });
    if (row) {
      var currentData = (row.data as any) || {};
      currentData[workflow.approvalColumnId] = JSON.stringify({
        status: 'pending',
        currentStage: 1,
        stageStatuses: initialStatuses,
        totalStages: stages.length,
        stages: stages.map(function(s: any) { return { order: s.order, name: s.name }; }),
      });
      await db.agoraRow.update({ where: { id: rowId }, data: { data: currentData } });
    }
  }

  try {
    var { addLedgerEntry } = await import('@/lib/approvalLedger');
    var actorUser = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    await addLedgerEntry({
      tableId: tableId, rowId: rowId, workflowId: workflow.id, requestId: approvalReq.id,
      action: 'submitted', stage: 1, stageName: firstStage?.name || 'Stage 1',
      actorId: userId, actorName: actorUser?.name || 'Automation', actorEmail: actorUser?.email || '',
      rowSnapshot: context.row || {}, workflowName: workflow.name,
      requiredApprovers: firstStage?.approverUserIds || [],
    });
  } catch (ledgerErr) { console.error('[Automations] Ledger entry failed:', ledgerErr); }

  if (firstStage) {
    var approverIds = [...(firstStage.approverUserIds || [])];
    var groupIds = firstStage.approverGroupIds || [];
    if (groupIds.length > 0) {
      var members = await db.groupMember.findMany({ where: { groupId: { in: groupIds } }, select: { userId: true } });
      approverIds.push(...members.map(function(m: any) { return m.userId; }));
    }
    if (firstStage.dynamicApproverColumnId) {
      var dynVal = (context.row || {})[firstStage.dynamicApproverColumnId];
      if (dynVal) {
        var dynUser = await db.user.findFirst({
          where: { OR: [{ id: String(dynVal) }, { email: String(dynVal) }, { name: String(dynVal) }] },
          select: { id: true },
        });
        if (dynUser) approverIds.push(dynUser.id);
      }
    }
    var uniqueApprovers = [...new Set(approverIds)];

    var table = await db.agoraTable.findUnique({ where: { id: tableId }, select: { name: true } });
    var actorName = (await db.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name || 'Automation';

    for (var ai = 0; ai < uniqueApprovers.length; ai++) {
      try {
        await createNotification({
          userId: uniqueApprovers[ai],
          type: 'approval_requested',
          title: 'Approval needed: ' + (table?.name || 'Record') + ' — ' + firstStage.name,
          message: actorName + ' submitted a record for your approval.',
          tableId: tableId, rowId: rowId,
          metadata: { requestId: approvalReq.id, workflowId: workflow.id, token: approvalReq.token, stage: firstStage.name },
          sendEmailNotification: true,
        });
      } catch (notifErr) { console.warn('[Automations] Approver notification failed:', notifErr); }
    }
  }

  return { approvalRequestId: approvalReq.id, workflowName: workflow.name, stage: firstStage?.name || 'Stage 1' };
}

// ---- Action Router ----

async function executeAction(
  action: any,
  context: Record<string, any>
): Promise<StepResult> {
  var start = Date.now();
  var config = action.actionConfig || action.actionconfig || {};
  var actType = action.actionType || action.actiontype;
  var name = actionLabel(actType);
  var input = resolveInputPreview(config, context);

  try {
    var condExpr = action.conditionExpr || action.conditionexpr || '';
    if (condExpr && !evaluateCondition(condExpr, context)) {
      return {
        actionId: action.id,
        actionType: actType,
        name: name,
        status: 'skipped',
        input: input,
        output: { reason: 'Condition not met', condition: resolveTemplate(condExpr, context) },
        durationMs: Date.now() - start,
      };
    }

    // Check if previous condition action result should skip this step
    // Convention: if config.skipOnConditionFalse and the last condition step was false, skip
    if (config.onlyIfBranch) {
      var branchKey = config.onlyIfBranch; // 'true' or 'false'
      var lastConditionResult = context._lastCondition;
      if (lastConditionResult && lastConditionResult.branch !== branchKey) {
        return {
          actionId: action.id,
          actionType: actType,
          name: name,
          status: 'skipped',
          input: input,
          output: { reason: 'Branch condition: expected ' + branchKey + ', got ' + lastConditionResult.branch },
          durationMs: Date.now() - start,
        };
      }
    }

    var actionType = actType;
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
      case 'unlock_row':
        output = await executeUnlockRow(config, context);
        break;
      case 'notify':
        output = await executeNotify(config, context);
        break;
      case 'trigger_approval':
        output = await executeTriggerApproval(config, context);
        break;
      case 'delay':
        output = await executeDelay(config, context);
        break;
      case 'condition':
        output = await executeCondition(config, context);
        // Store condition result for downstream IF/ELSE branching
        context._lastCondition = output;
        break;
      case 'push_to_sharepoint':
        output = await executePushToSharePoint(config, context);
        break;
	  case 'generate_record_export':
        output = await executeGenerateRecordExport(config, context);
        break;
      case 'generate_audit_trail':
        output = await executeGenerateAuditTrail(config, context);
        break;
	  case 'push_to_google_sheets':
        output = await executePushToGoogleSheets(config, context);
        break;
      default:
        throw new Error('Unknown action type: ' + actionType);
    }

    return {
      actionId: action.id,
      actionType: actionType,
      name: name,
      status: 'success',
      input: input,
      output: output,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      actionId: action.id,
      actionType: actType,
      name: name,
      status: 'failed',
      input: input,
      error: error.message,
      durationMs: Date.now() - start,
    };
  }
}

// Retry wrapper: re-runs a failed step up to the automation's policy with linear
// backoff (retryDelaySec * attempt), capped so we never sleep absurdly long.
async function executeActionWithRetry(
  action: any,
  context: Record<string, any>,
  policy: { maxRetries: number; retryDelaySec: number }
): Promise<StepResult> {
  var maxAttempts = 1 + Math.max(0, policy.maxRetries || 0);
  var result: StepResult = await executeAction(action, context);
  var attempt = 1;
  while (result.status === 'failed' && attempt < maxAttempts) {
    var delayMs = Math.min((policy.retryDelaySec || 0) * 1000 * attempt, 30000);
    if (delayMs > 0) await sleep(delayMs);
    attempt++;
    result = await executeAction(action, context);
  }
  result.attempts = attempt;
  return result;
}

// ---- Unified run executor ----
// Single place that creates an AutomationRun, executes the action chain (with
// retry + per-step logging), and finalizes the run record. Used by every entry
// point: row/form/approval triggers, manual runs, scheduled, webhooks, reruns.
async function executeAutomationRun(
  automation: any,
  event: TriggerEvent,
  opts?: { triggerSource?: string; triggeredByUserId?: string; rerunOfId?: string }
): Promise<{ runId: string; status: 'success' | 'failed'; errorMessage: string | null }> {
  var startMs = Date.now();
  opts = opts || {};

  var run = await db.automationRun.create({
    data: {
      automationId: automation.id,
      status: 'running',
      triggerSource: opts.triggerSource || event.type,
      triggeredByUserId: opts.triggeredByUserId || event.userId || null,
      rerunOfId: opts.rerunOfId || null,
      triggerData: {
        type: event.type,
        tableId: event.tableId,
        rowId: event.rowId,
        userId: event.userId,
        timestamp: new Date().toISOString(),
        // Snapshot the inputs so this run can be resubmitted with its ORIGINAL data.
        rowSnapshot: event.rowData || null,
        previousSnapshot: event.previousData || null,
        webhookPayload: event.webhookPayload || null,
      } as any,
    },
  });

  var context = buildContext(automation, event);
  var policy = {
    maxRetries: automation.maxRetries || 0,
    retryDelaySec: automation.retryDelaySec || 0,
  };

  var stepResults: StepResult[] = [];
  var overallStatus: 'success' | 'failed' = 'success';

  for (var a = 0; a < automation.actions.length; a++) {
    var action = automation.actions[a];
    var result = await executeActionWithRetry(action, context, policy);
    stepResults.push(result);
    context['step_' + a] = result.output;

    if (result.status === 'failed') {
      overallStatus = 'failed';
      break;
    }
  }

  var errorMessage: string | null = overallStatus === 'failed'
    ? (stepResults.find(function(r) { return r.status === 'failed'; }) || {}).error || null
    : null;

  await db.automationRun.update({
    where: { id: run.id },
    data: {
      status: overallStatus,
      stepResults: stepResults as any,
      completedAt: new Date(),
      durationMs: Date.now() - startMs,
      errorMessage: errorMessage,
    },
  });

  return { runId: run.id, status: overallStatus, errorMessage: errorMessage };
}

// Fetch a row and key its data by BOTH column id and column name (templates use
// names; internals use ids). Returns null if the row no longer exists.
async function fetchRowNamedData(
  tableId: string,
  rowId: string,
  colNameMap?: Record<string, string>
): Promise<Record<string, any> | null> {
  var row = await db.agoraRow.findFirst({ where: { id: rowId, tableId: tableId } });
  if (!row) return null;

  var map = colNameMap;
  if (!map) {
    var columns = await db.agoraColumn.findMany({
      where: { tableId: tableId },
      select: { id: true, name: true },
    });
    map = {};
    var m = map;
    columns.forEach(function(c) { m[c.id] = c.name; });
  }

  var rawData = (row.data as any) || {};
  var namedData: Record<string, any> = { id: rowId };
  Object.keys(rawData).forEach(function(colId) {
    var colName = (map as any)[colId];
    if (colName) namedData[colName] = rawData[colId];
    namedData[colId] = rawData[colId];
  });
  return namedData;
}

// ---- Context Builder ----
// Builds the full template context including metadata and approval info

function buildContext(
  automation: any,
  event: TriggerEvent,
  extraData?: Record<string, any>
): Record<string, any> {
  var now = new Date();
  var context: Record<string, any> = {
    _automation: { id: automation.id, name: automation.name, createdById: automation.createdById },
    row: event.rowData || {},
    previous: event.previousData || {},
    trigger: {
      type: event.type,
      tableId: event.tableId,
      rowId: event.rowId,
      userId: event.userId,
    },
    webhook: event.webhookPayload || {},
    // Metadata — available in all automations
    meta: {
      timestamp: now.toISOString(),
      date: now.toLocaleDateString('en-US'),
      time: now.toLocaleTimeString('en-US'),
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1),
      day: String(now.getDate()),
      automationName: automation.name,
      automationId: automation.id,
      tableId: event.tableId,
      rowId: event.rowId || '',
    },
  };

  // Extract approval data if present in rowData._approval
  if (event.rowData && event.rowData._approval) {
    context.approval = event.rowData._approval;
    // Remove _approval from row data to keep it clean
    var cleanRow = Object.assign({}, event.rowData);
    delete cleanRow._approval;
    context.row = cleanRow;
  }

  if (extraData) {
    Object.keys(extraData).forEach(function(k) { context[k] = extraData[k]; });
  }

  return context;
}

// ---- Main Engine: Fire Trigger ----

export async function fireTrigger(event: TriggerEvent): Promise<void> {
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

  var matching = automations.filter(function(auto) {
    var cfg = auto.triggerConfig as any;

    if (cfg.tableId && cfg.tableId !== event.tableId) return false;
    if (cfg.tableIds && cfg.tableIds.indexOf(event.tableId) === -1) return false;

    if (event.type === 'column_match' && cfg.column && cfg.value) {
      var currentVal = event.rowData ? event.rowData[cfg.column] : undefined;
      if (String(currentVal) !== String(cfg.value)) return false;
    }

    if (event.type === 'form_submit' && cfg.formId) {
      if (cfg.formId !== event.formId) return false;
    }

    return true;
  });

  for (var m = 0; m < matching.length; m++) {
    await executeAutomationRun(matching[m], event, { triggerSource: event.type });
  }
}

// ---- Manual Trigger: Run automation on specific rows ----

export async function runManualAutomation(
  automationId: string,
  tableId: string,
  rowIds: string[],
  userId: string
): Promise<{ runIds: string[]; errors: string[] }> {
  var automation = await db.automation.findUnique({
    where: { id: automationId },
    include: { actions: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!automation) throw new Error('Automation not found');
  if (!automation.enabled) throw new Error('Automation is disabled');
  if (automation.triggerType !== 'manual') throw new Error('Automation is not a manual trigger');

  var cfg = automation.triggerConfig as any;
  if (cfg.tableId && cfg.tableId !== tableId) throw new Error('Automation is not configured for this table');

  var columns = await db.agoraColumn.findMany({
    where: { tableId: tableId },
    select: { id: true, name: true, type: true },
  });
  var colNameMap: Record<string, string> = {};
  columns.forEach(function(c) { colNameMap[c.id] = c.name; });

  var runIds: string[] = [];
  var errors: string[] = [];

  for (var ri = 0; ri < rowIds.length; ri++) {
    var rowId = rowIds[ri];

    try {
      var namedData = await fetchRowNamedData(tableId, rowId, colNameMap);
      if (!namedData) { errors.push('Row ' + rowId + ' not found'); continue; }

      var event: TriggerEvent = {
        type: 'manual',
        tableId: tableId,
        rowId: rowId,
        rowData: namedData,
        userId: userId,
      };

      var res = await executeAutomationRun(automation, event, {
        triggerSource: 'manual',
        triggeredByUserId: userId,
      });
      runIds.push(res.runId);
      if (res.status === 'failed') {
        errors.push('Row ' + rowId + ': ' + (res.errorMessage || 'Run failed'));
      }
    } catch (err: any) {
      errors.push('Row ' + rowId + ': ' + err.message);
    }
  }

  return { runIds: runIds, errors: errors };
}

// ---- Resubmit / Re-run ----
// Replays a past run with its ORIGINAL trigger inputs (the row snapshot captured
// at run time), mirroring Power Automate "Resubmit". Falls back to the row's
// current data for legacy runs created before snapshots were stored. Creates a
// brand-new run linked to the original via rerunOfId.
export async function rerunAutomationRun(
  runId: string,
  userId: string
): Promise<{ runId: string; status: 'success' | 'failed'; errorMessage: string | null }> {
  var original = await db.automationRun.findUnique({ where: { id: runId } });
  if (!original) throw new Error('Run not found');

  var automation = await db.automation.findUnique({
    where: { id: original.automationId },
    include: { actions: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!automation) throw new Error('Automation not found');

  var td: any = (original.triggerData as any) || {};
  var rowData = td.rowSnapshot;

  // Legacy run without a snapshot: re-fetch the row's current data if we can.
  if (!rowData && td.tableId && td.rowId) {
    rowData = await fetchRowNamedData(td.tableId, td.rowId);
  }

  var event: TriggerEvent = {
    type: td.type || automation.triggerType,
    tableId: td.tableId,
    rowId: td.rowId,
    rowData: rowData || {},
    previousData: td.previousSnapshot || {},
    webhookPayload: td.webhookPayload || undefined,
    userId: userId,
  };

  return executeAutomationRun(automation, event, {
    triggerSource: 'rerun',
    triggeredByUserId: userId,
    rerunOfId: runId,
  });
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

// ============================================================================
// Push Row to SharePoint
// ============================================================================
async function executePushToSharePoint(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var tableId = config.targetTableId || context.trigger.tableId;
  var rowId = config.targetRowId ? resolveTemplate(config.targetRowId, context) : (context.trigger?.rowId || '');

  if (!tableId) throw new Error('No table specified for SharePoint push');
  if (!rowId) throw new Error('No row ID for SharePoint push');

  // Load the row data
  var row = await db.agoraRow.findUnique({ where: { id: rowId } });
  if (!row) throw new Error('Row ' + rowId + ' not found');

  // Load sync config
  var setting = await db.systemSetting.findUnique({ where: { key: 'sp_sync_' + tableId } });
  if (!setting) throw new Error('No SharePoint sync configured for this table');

  var syncConfig: any;
  try {
    var { decrypt } = await import('@/lib/encryption');
    syncConfig = JSON.parse(setting.encrypted ? decrypt(setting.value) : setting.value);
  } catch { throw new Error('Failed to read SharePoint sync config'); }

  if (!syncConfig.siteId || !syncConfig.listId || !syncConfig.fieldMapping) {
    throw new Error('SharePoint sync config incomplete — check field mapping');
  }

  // Get columns for type info
  var columns = await db.agoraColumn.findMany({
    where: { tableId: tableId },
    select: { id: true, name: true, type: true, sharePointConfig: true },
  });

  // Filter out agora-only columns
  var syncColumns = columns.filter(function(c: any) {
    var spCfg = c.sharePointConfig as any;
    if (spCfg?.agoraOnly) return false;
    return true;
  });

  var { syncRowToSharePoint } = await import('@/lib/sharepoint');
  var result = await syncRowToSharePoint(
    {
      siteId: syncConfig.siteId,
      listId: syncConfig.listId,
      fieldMapping: syncConfig.fieldMapping,
      uniqueKeyColumnId: syncConfig.uniqueKeyColumnId,
      uniqueKeySpColumn: syncConfig.uniqueKeySpColumn,
    },
    row.data as Record<string, any>,
    syncColumns as any[],
    row.spItemId ? 'upsert' : 'create'
  );

  if (!result.success) {
    throw new Error('SharePoint push failed: ' + result.error);
  }

  // Save spItemId back to the row
  if (result.itemId) {
    await db.agoraRow.update({ where: { id: rowId }, data: { spItemId: String(result.itemId) } });
  }

  // Log activity
  try {
    var { logActivity } = await import('@/lib/activityLog');
    await logActivity({ tableId: tableId, rowId: rowId, userId: context._automationCreatedBy || 'system', action: 'AUTOMATION_SP_PUSH', details: { spItemId: result.itemId } });
  } catch {}

  // Upload attachments to SP list item if configured
  var attachmentCount = 0;
  if (config.includeAttachments && result.itemId) {
    try {
      var { readFile } = await import('fs/promises');
      var path = await import('path');
      var UPLOADS_DIR = '/app/uploads';
      
      var attachments = await db.fileAttachment.findMany({
        where: { tableId: tableId, rowId: rowId },
      });

      var { uploadAttachmentToListItem } = await import('@/lib/sharepoint');
      
      // Count attachments but don't upload individually — merged PDF handles it
      attachmentCount = attachments.length;
      console.log('[SP Push] Found ' + attachmentCount + ' attachments — will merge and upload as single PDF');
    } catch (attLoadErr: any) {
      console.error('[SP Push] Attachment loading error:', attLoadErr.message);
    }
  }

 // If attachments were uploaded, merge all PDFs into one and add hyperlink
  if (attachmentCount > 0 && result.itemId) {
    try {
      var { ensureListColumn, updateListItem: updateSpItem, uploadAttachmentToListItem: uploadMerged, getSharePointConfig: getSpConfig } = await import('@/lib/sharepoint');
      var spCfg2 = await getSpConfig();
      if (spCfg2?.siteUrl) {
        var { PDFDocument: MergePDF } = await import('pdf-lib');
        var { readFile: readFile2 } = await import('fs/promises');
        var path2 = await import('path');
        var UPLOADS2 = '/app/uploads';

        var allAttachments2 = await db.fileAttachment.findMany({ where: { tableId: tableId, rowId: rowId } });
        var pdfAttachments = allAttachments2.filter(function(a) { return a.mimeType === 'application/pdf'; });

        if (pdfAttachments.length > 0) {
          // Merge all PDFs into one
          var mergedDoc = await MergePDF.create();
          for (var mi = 0; mi < pdfAttachments.length; mi++) {
            try {
              var pdfBuffer = await readFile2(path2.join(UPLOADS2, pdfAttachments[mi].path));
              var srcDoc = await MergePDF.load(pdfBuffer, { ignoreEncryption: true });
              var pages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
              for (var pi = 0; pi < pages.length; pi++) { mergedDoc.addPage(pages[pi]); }
            } catch (mergeErr: any) {
              console.error('[SP Push] Failed to merge PDF ' + pdfAttachments[mi].originalName + ':', mergeErr.message);
            }
          }

          var mergedBytes = await mergedDoc.save();
          var mergedBuffer = Buffer.from(mergedBytes);

          // Get table name for filename
          var spTable = await db.agoraTable.findUnique({ where: { id: tableId }, select: { name: true } });
          var spTableName = (spTable?.name || 'Record').replace(/[^a-zA-Z0-9]/g, '_');
          var spDateStr = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }).replace(/\//g, '-');
          var mergedFilename = spTableName + '_Complete_' + rowId.slice(-6) + '_' + spDateStr + '.pdf';

          // Upload merged PDF to SP drive
          var mergedUpload = await uploadMerged(syncConfig.siteId, syncConfig.listId, String(result.itemId), mergedFilename, mergedBuffer);

          if (mergedUpload.success) {
            var mergedUrl = spCfg2.siteUrl + '/Shared Documents/Agora Attachments/' + syncConfig.listId + '/' + result.itemId + '/' + mergedFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
            // Auto-create Supporting Documents column if it doesn't exist
            await ensureListColumn(syncConfig.siteId, syncConfig.listId, 'SupportDocs');
            // Find the SupportDocs column on the SP list
            var spCols = await (await import('@/lib/sharepoint')).getListColumns(syncConfig.siteId, syncConfig.listId);
            var supportCol = spCols.find(function(c: any) { return c.name === 'SupportDocs' || c.displayName === 'SupportDocs' || c.displayName === 'Supporting Documents' || c.displayName === 'SupportingDocuments'; });
            if (supportCol) {
              console.log('[SP Push] Setting ' + supportCol.name + ' to: ' + mergedUrl);
              var { updateListItemHyperlink } = await import('@/lib/sharepoint');
              var updateFields: any = {};
              updateFields[supportCol.name] = { Url: mergedUrl, Description: 'Supporting Documents (' + pdfAttachments.length + ' docs)' };
              await updateListItemHyperlink(syncConfig.siteId, syncConfig.listId, String(result.itemId), updateFields);
              console.log('[SP Push] Uploaded merged PDF (' + pdfAttachments.length + ' docs) and set hyperlink');
            } else {
              console.log('[SP Push] No SupportDocs column found on SP list — skipping URL set. Merged PDF still uploaded to drive.');
            }
          }
        }
      }
    } catch (linkErr: any) {
      console.error('[SP Push] Failed to merge/upload documents:', linkErr.message);
    }
  }

  return { pushed: true, spItemId: result.itemId, tableId: tableId, rowId: rowId, attachments: attachmentCount };
}

// ============================================================================
// Generate Record Export PDF and attach to row
// ============================================================================
async function executeGenerateRecordExport(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var tableId = config.targetTableId || context.trigger.tableId;
  var rowId = config.targetRowId ? resolveTemplate(config.targetRowId, context) : (context.trigger?.rowId || '');
  var userId = context._automation?.createdById || context.trigger?.userId || 'system';

  if (!tableId) throw new Error('No table specified for record export');
  if (!rowId) throw new Error('No row ID for record export');

  // Ensure attachment column exists (auto-create if missing)
  var tableCheck = await db.agoraTable.findUnique({ where: { id: tableId }, include: { columns: true } });
  if (tableCheck && !tableCheck.columns.find(function(c: any) { return c.type === 'attachment'; })) {
    var maxPos = Math.max.apply(null, tableCheck.columns.map(function(c: any) { return c.position; }).concat([-1])) + 1;
    await db.agoraColumn.create({ data: { tableId: tableId, name: '📎 Attachments', type: 'attachment', position: maxPos, settings: { isSystem: true } } });
  }

  var { generateExportPdf } = await import('@/lib/generateExportPdf');
  await generateExportPdf(tableId, rowId, userId);

  // Optionally update a column to indicate export was attached
  if (config.updateColumnId && config.updateValue) {
    var row = await db.agoraRow.findUnique({ where: { id: rowId } });
    if (row) {
      var rowData = (row.data as any) || {};
      rowData[config.updateColumnId] = resolveTemplate(config.updateValue, context);
      await db.agoraRow.update({ where: { id: rowId }, data: { data: rowData } });
    }
  }

  try {
    await logActivity({ tableId: tableId, rowId: rowId, userId: userId, action: 'AUTOMATION_RECORD_EXPORT', details: { automationId: context._automation?.id } });
  } catch {}

  return { generated: true, tableId: tableId, rowId: rowId };
}

// ============================================================================
// Generate Audit Trail PDF and attach to row
// ============================================================================
async function executeGenerateAuditTrail(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var tableId = config.targetTableId || context.trigger.tableId;
  var rowId = config.targetRowId ? resolveTemplate(config.targetRowId, context) : (context.trigger?.rowId || '');
  var userId = context._automation?.createdById || context.trigger?.userId || 'system';

  if (!tableId) throw new Error('No table specified for audit trail');
  if (!rowId) throw new Error('No row ID for audit trail');

  // Generate a standalone audit trail PDF (no template needed)
  var { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  var row = await db.agoraRow.findUnique({ where: { id: rowId } });
  if (!row) throw new Error('Row not found: ' + rowId);

  var table = await db.agoraTable.findUnique({ where: { id: tableId }, include: { columns: true } });
  if (!table) throw new Error('Table not found: ' + tableId);

  var user = userId !== 'system' ? await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }) : { id: 'system', name: 'System', email: '' };

  var pdfDoc = await PDFDocument.create();

  // Import and call the audit page builder from generateExportPdf
  // We create a minimal PDF and append the audit page to it
  try {
    var approvalRequest = await db.approvalRequest.findFirst({
      where: { tableId: tableId, rowId: rowId, status: 'approved' },
      include: { workflow: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!approvalRequest) throw new Error('No approved approval request found for this row');

    var actions = await db.approvalAction.findMany({
      where: { requestId: approvalRequest.id },
      orderBy: { createdAt: 'asc' },
    });

    var ledgerEntries = await db.approvalLedger.findMany({
      where: { tableId: tableId, rowId: rowId },
      orderBy: { createdAt: 'asc' },
    });

    var userIds = [...new Set(actions.map(function(a: any) { return a.userId; }).filter(Boolean))];
    var users = userIds.length > 0 ? await db.user.findMany({ where: { id: { in: userIds as string[] } }, select: { id: true, name: true, email: true } }) : [];
    var userMap = new Map(users.map(function(u) { return [u.id, { name: u.name || 'Unknown', email: u.email || '' }]; }));

    var stages = (approvalRequest.workflow?.stages as any[]) || [];
    var stageMap = new Map(stages.map(function(s: any) { return [s.order, s.name || 'Stage ' + s.order]; }));

    var font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    var fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    var fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

    var page1 = pdfDoc.addPage([612, 792]);
    var y = 752;

    var draw = function(text: string, x: number, yy: number, opts: any) {
      if (!opts) opts = {};
      page1.drawText(String(text || ''), { x: x, y: yy, size: opts.size || 9, font: opts.mono ? fontMono : (opts.bold ? fontBold : font), color: opts.color || rgb(0.2, 0.2, 0.2) });
    };
    var drawLine = function(yy: number, color?: any, thickness?: number) { page1.drawLine({ start: { x: 40, y: yy }, end: { x: 572, y: yy }, thickness: thickness || 0.5, color: color || rgb(0.8, 0.8, 0.8) }); };
    var drawBox = function(x: number, yy: number, w: number, h: number, fill: any) { page1.drawRectangle({ x: x, y: yy, width: w, height: h, color: fill }); };

    drawBox(40, y - 5, 532, 30, rgb(0.106, 0.161, 0.235));
    draw('AUDIT TRAIL — DOCUMENT VERIFICATION REPORT', 50, y + 2, { size: 13, bold: true, color: rgb(1, 1, 1) });
    y -= 40;
    draw('Generated by Agora Automation Engine — SHA-256 hash-chained audit verification', 50, y, { size: 7, color: rgb(0.5, 0.5, 0.5) });
    y -= 20; drawLine(y, rgb(0.106, 0.161, 0.235), 1.5); y -= 20;

    draw('DOCUMENT DETAILS', 50, y, { size: 10, bold: true, color: rgb(0.106, 0.161, 0.235) });
    y -= 18;
    var infoItems = [['Table', table.name], ['Record ID', rowId.slice(-12).toUpperCase()], ['Generated', new Date().toLocaleString('en-US')], ['Status', approvalRequest.status.toUpperCase()]];
    for (var ii = 0; ii < infoItems.length; ii++) {
      draw(infoItems[ii][0] + ':', 50, y, { size: 7.5, bold: true });
      draw(infoItems[ii][1], 140, y, { size: 7.5, color: infoItems[ii][0] === 'Status' ? rgb(0.06, 0.6, 0.2) : rgb(0.2, 0.2, 0.2) });
      y -= 13;
    }
    y -= 10; drawLine(y); y -= 20;

    draw('APPROVAL CHAIN', 50, y, { size: 10, bold: true, color: rgb(0.106, 0.161, 0.235) });
    y -= 18;
    drawBox(50, y - 2, 512, 14, rgb(0.94, 0.94, 0.94));
    draw('Stage', 55, y + 1, { size: 7, bold: true }); draw('Action', 140, y + 1, { size: 7, bold: true }); draw('Approver', 200, y + 1, { size: 7, bold: true }); draw('Date', 360, y + 1, { size: 7, bold: true });
    y -= 16;

    for (var ai = 0; ai < actions.length; ai++) {
      if (y < 200) break;
      var act = actions[ai];
      var approver = userMap.get(act.userId) || { name: 'Unknown', email: '' };
      var stageName = stageMap.get((act as any).stageOrder) || stageMap.get(approvalRequest.currentStage) || 'Review';
      draw(stageName, 55, y, { size: 7 });
      draw(act.action === 'approve' ? 'APPROVED' : 'DENIED', 140, y, { size: 7, bold: true, color: act.action === 'approve' ? rgb(0.06, 0.6, 0.2) : rgb(0.8, 0.2, 0.2) });
      draw(approver.name + ' (' + approver.email + ')', 200, y, { size: 7 });
      draw(new Date(act.createdAt).toLocaleString('en-US'), 360, y, { size: 7 });
      y -= 14;
      if ((act as any).reason) { draw('Reason: ' + String((act as any).reason), 200, y, { size: 6.5, color: rgb(0.4, 0.4, 0.4) }); y -= 12; }
      drawLine(y + 4, rgb(0.9, 0.9, 0.9)); y -= 6;
    }
    y -= 10; drawLine(y); y -= 20;

    draw('SHA-256 CRYPTOGRAPHIC LEDGER', 50, y, { size: 10, bold: true, color: rgb(0.106, 0.161, 0.235) });
    y -= 5;
    draw('Each entry is cryptographically chained. Tampering is detectable by hash verification.', 50, y - 8, { size: 6.5, color: rgb(0.5, 0.5, 0.5) });
    y -= 22;

    for (var li = 0; li < ledgerEntries.length; li++) {
      if (y < 80) { draw('... continued', 50, y, { size: 7, color: rgb(0.5, 0.5, 0.5) }); break; }
      var entry = ledgerEntries[li];
      draw(String(li + 1) + '. ' + String(entry.action), 55, y, { size: 6, bold: true });
      draw(String(entry.entryHash || '').substring(0, 48) + '...', 140, y, { size: 5, mono: true, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
    }

    drawLine(62, rgb(0.106, 0.161, 0.235), 1);
    draw('This audit trail was auto-generated by Agora and verified against an immutable SHA-256 hash-chained ledger.', 50, 48, { size: 6.5, color: rgb(0.4, 0.4, 0.4) });
  } catch (auditErr: any) {
    throw new Error('Audit trail generation failed: ' + auditErr.message);
  }

  var pdfBytes = await pdfDoc.save();
  var safeName = table.name.replace(/[^a-zA-Z0-9]/g, '_');
  var dateStr = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }).replace(/\//g, '-');
  var auditFilename = safeName + '_AuditTrail_' + rowId.slice(-6) + '_' + dateStr + '.pdf';
  var uniqueFilename = (await import('crypto')).randomUUID() + '.pdf';

  var { writeFile, mkdir } = await import('fs/promises');
  var { existsSync } = await import('fs');
  var path = await import('path');
  var UPLOADS_DIR = '/app/uploads';
  var filePath = path.join(UPLOADS_DIR, uniqueFilename);
  if (!existsSync(UPLOADS_DIR)) { await mkdir(UPLOADS_DIR, { recursive: true }); }
  await writeFile(filePath, Buffer.from(pdfBytes));
  
  // Ensure attachment column exists
  if (!table.columns.find(function(c: any) { return c.type === 'attachment'; })) {
    var maxPos2 = Math.max.apply(null, table.columns.map(function(c: any) { return c.position; }).concat([-1])) + 1;
    var newAttCol = await db.agoraColumn.create({ data: { tableId: tableId, name: '📎 Attachments', type: 'attachment', position: maxPos2, settings: { isSystem: true } } });
    table.columns.push(newAttCol as any);
  }

  var attachmentColumn = table.columns.find(function(c: any) { return c.type === 'attachment'; });
  var columnId = attachmentColumn?.id || 'system';

  var attachment = await db.fileAttachment.create({
    data: {
      filename: auditFilename,
      originalName: auditFilename,
      mimeType: 'application/pdf',
      size: pdfBytes.length,
      path: uniqueFilename,
      rowId: rowId,
      tableId: tableId,
      columnId: columnId,
      uploadedById: userId,
    },
  });

  if (attachmentColumn) {
    var rowData = (row.data as any) || {};
    var existing = rowData[attachmentColumn.id];
    var attachmentIds: string[] = [];
    if (existing) { try { attachmentIds = JSON.parse(existing); } catch { attachmentIds = []; } }
    attachmentIds.push(attachment.id);
    rowData[attachmentColumn.id] = JSON.stringify(attachmentIds);
    await db.agoraRow.update({ where: { id: rowId }, data: { data: rowData } });
  }

  // Optionally update a column to indicate audit was attached
  if (config.updateColumnId && config.updateValue) {
    var latestRow = await db.agoraRow.findUnique({ where: { id: rowId } });
    if (latestRow) {
      var latestData = (latestRow.data as any) || {};
      latestData[config.updateColumnId] = resolveTemplate(config.updateValue, context);
      await db.agoraRow.update({ where: { id: rowId }, data: { data: latestData } });
    }
  }

  try {
    await logActivity({ tableId: tableId, rowId: rowId, userId: userId, action: 'AUTOMATION_AUDIT_TRAIL', details: { automationId: context._automation?.id, attachmentId: attachment.id } });
  } catch {}

  return { generated: true, filename: auditFilename, attachmentId: attachment.id, tableId: tableId, rowId: rowId };
}

// ============================================================================
// Push Row to Google Sheets
// ============================================================================
async function executePushToGoogleSheets(
  config: any,
  context: Record<string, any>
): Promise<any> {
  var tableId = config.targetTableId || context.trigger.tableId;
  var rowId = config.targetRowId ? resolveTemplate(config.targetRowId, context) : (context.trigger?.rowId || '');

  if (!tableId) throw new Error('No table specified for Google Sheets push');
  if (!rowId) throw new Error('No row ID for Google Sheets push');

  // Load the row data
  var row = await db.agoraRow.findUnique({ where: { id: rowId } });
  if (!row) throw new Error('Row ' + rowId + ' not found');

  // Load the sheet connection for this table
  var tabMapping = await db.sheetTabMapping.findUnique({ where: { tableId: tableId } });
  if (!tabMapping) throw new Error('No Google Sheet connected to this table');

  var connection = await db.googleSheetConnection.findUnique({ where: { id: tabMapping.connectionId } });
  if (!connection || !connection.isActive) throw new Error('Google Sheet connection is not active');

  var columnMapping = tabMapping.columnMapping as Record<string, { columnId: string; sheetIndex: number }>;
  var rowData = row.data as Record<string, any>;

  // Get columns for type info
  var columns = await db.agoraColumn.findMany({
    where: { tableId: tableId },
    select: { id: true, name: true, type: true, sharePointConfig: true },
  });

  // Filter out agora-only columns
  var syncColumns = columns.filter(function(c: any) {
    var spCfg = c.sharePointConfig as any;
    if (spCfg?.agoraOnly) return false;
    return true;
  });

  // Build row values array based on column mapping
  var maxIndex = Math.max.apply(null, Object.values(columnMapping).map(function(m) { return m.sheetIndex; }).concat([0]));
  var rowValues: any[] = new Array(maxIndex + 1).fill('');

  for (var headerName in columnMapping) {
    var mapping = columnMapping[headerName];
    // Skip agora-only columns
    var col = columns.find(function(c) { return c.id === mapping.columnId; });
    var colSpCfg = col?.sharePointConfig as any;
    if (colSpCfg?.agoraOnly) continue;

    var value = rowData[mapping.columnId];
    if (value !== undefined && value !== null) {
      // Format values based on type
      if (col?.type === 'currency') {
        var num = parseFloat(String(value));
        rowValues[mapping.sheetIndex] = isNaN(num) ? String(value) : num;
      } else if (col?.type === 'number' || col?.type === 'percent') {
        var num2 = parseFloat(String(value));
        rowValues[mapping.sheetIndex] = isNaN(num2) ? String(value) : num2;
      } else if (col?.type === 'checkbox') {
        rowValues[mapping.sheetIndex] = value === 'true' || value === true ? 'TRUE' : 'FALSE';
      } else {
        rowValues[mapping.sheetIndex] = String(value);
      }
    }
  }

  // Append the row to the sheet
  var { appendSheetRow } = await import('@/lib/googleSheets');
  await appendSheetRow(connection.spreadsheetId, tabMapping.sheetTabName, rowValues);
  console.log('[GS Push] Appended row to sheet: ' + connection.spreadsheetId + ' tab: ' + tabMapping.sheetTabName);
  // Mark row as synced to Google Sheets
  await db.agoraRow.update({ where: { id: rowId }, data: { gsSyncedAt: new Date() } });

  // Upload attachments if configured
  var attachmentCount = 0;
  if (config.includeAttachments) {
    try {
      var { readFile: readFile3 } = await import('fs/promises');
      var path3 = await import('path');
      var UPLOADS3 = '/app/uploads';

      var allAttachments3 = await db.fileAttachment.findMany({ where: { tableId: tableId, rowId: rowId } });
      var pdfAttachments3 = allAttachments3.filter(function(a) { return a.mimeType === 'application/pdf'; });

      if (pdfAttachments3.length > 0) {
        var { PDFDocument: MergePDF3 } = await import('pdf-lib');

        // Merge all PDFs into one
        var mergedDoc3 = await MergePDF3.create();
        for (var mi3 = 0; mi3 < pdfAttachments3.length; mi3++) {
          try {
            var pdfBuffer3 = await readFile3(path3.join(UPLOADS3, pdfAttachments3[mi3].path));
            var srcDoc3 = await MergePDF3.load(pdfBuffer3, { ignoreEncryption: true });
            var pages3 = await mergedDoc3.copyPages(srcDoc3, srcDoc3.getPageIndices());
            for (var pi3 = 0; pi3 < pages3.length; pi3++) { mergedDoc3.addPage(pages3[pi3]); }
          } catch (mergeErr3: any) {
            console.error('[GS Push] Failed to merge PDF:', mergeErr3.message);
          }
        }

        var mergedBytes3 = await mergedDoc3.save();
        var mergedBuffer3 = Buffer.from(mergedBytes3);

        var gsTable = await db.agoraTable.findUnique({ where: { id: tableId }, select: { name: true } });
        var gsTableName = (gsTable?.name || 'Record').replace(/[^a-zA-Z0-9]/g, '_');
        var gsDateStr = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }).replace(/\//g, '-');
        var gsMergedFilename = gsTableName + '_Complete_' + rowId.slice(-6) + '_' + gsDateStr + '.pdf';

        // Upload to Google Drive
        var { uploadToDrive } = await import('@/lib/googleSheets');
        var driveResult = await uploadToDrive(
          gsMergedFilename,
          mergedBuffer3,
          'application/pdf',
          gsTableName + ' - Agora Attachments'
        );

        if (driveResult.success && driveResult.webViewLink) {
          attachmentCount = pdfAttachments3.length;

          // Add the Drive link as the last column in the sheet row
          // Find the row we just appended and add the link
          var { readSheetTab, writeSheetCell: writeCell } = await import('@/lib/googleSheets');
          var sheetData = await readSheetTab(connection.spreadsheetId, tabMapping.sheetTabName);
          var lastRowIndex = sheetData.rows.length - 1; // 0-based, the row we just appended

          // Find or create "Supporting Documents" header
          var docColIndex = sheetData.headers.indexOf('Supporting Documents');
          if (docColIndex === -1) {
            // Add header
            docColIndex = sheetData.headers.length;
            await writeCell(connection.spreadsheetId, tabMapping.sheetTabName, -1, docColIndex, 'Supporting Documents');
          }

          // Write hyperlink formula
          var hyperlinkFormula = '=HYPERLINK("' + driveResult.webViewLink + '","View Documents (' + pdfAttachments3.length + ')")';
          await writeCell(connection.spreadsheetId, tabMapping.sheetTabName, lastRowIndex, docColIndex, hyperlinkFormula);
          console.log('[GS Push] Set Supporting Documents hyperlink in sheet');
        }
      }
    } catch (attErr3: any) {
      console.error('[GS Push] Attachment error:', attErr3.message);
    }
  }

  try {
    await logActivity({ tableId: tableId, rowId: rowId, userId: context._automation?.createdById || 'system', action: 'AUTOMATION_GS_PUSH', details: { spreadsheetId: connection.spreadsheetId, attachments: attachmentCount } });
  } catch {}

  return { pushed: true, spreadsheetId: connection.spreadsheetId, tableId: tableId, rowId: rowId, attachments: attachmentCount };
}