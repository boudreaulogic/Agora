// ============================================================
// lib/automations/hooks.ts
// Drop-in hooks to wire automations into existing row routes
// ============================================================

import { fireTrigger } from './engine';
import type { TriggerEvent } from './engine';

/**
 * Call after a new row is created
 */
export function onRowCreated(
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

  // Also check column_match triggers for the new data
  fireColumnMatchTriggers(tableId, rowId, rowData);
}

/**
 * Call after a row is updated (cell edit)
 */
export function onRowUpdated(
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

  // Check column_match triggers for changed values
  fireColumnMatchTriggers(tableId, rowId, newData, previousData);
}

/**
 * Call after a row is deleted
 */
export function onRowDeleted(
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
export function onFormSubmit(
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

  // Also fire row_created since form submit creates a row
  onRowCreated(tableId, rowId, rowData);
}

/**
 * Internal: Check column_match triggers when data changes
 */
function fireColumnMatchTriggers(
  tableId: string,
  rowId: string,
  currentData: Record<string, any>,
  previousData?: Record<string, any>
) {
  var event: TriggerEvent = {
    type: 'column_match',
    tableId: tableId,
    rowId: rowId,
    rowData: currentData,
    previousData: previousData,
  };
  fireTrigger(event).catch(function(err) {
    console.error('[Automations] column_match trigger failed:', err);
  });
}