// ============================================================
// lib/insights/query-builder.ts
// Query engine for Agora Insights
// Reads row data from Agora tables and aggregates for widgets
// ============================================================

import { db } from '@/lib/db';

// ---- Types ----

export interface QueryConfig {
  tableId: string;
  groupBy?: string;       // column ID to group by (the x dimension)
  dateGrouping?: string;
  series?: string;        // OPTIONAL second dimension — turns the query into a pivot
  seriesDateGrouping?: string;
  seriesLimit?: number;   // top-N series to keep before collapsing into "Other" (default 8)
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
    series?: string[];        // present for pivot queries — the series keys the renderer should draw
    seriesTruncated?: boolean; // true if low-cardinality series were collapsed into "Other"
  };
}

// Pseudo-columns that expose row metadata as if they were data columns.
// Lets dashboards filter / group / sort by the submission timestamp ("when was this submitted").
export var PSEUDO_COLUMNS: Record<string, string> = {
  _createdAt: 'Submitted',
  _updatedAt: 'Last updated',
};

// Read a cell value, transparently handling the metadata pseudo-columns above.
function getCellValue(row: any, columnId: string): any {
  if (columnId === '_createdAt') return row.createdAt;
  if (columnId === '_updatedAt') return row.updatedAt;
  var data = (row.data || {}) as Record<string, any>;
  return data[columnId];
}

// Coerce a cell/filter value to a comparable number for gt/gte/lt/lte.
// Pure-numeric strings compare as numbers; otherwise we try Date.parse so that
// date columns (incl. the _createdAt pseudo-column) compare chronologically.
function toComparable(value: any): number {
  if (value == null) return NaN;
  if (value instanceof Date) return value.getTime();
  var str = String(value).trim();
  if (str === '') return NaN;
  if (/^[-+]?[\d$,.%\s]+$/.test(str)) {
    var num = parseFloat(str.replace(/[$,%,]/g, ''));
    if (!isNaN(num)) return num;
  }
  var t = Date.parse(str);
  if (!isNaN(t)) return t;
  var fallback = parseFloat(str.replace(/[$,%]/g, ''));
  return fallback;
}

