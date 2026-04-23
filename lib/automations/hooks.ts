// ============================================================
// lib/automations/hooks.ts
// Drop-in hooks to wire automations into existing Agora code
// v2.0 — approval triggers, enhanced context
// ============================================================

import { fireTrigger, TriggerEvent } from './engine';

/**
 * Call after a new row is created (from API or UI)
 */
export async function onRowCreated(
  tableId: string,
  rowId: string,
  rowData: Record<string, any>,
  userId?: string
) {
  var event: TriggerEvent = {
    type: 'row_created',
    tableId: tableId,
    rowId: rowId,
    rowData: rowData,
    userId: userId,
  };
  fireTrigger(event).catch(function(err) {
    console.error('[Automations] row_created trigger failed:', err);
  });

  fireColumnMatchTriggers(tableId, rowId, rowData, undefined, userId);
}

/**
 * Call after a row is updated
 */
export async function onRowUpdated(
  tableId: string,
  rowId: string,
  newData: Record<string, any>,
  previousData: Record<string, any>,
  userId?: string
) {
  var event: TriggerEvent = {
    type: 'row_updated',
    tableId: tableId,
    rowId: rowId,
    rowData: newData,
    previousData: previousData,
    userId: userId,
  };
  fireTrigger(event).catch(function(err) {
    console.error('[Automations] row_updated trigger failed:', err);
  });

  fireColumnMatchTriggers(tableId, rowId, newData, previousData, userId);
}

/**
 * Call after a row is deleted
 */
export async function onRowDeleted(
  tableId: string,
  rowId: string,
  deletedData: Record<string, any>,
  userId?: string
) {
  var event: TriggerEvent = {
    type: 'row_deleted',
    tableId: tableId,
    rowId: rowId,
    rowData: deletedData,
    userId: userId,
  };
  fireTrigger(event).catch(function(err) {
    console.error('[Automations] row_deleted trigger failed:', err);
  });
}

/**
 * Call after a form is submitted
 */
export async function onFormSubmit(
  tableId: string,
  formId: string,
  rowId: string,
  rowData: Record<string, any>
) {
  var formEvent: TriggerEvent = {
    type: 'form_submit',
    tableId: tableId,
    rowId: rowId,
    rowData: rowData,
    formId: formId,
  };
  fireTrigger(formEvent).catch(function(err) {
    console.error('[Automations] form_submit trigger failed:', err);
  });

  onRowCreated(tableId, rowId, rowData);
}

/**
 * Call when an approval request is fully approved
 */
export async function onApprovalCompleted(
  tableId: string,
  rowId: string,
  rowData: Record<string, any>,
  approvalData: { workflowId: string; workflowName: string; requestId: string; approvedBy: string }
) {
  var event: TriggerEvent = {
    type: 'approval_completed',
    tableId: tableId,
    rowId: rowId,
    rowData: Object.assign({}, rowData, { _approval: approvalData }),
    userId: approvalData.approvedBy,
  };
  fireTrigger(event).catch(function(err) {
    console.error('[Automations] approval_completed trigger failed:', err);
  });
}

/**
 * Call when an approval request is denied
 */
export async function onApprovalDenied(
  tableId: string,
  rowId: string,
  rowData: Record<string, any>,
  approvalData: { workflowId: string; workflowName: string; requestId: string; deniedBy: string; reason?: string }
) {
  var event: TriggerEvent = {
    type: 'approval_denied',
    tableId: tableId,
    rowId: rowId,
    rowData: Object.assign({}, rowData, { _approval: approvalData }),
    userId: approvalData.deniedBy,
  };
  fireTrigger(event).catch(function(err) {
    console.error('[Automations] approval_denied trigger failed:', err);
  });
}

/**
 * Internal: Check column_match triggers when data changes
 */
function fireColumnMatchTriggers(
  tableId: string,
  rowId: string,
  currentData: Record<string, any>,
  previousData?: Record<string, any>,
  userId?: string
) {
  var event: TriggerEvent = {
    type: 'column_match',
    tableId: tableId,
    rowId: rowId,
    rowData: currentData,
    previousData: previousData,
    userId: userId,
  };
  fireTrigger(event).catch(function(err) {
    console.error('[Automations] column_match trigger failed:', err);
  });
}