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
  status: 'success' | 'failed' | 'skipped';
  output?: any;
  error?: string;
  durationMs: number;
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
  var rowId = resolveTemplate(config.targetRowId || '{{row.id}}', context);
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

  var approvalReq = await db.approvalRequest.create({
    data: {
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

  try {
    var condExpr = action.conditionExpr || action.conditionexpr || '';
    if (condExpr && !evaluateCondition(condExpr, context)) {
      return {
        actionId: action.id,
        actionType: action.actionType || action.actiontype,
        status: 'skipped',
        output: { reason: 'Condition not met' },
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
          actionType: action.actionType || action.actiontype,
          status: 'skipped',
          output: { reason: 'Branch condition: expected ' + branchKey + ', got ' + lastConditionResult.branch },
          durationMs: Date.now() - start,
        };
      }
    }

    var actionType = action.actionType || action.actiontype;
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
      actionType: action.actionType || action.actiontype,
      status: 'failed',
      error: error.message,
      durationMs: Date.now() - start,
    };
  }
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
    var automation = matching[m];

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

    var context = buildContext(automation, event);

    var stepResults: StepResult[] = [];
    var overallStatus: 'success' | 'failed' = 'success';

    for (var a = 0; a < automation.actions.length; a++) {
      var action = automation.actions[a];
      var result = await executeAction(action, context);
      stepResults.push(result);

      context['step_' + a] = result.output;

      if (result.status === 'failed') {
        overallStatus = 'failed';
        break;
      }
    }

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
      var row = await db.agoraRow.findFirst({
        where: { id: rowId, tableId: tableId },
      });
      if (!row) { errors.push('Row ' + rowId + ' not found'); continue; }

      var rawData = (row.data as any) || {};
      var namedData: Record<string, any> = { id: rowId };
      Object.keys(rawData).forEach(function(colId) {
        var colName = colNameMap[colId];
        if (colName) namedData[colName] = rawData[colId];
        namedData[colId] = rawData[colId];
      });

      var run = await db.automationRun.create({
        data: {
          automationId: automation.id,
          status: 'running',
          triggerData: {
            type: 'manual',
            tableId: tableId,
            rowId: rowId,
            userId: userId,
            timestamp: new Date().toISOString(),
          },
        },
      });
      runIds.push(run.id);

      var event: TriggerEvent = {
        type: 'manual',
        tableId: tableId,
        rowId: rowId,
        rowData: namedData,
        userId: userId,
      };

      var context = buildContext(automation, event);

      var stepResults: StepResult[] = [];
      var overallStatus: 'success' | 'failed' = 'success';

      for (var a = 0; a < automation.actions.length; a++) {
        var action = automation.actions[a];
        var result = await executeAction(action, context);
        stepResults.push(result);
        context['step_' + a] = result.output;

        if (result.status === 'failed') {
          overallStatus = 'failed';
          errors.push('Row ' + rowId + ' step ' + (a + 1) + ': ' + (result.error || 'Unknown error'));
          break;
        }
      }

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
    } catch (err: any) {
      errors.push('Row ' + rowId + ': ' + err.message);
    }
  }

  return { runIds: runIds, errors: errors };
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