// Resolve a raw cell value into a display label (+ a chronological sort key for date groupings).
// This is the single source of truth used for BOTH the x (groupBy) and series dimensions,
// so the two are always bucketed identically. Extracted from the old inline grouping loop —
// the single-series path produces byte-identical labels to before.
function resolveDimensionLabel(
  rawValue: any,
  col: any,
  dateGrouping: string | undefined,
  linkedMap: Map<string, string> | null
): { label: string; sortKey?: number; isEmpty: boolean } {
  var isEmpty = rawValue === null
    || rawValue === undefined
    || (typeof rawValue === 'string' && rawValue.trim() === '');
  if (isEmpty) return { label: '(empty)', isEmpty: true };

  var label = rawValue instanceof Date ? rawValue.toISOString() : String(rawValue);
  var sortKey: number | undefined;

  if (dateGrouping && dateGrouping !== 'none') {
    try {
      var dateVal = new Date(label);
      if (!isNaN(dateVal.getTime())) {
        switch (dateGrouping) {
          case 'day':
            label = dateVal.toISOString().split('T')[0];
            sortKey = Date.UTC(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate());
            break;
          case 'week':
            var weekStart = new Date(dateVal);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            label = 'Week of ' + weekStart.toISOString().split('T')[0];
            sortKey = weekStart.getTime();
            break;
          case 'month':
            label = dateVal.toLocaleString('en-US', { month: 'short', year: 'numeric' });
            sortKey = Date.UTC(dateVal.getFullYear(), dateVal.getMonth(), 1);
            break;
          case 'quarter':
            var q = Math.ceil((dateVal.getMonth() + 1) / 3);
            label = 'Q' + q + ' ' + dateVal.getFullYear();
            sortKey = Date.UTC(dateVal.getFullYear(), (q - 1) * 3, 1);
            break;
          case 'year':
            label = String(dateVal.getFullYear());
            sortKey = Date.UTC(dateVal.getFullYear(), 0, 1);
            break;
        }
      }
    } catch {}
  }

  if (col && col.type === 'select') {
    var resolved = resolveSelectLabel(label, col);
    if (resolved) label = resolved;
  }

  if (col && (col.type === 'linked_record' || col.type === 'lookup') && linkedMap) {
    var linkedDisplay = linkedMap.get(label);
    if (linkedDisplay) label = linkedDisplay;
  }

  return { label: label, sortKey: sortKey, isEmpty: false };
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

  var includeEmpty = config.includeEmpty === true;
  var dateActive = !!(config.dateGrouping && config.dateGrouping !== 'none');

  var groupCol = colMap.get(config.groupBy);
  var linkedDisplayMap: Map<string, string> | null = null;
  if (groupCol && (groupCol.type === 'linked_record' || groupCol.type === 'lookup')) {
    linkedDisplayMap = await resolveLinkedRecordDisplayValues(filtered, config.groupBy!, colMap);
  }

  // ---- Pivot path: a second "series" dimension splits each x-group into multiple series ----
  if (config.series) {
    var seriesCol = colMap.get(config.series);
    var seriesLinkedMap: Map<string, string> | null = null;
    if (seriesCol && (seriesCol.type === 'linked_record' || seriesCol.type === 'lookup')) {
      seriesLinkedMap = await resolveLinkedRecordDisplayValues(filtered, config.series, colMap);
    }
    return buildPivotResult(
      filtered, config, colMap, table.name, groupCol, linkedDisplayMap, seriesCol, seriesLinkedMap, includeEmpty, dateActive, start
    );
  }

  // ---- Single-series path ----
  var groups = new Map<string, any[]>();
  var groupSortKeys = new Map<string, number>();

  for (var ri = 0; ri < filtered.length; ri++) {
    var resolved = resolveDimensionLabel(getCellValue(filtered[ri], config.groupBy), groupCol, config.dateGrouping, linkedDisplayMap);
    if (resolved.isEmpty && !includeEmpty) continue;
    if (!groups.has(resolved.label)) {
      groups.set(resolved.label, []);
      if (resolved.sortKey !== undefined) groupSortKeys.set(resolved.label, resolved.sortKey);
    }
    groups.get(resolved.label)!.push(filtered[ri]);
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

  // Sort — date groupings sort chronologically (display labels like "Jan 2025" aren't
  // lexically ordered, so we sort by the hidden sortKey); everything else honors orderBy.
  results = sortResults(results, config, dateActive, groupSortKeys, null);

  // Limit
  if (config.limit && config.limit > 0) {
    results = results.slice(0, config.limit);
  }

  return {
    data: results,
    meta: { rowCount: filtered.length, executionMs: Date.now() - start, tableId: config.tableId, tableName: table.name },
  };
}

// Sort grouped results. When a date grouping is active and we have chronological sort keys,
// order by them (ascending = oldest first, so time charts read left→right); a label_desc
// orderBy flips to newest-first. Otherwise fall back to the supplied orderBy (default value desc).
function sortResults(
  results: Record<string, any>[],
  config: QueryConfig,
  dateActive: boolean,
  sortKeys: Map<string, number>,
  seriesKeys: string[] | null
): Record<string, any>[] {
  if (dateActive && sortKeys.size > 0) {
    var ddir = (config.orderBy && config.orderBy.field === '_label' && config.orderBy.direction === 'desc') ? -1 : 1;
    return results.slice().sort(function(a, b) {
      var ak = sortKeys.get(a._label);
      var bk = sortKeys.get(b._label);
      return ((ak == null ? 0 : ak) - (bk == null ? 0 : bk)) * ddir;
    });
  }

  if (seriesKeys) {
    // Pivot, non-date: order x-categories by their total across all series, biggest first.
    return results.slice().sort(function(a, b) {
      var at = 0, bt = 0;
      for (var i = 0; i < seriesKeys.length; i++) { at += Number(a[seriesKeys[i]]) || 0; bt += Number(b[seriesKeys[i]]) || 0; }
      return bt - at;
    });
  }

  if (config.orderBy) {
    var sortField = config.orderBy.field;
    var sortDir = config.orderBy.direction === 'desc' ? -1 : 1;
    return results.slice().sort(function(a, b) {
      var av = a[sortField];
      var bv = b[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
  }

  return results;
}

// ---- Pivot builder: x-dimension × series-dimension → one row per x with a column per series ----
function buildPivotResult(
  filtered: any[],
  config: QueryConfig,
  colMap: Map<string, any>,
  tableName: string,
  groupCol: any,
  linkedDisplayMap: Map<string, string> | null,
  seriesCol: any,
  seriesLinkedMap: Map<string, string> | null,
  includeEmpty: boolean,
  dateActive: boolean,
  start: number
): QueryResult {
  var agg = config.aggregations[0] || { columnId: '*', function: 'count' as const, alias: 'value' };

  var xGroups = new Map<string, Map<string, any[]>>();  // xLabel -> (seriesLabel -> rows)
  var xSortKeys = new Map<string, number>();
  var seriesAllRows = new Map<string, any[]>();          // seriesLabel -> rows (for ranking)

  for (var ri = 0; ri < filtered.length; ri++) {
    var x = resolveDimensionLabel(getCellValue(filtered[ri], config.groupBy!), groupCol, config.dateGrouping, linkedDisplayMap);
    if (x.isEmpty && !includeEmpty) continue;
    var s = resolveDimensionLabel(getCellValue(filtered[ri], config.series!), seriesCol, config.seriesDateGrouping, seriesLinkedMap);
    if (s.isEmpty && !includeEmpty) continue;

    if (!xGroups.has(x.label)) {
      xGroups.set(x.label, new Map());
      if (x.sortKey !== undefined) xSortKeys.set(x.label, x.sortKey);
    }
    var sMap = xGroups.get(x.label)!;
    if (!sMap.has(s.label)) sMap.set(s.label, []);
    sMap.get(s.label)!.push(filtered[ri]);

    if (!seriesAllRows.has(s.label)) seriesAllRows.set(s.label, []);
    seriesAllRows.get(s.label)!.push(filtered[ri]);
  }

  // Rank series by overall contribution; keep top-N, collapse the rest into "Other".
  var ranked: { label: string; total: number }[] = [];
  seriesAllRows.forEach(function(rows, label) {
    ranked.push({ label: label, total: computeAggregation(rows, agg.columnId, agg.function, colMap) });
  });
  ranked.sort(function(a, b) { return b.total - a.total; });

  var seriesLimit = config.seriesLimit && config.seriesLimit > 0 ? config.seriesLimit : 8;
  var topSeries = ranked.slice(0, seriesLimit).map(function(r) { return r.label; });
  var topSet = new Set(topSeries);
  var truncated = ranked.length > seriesLimit;
  var seriesKeys = truncated ? topSeries.concat(['Other']) : topSeries;

  // Emit one row per x-label, every series key present (0-filled) so stacks align.
  var results: Record<string, any>[] = [];
  xGroups.forEach(function(sMap, xLabel) {
    var row: Record<string, any> = { _label: xLabel };
    for (var k = 0; k < seriesKeys.length; k++) row[seriesKeys[k]] = 0;

    var buckets = new Map<string, any[]>();
    var totalCount = 0;
    sMap.forEach(function(rows, sLabel) {
      totalCount += rows.length;
      var key = topSet.has(sLabel) ? sLabel : 'Other';
      if (!buckets.has(key)) buckets.set(key, []);
      var arr = buckets.get(key)!;
      for (var i = 0; i < rows.length; i++) arr.push(rows[i]);
    });
    buckets.forEach(function(rows, key) {
      row[key] = computeAggregation(rows, agg.columnId, agg.function, colMap);
    });
    row._count = totalCount;
    results.push(row);
  });

  results = sortResults(results, config, dateActive, xSortKeys, seriesKeys);
  if (config.limit && config.limit > 0) results = results.slice(0, config.limit);

  return {
    data: results,
    meta: {
      rowCount: filtered.length,
      executionMs: Date.now() - start,
      tableId: config.tableId,
      tableName: tableName,
      series: seriesKeys,
      seriesTruncated: truncated,
    },
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
    for (var fi = 0; fi < filters.length; fi++) {
      var filter = filters[fi];
      var cellValue = getCellValue(row, filter.columnId);
      var strValue = cellValue != null ? (cellValue instanceof Date ? cellValue.toISOString() : String(cellValue)) : '';

      switch (filter.operator) {
        case 'eq':
          if (strValue !== String(filter.value || '')) return false;
          break;
        case 'neq':
          if (strValue === String(filter.value || '')) return false;
          break;
        // gt/gte/lt/lte compare numerically for numbers and chronologically for dates
        // (toComparable parses ISO/date strings), so date-range slicers work on date columns.
        case 'gt':
          if (toComparable(cellValue) <= toComparable(filter.value)) return false;
          break;
        case 'gte':
          if (toComparable(cellValue) < toComparable(filter.value)) return false;
          break;
        case 'lt':
          if (toComparable(cellValue) >= toComparable(filter.value)) return false;
          break;
        case 'lte':
          if (toComparable(cellValue) > toComparable(filter.value)) return false;
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
    var raw = getCellValue(rows[i], columnId);

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
  sparkline?: { dateColumnId: string; dateGrouping?: string }; // optional mini trend series
}): Promise<{ value: number; compareValue?: number; trend?: number; sparkline?: { _label: string; value: number }[] }> {
  var result = await executeWidgetQuery({
    tableId: config.tableId,
    aggregations: [{ columnId: config.columnId, function: config.function, alias: 'value' }],
    filters: config.filters,
  });

  var value = result.data[0]?.value || 0;
  var output: { value: number; compareValue?: number; trend?: number; sparkline?: { _label: string; value: number }[] } = { value: value };

  // Optional sparkline: the same measure grouped over a date column (chronologically sorted by the engine).
  if (config.sparkline && config.sparkline.dateColumnId) {
    try {
      var sparkRes = await executeWidgetQuery({
        tableId: config.tableId,
        groupBy: config.sparkline.dateColumnId,
        dateGrouping: config.sparkline.dateGrouping || 'month',
        aggregations: [{ columnId: config.columnId, function: config.function, alias: 'value' }],
        filters: config.filters,
      });
      output.sparkline = sparkRes.data.map(function(d) { return { _label: String(d._label), value: Number(d.value) || 0 }; });
    } catch {}
  }

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
  var isPseudo = columnId === '_createdAt' || columnId === '_updatedAt';
  var rows = await db.agoraRow.findMany({
    where: { tableId: tableId },
    select: isPseudo ? { createdAt: true, updatedAt: true } : { data: true } as any,
  });

  var values = new Set<string>();
  for (var i = 0; i < rows.length; i++) {
    var val = getCellValue(rows[i], columnId);
    if (val != null) {
      var str = val instanceof Date ? val.toISOString().split('T')[0] : String(val);
      if (str.trim()) values.add(str);
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