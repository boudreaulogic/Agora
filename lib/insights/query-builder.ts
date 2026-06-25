// ============================================================
// lib/insights/query-builder.ts
// Query engine for Agora Insights
// Reads row data from Agora tables and aggregates for widgets
// ============================================================

import { db } from '@/lib/db';

// ---- Types ----

export interface QueryConfig {
  tableId: string;
  groupBy?: string;       // column ID to group by
  dateGrouping?: string;
  aggregations: {
    columnId: string;      // column ID to aggregate (or '*' for count)
    function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct';
    alias: string;         // output field name
  }[];
  filters?: {
    columnId: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty' | 'in';
    value?: string;
    values?: string[];    // for 'in' operator — preferred over comma-split value
  }[];
  orderBy?: {
    field: string;         // alias or group field
    direction: 'asc' | 'desc';
  };
  limit?: number;
  includeEmpty?: boolean;  // include rows with empty groupBy value (default: false)
}

export interface QueryResult {
  data: Record<string, any>[];
  meta: {
    rowCount: number;
    executionMs: number;
    tableId: string;
    tableName?: string;
  };
}

// ---- Main Query Function ----

export async function executeWidgetQuery(config: QueryConfig): Promise<QueryResult> {
  var start = Date.now();

  // Load table info
  var table = await db.agoraTable.findUnique({
    where: { id: config.tableId },
    select: { id: true, name: true },
  });
  if (!table) throw new Error('Table not found: ' + config.tableId);

  // Load columns for name resolution
  var columns = await db.agoraColumn.findMany({
    where: { tableId: config.tableId },
    select: { id: true, name: true, type: true, settings: true, linkedTableId: true, linkedDisplayColumnId: true },
  });
  var colMap = new Map(columns.map(function(c) { return [c.id, c]; }));

  // Load all rows
  var rows = await db.agoraRow.findMany({
    where: { tableId: config.tableId },
    select: { id: true, data: true, createdAt: true, updatedAt: true, createdById: true },
  });

  // Apply filters
  var filtered = applyFilters(rows, config.filters || [], colMap);

  // If no groupBy, aggregate the entire dataset
  if (!config.groupBy) {
    var totalAggs: Record<string, any> = { _label: 'Total' };
    for (var ai = 0; ai < config.aggregations.length; ai++) {
      var agg = config.aggregations[ai];
      totalAggs[agg.alias] = computeAggregation(filtered, agg.columnId, agg.function, colMap);
    }
    return {
      data: [totalAggs],
      meta: { rowCount: filtered.length, executionMs: Date.now() - start, tableId: config.tableId, tableName: table.name },
    };
  }

  // Group rows by the groupBy column
  var groups = new Map<string, any[]>();
  var groupCol = colMap.get(config.groupBy);
  var linkedDisplayMap: Map<string, string> | null = null;
  if (groupCol && (groupCol.type === 'linked_record' || groupCol.type === 'lookup')) {
    linkedDisplayMap = await resolveLinkedRecordDisplayValues(filtered, config.groupBy!, colMap);
  }

  var includeEmpty = config.includeEmpty === true;

  for (var ri = 0; ri < filtered.length; ri++) {
    var rowData = filtered[ri].data as Record<string, any>;
    var rawGroupValue = rowData[config.groupBy];

    // Determine if the group value is "empty" (null, undefined, empty string, or whitespace-only).
    // IMPORTANT: do not treat numeric 0 or boolean false as empty — those are real values.
    var isEmpty = rawGroupValue === null
      || rawGroupValue === undefined
      || (typeof rawGroupValue === 'string' && rawGroupValue.trim() === '');

    // Skip rows with empty group values unless the caller explicitly wants them.
    // This prevents a phantom "(empty)" group from displacing real items in top-N results.
    if (isEmpty && !includeEmpty) continue;

    var groupValue = isEmpty ? '(empty)' : String(rawGroupValue);

    // Date grouping
    if (config.dateGrouping && config.dateGrouping !== 'none' && !isEmpty) {
      try {
        var dateVal = new Date(groupValue);
        if (!isNaN(dateVal.getTime())) {
          switch (config.dateGrouping) {
            case 'day': groupValue = dateVal.toISOString().split('T')[0]; break;
            case 'week':
              var weekStart = new Date(dateVal);
              weekStart.setDate(weekStart.getDate() - weekStart.getDay());
              groupValue = 'Week of ' + weekStart.toISOString().split('T')[0]; break;
            case 'month': groupValue = dateVal.toLocaleString('en-US', { month: 'short', year: 'numeric' }); break;
            case 'quarter':
              var q = Math.ceil((dateVal.getMonth() + 1) / 3);
              groupValue = 'Q' + q + ' ' + dateVal.getFullYear(); break;
            case 'year': groupValue = String(dateVal.getFullYear()); break;
          }
        }
      } catch {}
    }

    // Handle select columns — resolve to label
    if (groupCol && groupCol.type === 'select') {
      var resolved = resolveSelectLabel(groupValue, groupCol);
      if (resolved) groupValue = resolved;
    }

    // Handle linked records — resolve to display value
    if (groupCol && (groupCol.type === 'linked_record' || groupCol.type === 'lookup') && linkedDisplayMap) {
      var linkedDisplay = linkedDisplayMap.get(groupValue);
      if (linkedDisplay) groupValue = linkedDisplay;
    }

    if (!groups.has(groupValue)) {
      groups.set(groupValue, []);
    }
    groups.get(groupValue)!.push(filtered[ri]);
  }

  // Compute aggregations per group
  var results: Record<string, any>[] = [];
  groups.forEach(function(groupRows, groupKey) {
    var row: Record<string, any> = { _label: groupKey };
    for (var agi = 0; agi < config.aggregations.length; agi++) {
      var aggDef = config.aggregations[agi];
      row[aggDef.alias] = computeAggregation(groupRows, aggDef.columnId, aggDef.function, colMap);
    }
    row._count = groupRows.length;
    results.push(row);
  });

  // Sort
  if (config.orderBy) {
    var sortField = config.orderBy.field;
    var sortDir = config.orderBy.direction === 'desc' ? -1 : 1;
    results.sort(function(a, b) {
      var av = a[sortField];
      var bv = b[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
  }

  // Limit
  if (config.limit && config.limit > 0) {
    results = results.slice(0, config.limit);
  }

  return {
    data: results,
    meta: { rowCount: filtered.length, executionMs: Date.now() - start, tableId: config.tableId, tableName: table.name },
  };
}

// ---- Filter Engine ----

function applyFilters(
  rows: any[],
  filters: QueryConfig['filters'] & {},
  colMap: Map<string, any>
): any[] {
  if (!filters || filters.length === 0) return rows;

  return rows.filter(function(row) {
    var data = row.data as Record<string, any>;

    for (var fi = 0; fi < filters.length; fi++) {
      var filter = filters[fi];
      var cellValue = data[filter.columnId];
      var strValue = cellValue != null ? String(cellValue) : '';

      switch (filter.operator) {
        case 'eq':
          if (strValue !== String(filter.value || '')) return false;
          break;
        case 'neq':
          if (strValue === String(filter.value || '')) return false;
          break;
        case 'gt':
          if (parseFloat(strValue) <= parseFloat(filter.value || '0')) return false;
          break;
        case 'gte':
          if (parseFloat(strValue) < parseFloat(filter.value || '0')) return false;
          break;
        case 'lt':
          if (parseFloat(strValue) >= parseFloat(filter.value || '0')) return false;
          break;
        case 'lte':
          if (parseFloat(strValue) > parseFloat(filter.value || '0')) return false;
          break;
        case 'contains':
          if (!strValue.toLowerCase().includes(String(filter.value || '').toLowerCase())) return false;
          break;
        case 'not_contains':
          if (strValue.toLowerCase().includes(String(filter.value || '').toLowerCase())) return false;
          break;
        case 'is_empty':
          if (strValue && strValue.trim()) return false;
          break;
        case 'is_not_empty':
          if (!strValue || !strValue.trim()) return false;
          break;
        case 'in':
          // Prefer the explicit array form. Fall back to comma-split for backwards compatibility.
          var inValues: string[];
          if (filter.values && Array.isArray(filter.values) && filter.values.length > 0) {
            inValues = filter.values.map(function(v) { return String(v); });
          } else {
            inValues = String(filter.value || '').split(',').map(function(v) { return v.trim(); }).filter(Boolean);
          }
          // Empty selection means "no values selected" — treat as no-op (don't filter anything out).
          if (inValues.length === 0) break;
          if (inValues.indexOf(strValue) === -1) return false;
          break;
      }
    }
    return true;
  });
}

// ---- Aggregation Engine ----

function computeAggregation(
  rows: any[],
  columnId: string,
  fn: string,
  colMap: Map<string, any>
): number {
  if (fn === 'count') return rows.length;

  var values: number[] = [];
  var uniqueValues = new Set<string>();

  for (var i = 0; i < rows.length; i++) {
    var data = rows[i].data as Record<string, any>;
    var raw = data[columnId];

    if (fn === 'count_distinct') {
      if (raw != null && String(raw).trim()) uniqueValues.add(String(raw));
      continue;
    }

    if (raw == null || raw === '') continue;
    var num = parseFloat(String(raw).replace(/[$,%]/g, ''));
    if (!isNaN(num)) values.push(num);
  }

  if (fn === 'count_distinct') return uniqueValues.size;
  if (values.length === 0) return 0;

  switch (fn) {
    case 'sum':
      var total = 0;
      for (var si = 0; si < values.length; si++) total += values[si];
      return Math.round(total * 100) / 100;
    case 'avg':
      var sum = 0;
      for (var avi = 0; avi < values.length; avi++) sum += values[avi];
      return Math.round((sum / values.length) * 100) / 100;
    case 'min':
      return Math.min.apply(null, values);
    case 'max':
      return Math.max.apply(null, values);
    default:
      return 0;
  }
}

// ---- Helpers ----

function resolveSelectLabel(value: string, column: any): string | null {
  if (!column.settings?.options) return null;
  var opt = column.settings.options.find(function(o: any) { return o.value === value; });
  return opt ? opt.label : null;
}

async function resolveLinkedRecordDisplayValues(
  rows: any[],
  groupByColumnId: string,
  colMap: Map<string, any>
): Promise<Map<string, string>> {
  var col = colMap.get(groupByColumnId);
  if (!col || (col.type !== 'linked_record' && col.type !== 'lookup')) return new Map();

  // Collect all row IDs referenced
  var rowIds = new Set<string>();
  for (var i = 0; i < rows.length; i++) {
    var data = rows[i].data as Record<string, any>;
    var val = data[groupByColumnId];
    if (val) {
      // Could be a single ID or comma-separated
      String(val).split(',').forEach(function(v) { if (v.trim()) rowIds.add(v.trim()); });
    }
  }

  if (rowIds.size === 0) return new Map();

  // Look up display values — find the linked table and display column
  var displayMap = new Map<string, string>();
  try {
    var linkedTableId = col.linkedTableId;
    var displayColId = col.linkedDisplayColumnId;

    if (!linkedTableId) return displayMap;

    var linkedRows = await db.agoraRow.findMany({
      where: { id: { in: Array.from(rowIds) } },
      select: { id: true, data: true },
    });

    // If we have a display column, use it; otherwise use first text-like value
    if (displayColId) {
      for (var li = 0; li < linkedRows.length; li++) {
        var lData = linkedRows[li].data as Record<string, any>;
        displayMap.set(linkedRows[li].id, String(lData[displayColId] || linkedRows[li].id));
      }
    } else {
      // Try to find the first column with a value
      var linkedCols = await db.agoraColumn.findMany({
        where: { tableId: linkedTableId },
        orderBy: { position: 'asc' },
        select: { id: true, type: true },
        take: 3,
      });
      for (var li2 = 0; li2 < linkedRows.length; li2++) {
        var lData2 = linkedRows[li2].data as Record<string, any>;
        var displayVal = '';
        for (var ci = 0; ci < linkedCols.length; ci++) {
          var cv = lData2[linkedCols[ci].id];
          if (cv && String(cv).trim()) { displayVal = String(cv); break; }
        }
        displayMap.set(linkedRows[li2].id, displayVal || linkedRows[li2].id);
      }
    }
  } catch (err) {
    console.error('[Insights] Failed to resolve linked record display values:', err);
  }

  return displayMap;
}

// ---- KPI Query (simplified single-value query) ----

export async function executeKpiQuery(config: {
  tableId: string;
  columnId: string;
  function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct';
  filters?: QueryConfig['filters'];
  compareFilters?: QueryConfig['filters']; // for trend comparison
}): Promise<{ value: number; compareValue?: number; trend?: number }> {
  var result = await executeWidgetQuery({
    tableId: config.tableId,
    aggregations: [{ columnId: config.columnId, function: config.function, alias: 'value' }],
    filters: config.filters,
  });

  var value = result.data[0]?.value || 0;
  var output: { value: number; compareValue?: number; trend?: number } = { value: value };

  if (config.compareFilters) {
    var compareResult = await executeWidgetQuery({
      tableId: config.tableId,
      aggregations: [{ columnId: config.columnId, function: config.function, alias: 'value' }],
      filters: config.compareFilters,
    });
    output.compareValue = compareResult.data[0]?.value || 0;
    if (output.compareValue! > 0) {
      output.trend = Math.round(((value - output.compareValue!) / output.compareValue!) * 100);
    }
  }

  return output;
}

// ---- Get distinct values for a column (for filter dropdowns) ----

export async function getDistinctValues(tableId: string, columnId: string): Promise<string[]> {
  var rows = await db.agoraRow.findMany({
    where: { tableId: tableId },
    select: { data: true },
  });

  var values = new Set<string>();
  for (var i = 0; i < rows.length; i++) {
    var data = rows[i].data as Record<string, any>;
    var val = data[columnId];
    if (val != null && String(val).trim()) {
      values.add(String(val));
    }
  }

  return Array.from(values).sort();
}

// ============================================================================
// Multi-Table Query — joins data across tables using linked records
// ============================================================================

export async function executeMultiTableQuery(config: {
  primaryTableId: string;
  joinTableId: string;
  joinColumnId: string;       // linked_record column on primary table
  groupBy?: string;           // column ID on either table (prefix with table alias: "primary.colId" or "joined.colId")
  aggregations: {
    columnId: string;          // prefix with "primary." or "joined."
    function: 'count' | 'sum' | 'avg' | 'min' | 'max';
    alias: string;
  }[];
  filters?: QueryConfig['filters'];
  limit?: number;
}): Promise<QueryResult> {
  var start = Date.now();

  // Load both tables
  var primaryTable = await db.agoraTable.findUnique({ where: { id: config.primaryTableId }, select: { id: true, name: true } });
  var joinTable = await db.agoraTable.findUnique({ where: { id: config.joinTableId }, select: { id: true, name: true } });
  if (!primaryTable || !joinTable) throw new Error('Table not found');

  // Load columns for both tables
  var primaryCols = await db.agoraColumn.findMany({ where: { tableId: config.primaryTableId }, select: { id: true, name: true, type: true, settings: true, linkedTableId: true, linkedDisplayColumnId: true } });
  var joinCols = await db.agoraColumn.findMany({ where: { tableId: config.joinTableId }, select: { id: true, name: true, type: true, settings: true } });

  // Load all rows from both tables
  var primaryRows = await db.agoraRow.findMany({ where: { tableId: config.primaryTableId }, select: { id: true, data: true } });
  var joinRows = await db.agoraRow.findMany({ where: { tableId: config.joinTableId }, select: { id: true, data: true } });

  // Build a lookup map for joined table rows
  var joinRowMap = new Map<string, Record<string, any>>();
  for (var ji = 0; ji < joinRows.length; ji++) {
    joinRowMap.set(joinRows[ji].id, joinRows[ji].data as Record<string, any>);
  }

  // Join the data — for each primary row, find the linked row(s)
  var joinedData: Record<string, any>[] = [];

  for (var pi = 0; pi < primaryRows.length; pi++) {
    var pData = primaryRows[pi].data as Record<string, any>;
    var linkedValue = pData[config.joinColumnId];

    if (!linkedValue) continue;

    // Linked value could be a single ID or comma-separated
    var linkedIds = String(linkedValue).split(',').map(function(v) { return v.trim(); }).filter(Boolean);

    for (var li = 0; li < linkedIds.length; li++) {
      var joinedRowData = joinRowMap.get(linkedIds[li]);
      if (!joinedRowData) continue;

      // Merge primary + joined data with prefixes
      var merged: Record<string, any> = { _primaryRowId: primaryRows[pi].id };

      // Add primary columns
      for (var pci = 0; pci < primaryCols.length; pci++) {
        merged['primary.' + primaryCols[pci].id] = pData[primaryCols[pci].id];
        merged['primary.' + primaryCols[pci].name] = pData[primaryCols[pci].id];
      }

      // Add joined columns
      for (var jci = 0; jci < joinCols.length; jci++) {
        merged['joined.' + joinCols[jci].id] = joinedRowData[joinCols[jci].id];
        merged['joined.' + joinCols[jci].name] = joinedRowData[joinCols[jci].id];
      }

      joinedData.push(merged);
    }
  }

  // Now group and aggregate the joined data
  var groupByKey = config.groupBy || '';
  var groups = new Map<string, any[]>();

  if (!groupByKey) {
    groups.set('Total', joinedData);
  } else {
    for (var di = 0; di < joinedData.length; di++) {
      var gVal = String(joinedData[di][groupByKey] || '(empty)');
      if (!groups.has(gVal)) groups.set(gVal, []);
      groups.get(gVal)!.push(joinedData[di]);
    }
  }

  var results: Record<string, any>[] = [];
  groups.forEach(function(groupRows, groupKey) {
    var row: Record<string, any> = { _label: groupKey, _count: groupRows.length };

    for (var agi = 0; agi < config.aggregations.length; agi++) {
      var agg = config.aggregations[agi];
      var values: number[] = [];

      if (agg.function === 'count') {
        row[agg.alias] = groupRows.length;
        continue;
      }

      for (var gri = 0; gri < groupRows.length; gri++) {
        var raw = groupRows[gri][agg.columnId];
        if (raw == null || raw === '') continue;
        var num = parseFloat(String(raw).replace(/[$,%]/g, ''));
        if (!isNaN(num)) values.push(num);
      }

      if (values.length === 0) { row[agg.alias] = 0; continue; }

      switch (agg.function) {
        case 'sum': var total = 0; for (var si = 0; si < values.length; si++) total += values[si]; row[agg.alias] = Math.round(total * 100) / 100; break;
        case 'avg': var sum2 = 0; for (var ai = 0; ai < values.length; ai++) sum2 += values[ai]; row[agg.alias] = Math.round((sum2 / values.length) * 100) / 100; break;
        case 'min': row[agg.alias] = Math.min.apply(null, values); break;
        case 'max': row[agg.alias] = Math.max.apply(null, values); break;
        default: row[agg.alias] = 0;
      }
    }

    results.push(row);
  });

  // Sort by value desc
  results.sort(function(a, b) { return (b.value || b._count || 0) - (a.value || a._count || 0); });

  if (config.limit) results = results.slice(0, config.limit);

  return {
    data: results,
    meta: { rowCount: joinedData.length, executionMs: Date.now() - start, tableId: config.primaryTableId, tableName: primaryTable.name + ' ↔ ' + joinTable.name },
  };
}