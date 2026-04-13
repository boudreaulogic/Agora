'use client';

import { useState, useEffect, useRef } from 'react';

var CHART_TYPES = [
  { value: 'bar', label: 'Bar', icon: '📊' },
  { value: 'horizontal_bar', label: 'H-Bar', icon: '📊' },
  { value: 'line', label: 'Line', icon: '📈' },
  { value: 'area', label: 'Area', icon: '📉' },
  { value: 'pie', label: 'Pie', icon: '🥧' },
  { value: 'donut', label: 'Donut', icon: '🍩' },
];

var AGGREGATIONS = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
];

var FILTER_OPERATORS = [
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '≠' },
  { value: 'contains', label: 'contains' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'not_empty', label: 'not empty' },
  { value: 'is_empty', label: 'is empty' },
];

var COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];

function formatValue(val: number, colType?: string): string {
  if (colType === 'currency') {
    if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return '$' + (val / 1000).toFixed(1) + 'K';
    return '$' + val.toFixed(2);
  }
  if (colType === 'percent') return val.toFixed(1) + '%';
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
  if (val % 1 !== 0) return val.toFixed(1);
  return String(val);
}

function formatFullValue(val: number, colType?: string): string {
  if (colType === 'currency') return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (colType === 'percent') return val.toFixed(2) + '%';
  return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function getGridLines(maxValue: number): number[] {
  if (maxValue === 0) return [0];
  var magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
  var step = magnitude;
  if (maxValue / step < 3) step = magnitude / 2;
  if (maxValue / step > 6) step = magnitude * 2;
  var lines: number[] = [];
  for (var v = 0; v <= maxValue * 1.1; v += step) {
    lines.push(Math.round(v * 100) / 100);
  }
  return lines;
}

export function ChartsManager({
  tableId,
  columns,
  rows,
  isOpen,
  onClose,
}: {
  tableId: string;
  columns: any[];
  rows: any[];
  isOpen: boolean;
  onClose: () => void;
}) {
  var [charts, setCharts] = useState<any[]>([]);
  var [loading, setLoading] = useState(false);
  var [editingChart, setEditingChart] = useState<any>(null);
  var [creating, setCreating] = useState(false);
  var [newChartName, setNewChartName] = useState('');
  var [pinnedChartIds, setPinnedChartIds] = useState<Set<string>>(new Set());

  useEffect(function() {
    if (isOpen) fetchCharts();
  }, [isOpen]);

  function fetchCharts() {
    setLoading(true);
    Promise.all([
      fetch('/api/tables/' + tableId + '/charts'),
      fetch('/api/dashboard/pins'),
    ]).then(function(results) {
      return Promise.all(results.map(function(r) { return r.json(); }));
    }).then(function(data) {
      setCharts(data[0].charts || []);
      setPinnedChartIds(new Set(data[1].pinnedIds || []));
    }).finally(function() { setLoading(false); });
  }

  function handleCreate() {
    if (!newChartName.trim() || creating) return;
    setCreating(true);

    var numericCols = columns.filter(function(c) { return ['number', 'currency', 'percent'].includes(c.type); });
    var selectCols = columns.filter(function(c) { return ['select', 'multi_select'].includes(c.type); });
    var textCols = columns.filter(function(c) { return c.type === 'text'; });

    var defaultConfig: any = {
      version: 2,
      mode: 'simple',
      xColumn: selectCols[0]?.id || textCols[0]?.id || columns[0]?.id,
      yColumn: numericCols[0]?.id || null,
      yAggregation: numericCols[0] ? 'sum' : 'count',
      showLegend: true,
      showValues: true,
    };

    fetch('/api/tables/' + tableId + '/charts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newChartName.trim(), type: 'bar', config: defaultConfig }),
    }).then(function(res) { return res.json(); })
    .then(function(data) {
      setCharts(function(prev) { return prev.concat([data.chart]); });
      setNewChartName('');
      setEditingChart(data.chart);
    }).finally(function() { setCreating(false); });
  }

  function handleUpdateChart(chartId: string, updates: any) {
    return fetch('/api/tables/' + tableId + '/charts/' + chartId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).then(function(res) { return res.json(); })
    .then(function(data) {
      setCharts(function(prev) { return prev.map(function(c) { return c.id === chartId ? data.chart : c; }); });
      setEditingChart(data.chart);
    });
  }

  function handlePinChart(chartId: string) {
    fetch('/api/dashboard/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartId: chartId }),
    }).then(function(res) { return res.json(); })
    .then(function(data) {
      setPinnedChartIds(new Set(data.pinnedIds || []));
    }).catch(function() {});
  }

  function handleDelete(chartId: string) {
    if (!confirm('Delete this chart?')) return;
    fetch('/api/tables/' + tableId + '/charts/' + chartId, { method: 'DELETE' })
    .then(function(res) {
      if (res.ok) {
        setCharts(function(prev) { return prev.filter(function(c) { return c.id !== chartId; }); });
        if (editingChart?.id === chartId) setEditingChart(null);
      }
    });
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-bold text-gray-900">
              {editingChart ? 'Edit Chart' : 'Charts'}
            </h2>
            {editingChart && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                {editingChart.config?.mode === 'query' ? 'Multi-Table' : 'Simple'}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {editingChart && (
              <button onClick={function() { setEditingChart(null); }}
                className="text-sm text-blue-600 hover:text-blue-800 mr-4">
                ← Back to list
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {editingChart ? (
            <ChartEditor
              chart={editingChart}
              tableId={tableId}
              columns={columns}
              rows={rows}
              onUpdate={function(updates) { return handleUpdateChart(editingChart.id, updates); }}
            />
          ) : (
            <div>
              <div className="mb-6 flex space-x-2">
                <input type="text" value={newChartName}
                  onChange={function(e) { setNewChartName(e.target.value); }}
                  onKeyDown={function(e) { if (e.key === 'Enter') handleCreate(); }}
                  placeholder="New chart name..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900" />
                <button onClick={handleCreate} disabled={!newChartName.trim() || creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create Chart'}
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8 text-gray-400">Loading charts...</div>
              ) : charts.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📊</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No charts yet</h3>
                  <p className="text-sm text-gray-500">Create a chart to visualize your data.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {charts.map(function(chart) {
                    return (
                      <div key={chart.id} className="border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors">
                        <div className="h-48 bg-gray-50 p-4 overflow-hidden">
                          <ChartPreview chart={chart} columns={columns} rows={rows} tableId={tableId} />
                        </div>
                        <div className="p-3 border-t border-gray-200 relative z-10 bg-white">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm">{CHART_TYPES.find(function(t) { return t.value === chart.type; })?.icon || '📊'}</span>
                              <span className="font-medium text-sm text-gray-900">{chart.name}</span>
                              {chart.config?.mode === 'query' && (
                                <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Multi-Table</span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <button onClick={function() { handlePinChart(chart.id); }}
                                className={'text-xs ' + (pinnedChartIds.has(chart.id) ? 'text-orange-600 hover:text-orange-800' : 'text-green-600 hover:text-green-800')}>
                                {pinnedChartIds.has(chart.id) ? '📌 Unpin' : '📌 Pin'}
                              </button>
                              <button onClick={function() { setEditingChart(chart); }} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                              <button onClick={function() { handleDelete(chart.id); }} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CHART EDITOR — supports simple (v1) and query (v2) modes
// ============================================================
function ChartEditor({ chart, tableId, columns, rows, onUpdate }: {
  chart: any; tableId: string; columns: any[]; rows: any[]; onUpdate: (updates: any) => Promise<void>;
}) {
  var [name, setName] = useState(chart.name);
  var [chartType, setChartType] = useState(chart.type);
  var [config, setConfig] = useState(chart.config || {});
  var [saving, setSaving] = useState(false);
  var [mode, setMode] = useState(config.mode || 'simple');

  // Query mode state
  var [availableTables, setAvailableTables] = useState<any[]>([]);
  var [queryResult, setQueryResult] = useState<any>(null);
  var [queryLoading, setQueryLoading] = useState(false);
  var [queryError, setQueryError] = useState('');

  // Load available tables for query mode
  useEffect(function() {
    if (mode === 'query') {
      fetchQueryData();
    }
  }, [mode]);

  function fetchQueryData() {
    // Do an initial query to get available tables
    setQueryLoading(true);
    setQueryError('');
    var queryConfig = buildQueryConfig();
    fetch('/api/tables/' + tableId + '/charts/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryConfig),
    }).then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.error) {
        setQueryError(data.error);
      } else {
        setQueryResult(data);
        if (data.meta?.availableTables) {
          setAvailableTables(data.meta.availableTables);
        }
      }
    }).catch(function(e) {
      setQueryError('Failed to fetch data');
    }).finally(function() { setQueryLoading(false); });
  }

  function buildQueryConfig() {
    var joins: any[] = [];
    var groupByTableId = config.queryGroupByTableId || tableId;

    // If groupBy is on a different table, we need a join
    if (groupByTableId !== tableId) {
      var linkCol = columns.find(function(c) {
        return c.type === 'linked_record' && c.linkedTableId === groupByTableId;
      });
      if (linkCol) {
        joins.push({ fromColumnId: linkCol.id, toTableId: groupByTableId });
      }
    }

    // Check measures for cross-table
    (config.queryMeasures || []).forEach(function(m: any) {
      if (m.tableId && m.tableId !== tableId) {
        var existing = joins.find(function(j) { return j.toTableId === m.tableId; });
        if (!existing) {
          var lc = columns.find(function(c) {
            return c.type === 'linked_record' && c.linkedTableId === m.tableId;
          });
          if (lc) {
            joins.push({ fromColumnId: lc.id, toTableId: m.tableId });
          }
        }
      }
    });

    return {
      groupBy: {
        tableId: groupByTableId,
        columnId: config.queryGroupByColumnId || config.xColumn,
      },
      measures: (config.queryMeasures || []).map(function(m: any) {
        return {
          tableId: m.tableId || tableId,
          columnId: m.columnId,
          aggregation: m.aggregation || 'sum',
        };
      }),
      joins: joins,
      filters: config.queryFilters || [],
      limit: config.queryLimit || 50,
      sortBy: config.querySortBy || 'value',
      sortDir: config.querySortDir || 'desc',
    };
  }

  function handleSave() {
    setSaving(true);
    var saveConfig = Object.assign({}, config, { mode: mode, version: 2 });
    onUpdate({ name: name, type: chartType, config: saveConfig })
      .finally(function() { setSaving(false); });
  }

  function updateConfig(key: string, value: any) {
    setConfig(function(prev: any) {
      var next = Object.assign({}, prev, { [key]: value });
      return next;
    });
  }

  function runQuery() {
    setQueryLoading(true);
    setQueryError('');
    var queryConfig = buildQueryConfig();
    fetch('/api/tables/' + tableId + '/charts/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryConfig),
    }).then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.error) {
        setQueryError(data.error);
      } else {
        setQueryResult(data);
        if (data.meta?.availableTables) {
          setAvailableTables(data.meta.availableTables);
        }
      }
    }).catch(function() { setQueryError('Query failed'); })
    .finally(function() { setQueryLoading(false); });
  }

  var numericColumns = columns.filter(function(c) { return ['number', 'currency', 'percent', 'rating'].includes(c.type); });
  var categoryColumns = columns.filter(function(c) { return ['text', 'select', 'multi_select', 'checkbox', 'email'].includes(c.type); });

  // Get all columns across all available tables
  var allCategoryColumns: any[] = [];
  var allNumericColumns: any[] = [];
  availableTables.forEach(function(t) {
    t.columns.forEach(function(c: any) {
      var entry = { id: c.id, name: c.name, type: c.type, tableId: t.id, tableName: t.name };
      if (['text', 'select', 'multi_select', 'checkbox', 'email'].includes(c.type)) {
        allCategoryColumns.push(entry);
      }
      if (['number', 'currency', 'percent', 'rating'].includes(c.type)) {
        allNumericColumns.push(entry);
      }
    });
  });

  return (
    <div className="grid grid-cols-5 gap-6">
      {/* Left panel — config */}
      <div className="col-span-2 space-y-5">
        {/* Chart name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chart Name</label>
          <input type="text" value={name} onChange={function(e) { setName(e.target.value); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900" />
        </div>

        {/* Mode switcher */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Data Source</label>
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            <button onClick={function() { setMode('simple'); }}
              className={'flex-1 px-3 py-1.5 text-xs rounded-md transition-all font-medium ' +
                (mode === 'simple' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              Simple
            </button>
            <button onClick={function() { setMode('query'); }}
              className={'flex-1 px-3 py-1.5 text-xs rounded-md transition-all font-medium ' +
                (mode === 'query' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              Multi-Table
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            {mode === 'simple' ? 'Chart data from this table only' : 'Query across linked tables with joins'}
          </p>
        </div>

        {/* Chart type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Chart Type</label>
          <div className="grid grid-cols-3 gap-2">
            {CHART_TYPES.map(function(t) {
              return (
                <button key={t.value} onClick={function() { setChartType(t.value); }}
                  className={chartType === t.value
                    ? 'flex flex-col items-center p-2.5 rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700'
                    : 'flex flex-col items-center p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600'}>
                  <span className="text-lg mb-0.5">{t.icon}</span>
                  <span className="text-[10px]">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ====== SIMPLE MODE ====== */}
        {mode === 'simple' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category (X-Axis)</label>
              <select value={config.xColumn || ''} onChange={function(e) { updateConfig('xColumn', e.target.value); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900">
                <option value="">Select column...</option>
                {categoryColumns.map(function(col) { return <option key={col.id} value={col.id}>{col.name}</option>; })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Value (Y-Axis)</label>
              <select value={config.yColumn || ''} onChange={function(e) { updateConfig('yColumn', e.target.value || null); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900">
                <option value="">None (count rows)</option>
                {numericColumns.map(function(col) { return <option key={col.id} value={col.id}>{col.name}</option>; })}
              </select>
            </div>

            {config.yColumn && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aggregation</label>
                <select value={config.yAggregation || 'sum'} onChange={function(e) { updateConfig('yAggregation', e.target.value); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900">
                  {AGGREGATIONS.map(function(agg) { return <option key={agg.value} value={agg.value}>{agg.label}</option>; })}
                </select>
              </div>
            )}
          </>
        )}

        {/* ====== QUERY (MULTI-TABLE) MODE ====== */}
        {mode === 'query' && (
          <>
            {/* Group By */}
            <div className="bg-blue-50 rounded-lg p-3 space-y-2">
              <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider">Group By</label>
              <select value={config.queryGroupByTableId || tableId}
                onChange={function(e) { updateConfig('queryGroupByTableId', e.target.value); updateConfig('queryGroupByColumnId', ''); }}
                className="w-full px-3 py-1.5 border border-blue-200 rounded-lg text-xs text-gray-900 bg-white">
                {availableTables.map(function(t) {
                  return <option key={t.id} value={t.id}>{t.name}{t.isSource ? ' (source)' : ' (linked)'}</option>;
                })}
              </select>
              <select value={config.queryGroupByColumnId || ''}
                onChange={function(e) { updateConfig('queryGroupByColumnId', e.target.value); }}
                className="w-full px-3 py-1.5 border border-blue-200 rounded-lg text-xs text-gray-900 bg-white">
                <option value="">Select column...</option>
                {(allCategoryColumns.filter(function(c) { return c.tableId === (config.queryGroupByTableId || tableId); }))
                  .map(function(col) { return <option key={col.id} value={col.id}>{col.name}</option>; })}
              </select>
            </div>

            {/* Measures */}
            <div className="bg-green-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-green-800 uppercase tracking-wider">Measures</label>
                <button onClick={function() {
                  var measures = (config.queryMeasures || []).concat([{ tableId: tableId, columnId: '', aggregation: 'sum' }]);
                  updateConfig('queryMeasures', measures);
                }} className="text-[10px] text-green-600 hover:text-green-800 font-medium">+ Add</button>
              </div>
              {(config.queryMeasures || []).length === 0 && (
                <p className="text-[10px] text-green-600">No measures = count rows</p>
              )}
              {(config.queryMeasures || []).map(function(m: any, idx: number) {
                return (
                  <div key={idx} className="flex space-x-1.5 items-center">
                    <select value={m.tableId || tableId}
                      onChange={function(e) {
                        var measures = (config.queryMeasures || []).slice();
                        measures[idx] = Object.assign({}, measures[idx], { tableId: e.target.value, columnId: '' });
                        updateConfig('queryMeasures', measures);
                      }}
                      className="flex-1 px-2 py-1.5 border border-green-200 rounded text-[10px] text-gray-900 bg-white">
                      {availableTables.map(function(t) {
                        return <option key={t.id} value={t.id}>{t.name}</option>;
                      })}
                    </select>
                    <select value={m.columnId || ''}
                      onChange={function(e) {
                        var measures = (config.queryMeasures || []).slice();
                        measures[idx] = Object.assign({}, measures[idx], { columnId: e.target.value });
                        updateConfig('queryMeasures', measures);
                      }}
                      className="flex-1 px-2 py-1.5 border border-green-200 rounded text-[10px] text-gray-900 bg-white">
                      <option value="">Column...</option>
                      {allNumericColumns.filter(function(c) { return c.tableId === (m.tableId || tableId); })
                        .map(function(c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
                    </select>
                    <select value={m.aggregation || 'sum'}
                      onChange={function(e) {
                        var measures = (config.queryMeasures || []).slice();
                        measures[idx] = Object.assign({}, measures[idx], { aggregation: e.target.value });
                        updateConfig('queryMeasures', measures);
                      }}
                      className="w-16 px-1 py-1.5 border border-green-200 rounded text-[10px] text-gray-900 bg-white">
                      {AGGREGATIONS.map(function(a) { return <option key={a.value} value={a.value}>{a.label}</option>; })}
                    </select>
                    <button onClick={function() {
                      var measures = (config.queryMeasures || []).filter(function(_: any, i: number) { return i !== idx; });
                      updateConfig('queryMeasures', measures);
                    }} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                );
              })}
            </div>

            {/* Filters */}
            <div className="bg-amber-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-800 uppercase tracking-wider">Filters</label>
                <button onClick={function() {
                  var filters = (config.queryFilters || []).concat([{ tableId: tableId, columnId: '', operator: 'equals', value: '' }]);
                  updateConfig('queryFilters', filters);
                }} className="text-[10px] text-amber-600 hover:text-amber-800 font-medium">+ Add</button>
              </div>
              {(config.queryFilters || []).map(function(f: any, idx: number) {
                var filterTableCols = availableTables.find(function(t) { return t.id === (f.tableId || tableId); })?.columns || [];
                return (
                  <div key={idx} className="flex space-x-1.5 items-center">
                    <select value={f.tableId || tableId}
                      onChange={function(e) {
                        var filters = (config.queryFilters || []).slice();
                        filters[idx] = Object.assign({}, filters[idx], { tableId: e.target.value, columnId: '' });
                        updateConfig('queryFilters', filters);
                      }}
                      className="w-20 px-1 py-1.5 border border-amber-200 rounded text-[10px] text-gray-900 bg-white">
                      {availableTables.map(function(t) {
                        return <option key={t.id} value={t.id}>{t.name}</option>;
                      })}
                    </select>
                    <select value={f.columnId || ''}
                      onChange={function(e) {
                        var filters = (config.queryFilters || []).slice();
                        filters[idx] = Object.assign({}, filters[idx], { columnId: e.target.value });
                        updateConfig('queryFilters', filters);
                      }}
                      className="flex-1 px-1 py-1.5 border border-amber-200 rounded text-[10px] text-gray-900 bg-white">
                      <option value="">Column...</option>
                      {filterTableCols.map(function(c: any) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
                    </select>
                    <select value={f.operator || 'equals'}
                      onChange={function(e) {
                        var filters = (config.queryFilters || []).slice();
                        filters[idx] = Object.assign({}, filters[idx], { operator: e.target.value });
                        updateConfig('queryFilters', filters);
                      }}
                      className="w-16 px-1 py-1.5 border border-amber-200 rounded text-[10px] text-gray-900 bg-white">
                      {FILTER_OPERATORS.map(function(op) { return <option key={op.value} value={op.value}>{op.label}</option>; })}
                    </select>
                    {f.operator !== 'is_empty' && f.operator !== 'not_empty' && (
                      <input type="text" value={f.value || ''}
                        onChange={function(e) {
                          var filters = (config.queryFilters || []).slice();
                          filters[idx] = Object.assign({}, filters[idx], { value: e.target.value });
                          updateConfig('queryFilters', filters);
                        }}
                        placeholder="Value..."
                        className="flex-1 px-2 py-1.5 border border-amber-200 rounded text-[10px] text-gray-900 bg-white" />
                    )}
                    <button onClick={function() {
                      var filters = (config.queryFilters || []).filter(function(_: any, i: number) { return i !== idx; });
                      updateConfig('queryFilters', filters);
                    }} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                );
              })}
            </div>

            {/* Run Query button */}
            <button onClick={runQuery} disabled={queryLoading}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium">
              {queryLoading ? 'Running...' : '▶ Run Query'}
            </button>

            {queryError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                <p className="text-xs text-red-700">{queryError}</p>
              </div>
            )}

            {queryResult && (
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-500">
                  {queryResult.meta.filteredRows} rows → {queryResult.meta.groupCount} groups
                </p>
              </div>
            )}
          </>
        )}

        {/* Display options */}
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" checked={config.showLegend !== false}
              onChange={function(e) { updateConfig('showLegend', e.target.checked); }}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">Legend</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" checked={config.showValues !== false}
              onChange={function(e) { updateConfig('showValues', e.target.checked); }}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">Values</span>
          </label>
        </div>

        {/* Save */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {saving ? 'Saving...' : 'Save Chart'}
          </button>
        </div>
      </div>

      {/* Right panel — preview */}
      <div className="col-span-3 bg-gray-50 rounded-xl p-6 border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-500 mb-4">PREVIEW</h3>
        <div className="bg-white rounded-lg p-4 min-h-[400px] flex items-center justify-center">
          {mode === 'query' && queryResult ? (
            <QueryChartPreview
              chartType={chartType}
              name={name}
              data={queryResult.data}
              meta={queryResult.meta}
              config={config}
            />
          ) : (
            <ChartPreview
              chart={{ name: name, type: chartType, config: config }}
              columns={columns}
              rows={rows}
              tableId={tableId}
              fullSize
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// QUERY CHART PREVIEW — renders chart from server query results
// ============================================================
function QueryChartPreview({ chartType, name, data, meta, config }: {
  chartType: string; name: string; data: any[]; meta: any; config: any;
}) {
  var [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null);
  var [animate, setAnimate] = useState(false);
  var containerRef = useRef<HTMLDivElement>(null);

  useEffect(function() {
    setAnimate(false);
    var timer = setTimeout(function() { setAnimate(true); }, 50);
    return function() { clearTimeout(timer); };
  }, [data, chartType]);

  if (!data || data.length === 0) {
    return <div className="text-center text-gray-400 text-sm">No data — run the query to see results</div>;
  }

  var measureKey = meta.measures[0]?.key || 'count';
  var measureType = meta.measures[0]?.type || 'number';
  var chartData = data.map(function(d, i) {
    return {
      label: d.label,
      value: d.values[measureKey] || 0,
      color: COLORS[i % COLORS.length],
    };
  });

  var maxValue = Math.max.apply(null, chartData.map(function(d) { return d.value; }));
  var totalValue = chartData.reduce(function(sum, d) { return sum + d.value; }, 0);
  var gridLines = getGridLines(maxValue);

  function showTooltip(e: React.MouseEvent, label: string, value: number) {
    if (!containerRef.current) return;
    var rect = containerRef.current.getBoundingClientRect();
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 40, label: label, value: formatFullValue(value, measureType) });
  }

  function hideTooltip() { setTooltip(null); }

  var TooltipEl = tooltip ? (
    <div className="absolute pointer-events-none bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs shadow-lg z-10 whitespace-nowrap"
      style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}>
      <div className="font-medium">{tooltip.label}</div>
      <div className="text-gray-300">{tooltip.value}</div>
    </div>
  ) : null;

  // ========== BAR CHART ==========
  if (chartType === 'bar') {
    return (
      <div ref={containerRef} className="w-full relative">
        {TooltipEl}
        <h3 className="text-base font-semibold text-gray-900 mb-1 text-center">{name}</h3>
        <p className="text-xs text-gray-400 mb-4 text-center">
          {meta.groupBy.columnName} — {meta.measures[0]?.aggregation || 'count'} of {meta.measures[0]?.name || 'rows'}
        </p>
        <div className="relative">
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ height: '256px' }}>
            {gridLines.slice().reverse().map(function(v, i) {
              return (
                <div key={i} className="flex items-center w-full">
                  <span className="text-[10px] text-gray-400 w-12 text-right pr-2 flex-shrink-0">{formatValue(v, measureType)}</span>
                  <div className="flex-1 border-t border-gray-100" />
                </div>
              );
            })}
          </div>
          <div className="flex items-end justify-center space-x-3 h-64 pl-14">
            {chartData.map(function(d, i) {
              var height = maxValue > 0 ? (d.value / maxValue) * 100 : 0;
              return (
                <div key={i} className="flex flex-col items-center" style={{ width: Math.max(40, 300 / chartData.length) + 'px' }}>
                  {config.showValues !== false && (
                    <span className="text-[10px] text-gray-600 mb-1 font-medium">{formatValue(d.value, measureType)}</span>
                  )}
                  <div className="w-full rounded-t cursor-pointer hover:opacity-80 transition-all duration-700 ease-out"
                    style={{ height: animate ? Math.max(2, height) + '%' : '0%', backgroundColor: d.color, minHeight: '4px' }}
                    onMouseMove={function(e) { showTooltip(e, d.label, d.value); }}
                    onMouseLeave={hideTooltip} />
                  <span className="text-[10px] text-gray-500 mt-2 text-center truncate w-full" title={d.label}>{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ========== HORIZONTAL BAR ==========
  if (chartType === 'horizontal_bar') {
    return (
      <div ref={containerRef} className="w-full relative">
        {TooltipEl}
        <h3 className="text-base font-semibold text-gray-900 mb-1 text-center">{name}</h3>
        <p className="text-xs text-gray-400 mb-4 text-center">
          {meta.groupBy.columnName} — {meta.measures[0]?.aggregation || 'count'} of {meta.measures[0]?.name || 'rows'}
        </p>
        <div className="space-y-2">
          {chartData.map(function(d, i) {
            var width = maxValue > 0 ? (d.value / maxValue) * 100 : 0;
            return (
              <div key={i} className="flex items-center space-x-2"
                onMouseMove={function(e) { showTooltip(e, d.label, d.value); }} onMouseLeave={hideTooltip}>
                <span className="text-xs text-gray-600 w-24 truncate text-right flex-shrink-0" title={d.label}>{d.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full" style={{ height: '28px' }}>
                  <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-700 ease-out cursor-pointer hover:opacity-80"
                    style={{ width: animate ? Math.max(2, width) + '%' : '0%', backgroundColor: d.color }}>
                    {config.showValues !== false && width > 15 && (
                      <span className="text-xs text-white font-medium">{formatValue(d.value, measureType)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ========== LINE / AREA ==========
  if (chartType === 'line' || chartType === 'area') {
    var svgW = 500, svgH = 250, pad = 50, padB = 30;
    var cW = svgW - pad - 20, cH = svgH - pad - padB;
    var points = chartData.map(function(d, i) {
      return {
        x: pad + (i / Math.max(1, chartData.length - 1)) * cW,
        y: pad + cH - (maxValue > 0 ? (d.value / maxValue) * cH : 0),
        label: d.label, value: d.value,
      };
    });
    var pathD = points.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y; }).join(' ');
    var areaD = pathD + ' L' + points[points.length - 1].x + ',' + (pad + cH) + ' L' + points[0].x + ',' + (pad + cH) + ' Z';

    return (
      <div ref={containerRef} className="w-full relative">
        {TooltipEl}
        <h3 className="text-base font-semibold text-gray-900 mb-1 text-center">{name}</h3>
        <p className="text-xs text-gray-400 mb-2 text-center">
          {meta.groupBy.columnName} — {meta.measures[0]?.aggregation || 'count'} of {meta.measures[0]?.name || 'rows'}
        </p>
        <svg viewBox={'0 0 ' + svgW + ' ' + svgH} className="w-full">
          {gridLines.map(function(v, i) {
            var y = pad + cH - (maxValue > 0 ? (v / maxValue) * cH : 0);
            return (
              <g key={i}>
                <line x1={pad} y1={y} x2={pad + cW} y2={y} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4,4" />
                <text x={pad - 8} y={y + 4} textAnchor="end" fill="#9CA3AF" fontSize="9">{formatValue(v, measureType)}</text>
              </g>
            );
          })}
          {chartType === 'area' && <path d={areaD} fill="#3B82F6" fillOpacity="0.12" className={animate ? 'opacity-100 transition-opacity duration-700' : 'opacity-0'} />}
          <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={animate ? 'opacity-100 transition-opacity duration-500' : 'opacity-0'} />
          {points.map(function(p, i) {
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="12" fill="transparent"
                  onMouseMove={function(e: any) { showTooltip(e, p.label, p.value); }} onMouseLeave={hideTooltip} />
                <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#3B82F6" strokeWidth="2"
                  className={animate ? 'opacity-100 transition-opacity duration-700' : 'opacity-0'} />
                {config.showValues !== false && (
                  <text x={p.x} y={p.y - 12} textAnchor="middle" fill="#374151" fontSize="10" fontWeight="500">{formatValue(p.value, measureType)}</text>
                )}
                <text x={p.x} y={svgH - 5} textAnchor="middle" fill="#9CA3AF" fontSize="9">
                  {p.label.length > 10 ? p.label.substring(0, 9) + '…' : p.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // ========== PIE / DONUT ==========
  if (chartType === 'pie' || chartType === 'donut') {
    var size = 220, cx = size / 2, cy = size / 2;
    var radius = (size / 2) - 10;
    var innerRadius = chartType === 'donut' ? radius * 0.55 : 0;
    var startAngle = -90;

    function polarToCartesian(pcx: number, pcy: number, r: number, angle: number) {
      var rad = (angle * Math.PI) / 180;
      return { x: pcx + r * Math.cos(rad), y: pcy + r * Math.sin(rad) };
    }

    var slices = chartData.map(function(d) {
      var angle = totalValue > 0 ? (d.value / totalValue) * 360 : 0;
      var slice = Object.assign({}, d, { startAngle: startAngle, angle: angle, percent: totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : '0' });
      startAngle += angle;
      return slice;
    });

    return (
      <div ref={containerRef} className="flex flex-col items-center relative">
        {TooltipEl}
        <h3 className="text-base font-semibold text-gray-900 mb-1">{name}</h3>
        <p className="text-xs text-gray-400 mb-3">{meta.groupBy.columnName} breakdown</p>
        <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size}
          className={animate ? 'opacity-100 transition-opacity duration-500' : 'opacity-0'}>
          {slices.map(function(slice: any, i: number) {
            if (slice.angle <= 0) return null;
            var s1 = polarToCartesian(cx, cy, radius, slice.startAngle);
            var e1 = polarToCartesian(cx, cy, radius, slice.startAngle + slice.angle);
            var s2 = polarToCartesian(cx, cy, innerRadius, slice.startAngle + slice.angle);
            var e2 = polarToCartesian(cx, cy, innerRadius, slice.startAngle);
            var largeArc = slice.angle > 180 ? 1 : 0;
            var d = innerRadius > 0
              ? 'M ' + s1.x + ' ' + s1.y + ' A ' + radius + ' ' + radius + ' 0 ' + largeArc + ' 1 ' + e1.x + ' ' + e1.y + ' L ' + s2.x + ' ' + s2.y + ' A ' + innerRadius + ' ' + innerRadius + ' 0 ' + largeArc + ' 0 ' + e2.x + ' ' + e2.y + ' Z'
              : 'M ' + cx + ' ' + cy + ' L ' + s1.x + ' ' + s1.y + ' A ' + radius + ' ' + radius + ' 0 ' + largeArc + ' 1 ' + e1.x + ' ' + e1.y + ' Z';
            return <path key={i} d={d} fill={slice.color} stroke="white" strokeWidth="2"
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onMouseMove={function(e: any) { showTooltip(e, slice.label, slice.value); }}
              onMouseLeave={hideTooltip} />;
          })}
          {chartType === 'donut' && (
            <>
              <text x={cx} y={cy - 4} textAnchor="middle" fill="#374151" fontSize="16" fontWeight="700">{formatValue(totalValue, measureType)}</text>
              <text x={cx} y={cy + 12} textAnchor="middle" fill="#9CA3AF" fontSize="10">Total</text>
            </>
          )}
        </svg>
        {config.showLegend !== false && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-4">
            {slices.map(function(d: any, i: number) {
              return (
                <div key={i} className="flex items-center space-x-1.5 cursor-pointer hover:opacity-70"
                  onMouseMove={function(e) { showTooltip(e, d.label, d.value); }} onMouseLeave={hideTooltip}>
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-gray-600">{d.label}</span>
                  <span className="text-xs text-gray-400">({d.percent}%)</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return <div className="text-center text-gray-400 text-sm">Unknown chart type</div>;
}

// ============================================================
// SIMPLE CHART PREVIEW — client-side (v1 compatible)
// ============================================================
function ChartPreview({ chart, columns, rows, tableId, fullSize = false }: {
  chart: any; columns: any[]; rows: any[]; tableId: string; fullSize?: boolean;
}) {
  var [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null);
  var [animate, setAnimate] = useState(false);
  var containerRef = useRef<HTMLDivElement>(null);

  var config = chart.config || {};
  var xCol = columns.find(function(c) { return c.id === config.xColumn; });
  var yCol = columns.find(function(c) { return c.id === config.yColumn; });
  var yColType = yCol?.type;

  useEffect(function() {
    setAnimate(false);
    var timer = setTimeout(function() { setAnimate(true); }, 50);
    return function() { clearTimeout(timer); };
  }, [chart.type, config.xColumn, config.yColumn, config.yAggregation]);

  // If this is a query-mode chart, show placeholder in simple preview
  if (config.mode === 'query') {
    return <div className="text-center text-gray-400 text-sm">Multi-table chart — click Edit to preview</div>;
  }

  if (!xCol) {
    return <div className="text-center text-gray-400 text-sm">Select a category column</div>;
  }

  var groups: Record<string, { label: string; values: number[] }> = {};
  rows.forEach(function(row) {
    var category = row.data[config.xColumn];
    if (!category) category = '(empty)';
    var categories = typeof category === 'string' && category.includes(',') ? category.split(',') : [category];
    categories.forEach(function(cat: string) {
      cat = cat.trim();
      if (!groups[cat]) groups[cat] = { label: cat, values: [] };
      if (config.yColumn) {
        var val = parseFloat(row.data[config.yColumn]);
        if (!isNaN(val)) groups[cat].values.push(val);
      } else {
        groups[cat].values.push(1);
      }
    });
  });

  var data = Object.entries(groups).map(function(entry, i) {
    var key = entry[0];
    var group = entry[1];
    var agg = config.yAggregation || (config.yColumn ? 'sum' : 'count');
    var value = 0;
    if (agg === 'count') value = group.values.length;
    else if (agg === 'sum') value = group.values.reduce(function(a, b) { return a + b; }, 0);
    else if (agg === 'avg') value = group.values.length > 0 ? group.values.reduce(function(a, b) { return a + b; }, 0) / group.values.length : 0;
    else if (agg === 'min') value = group.values.length > 0 ? Math.min.apply(null, group.values) : 0;
    else if (agg === 'max') value = group.values.length > 0 ? Math.max.apply(null, group.values) : 0;

    var color = COLORS[i % COLORS.length];
    if (xCol.settings?.options) {
      var opt = xCol.settings.options.find(function(o: any) { return o.value === key || o.label === key; });
      if (opt?.color) color = opt.color;
    }
    return { label: group.label, value: Math.round(value * 100) / 100, color: color };
  }).sort(function(a, b) { return b.value - a.value; });

  if (data.length === 0) {
    return <div className="text-center text-gray-400 text-sm">No data to display</div>;
  }

  var maxValue = Math.max.apply(null, data.map(function(d) { return d.value; }));
  var totalValue = data.reduce(function(sum, d) { return sum + d.value; }, 0);
  var gridLines = getGridLines(maxValue);

  function showTooltip(e: React.MouseEvent, label: string, value: number) {
    if (!containerRef.current) return;
    var rect = containerRef.current.getBoundingClientRect();
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 40, label: label, value: formatFullValue(value, yColType) });
  }

  function hideTooltip() { setTooltip(null); }

  var TooltipEl = tooltip ? (
    <div className="absolute pointer-events-none bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs shadow-lg z-10 whitespace-nowrap"
      style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}>
      <div className="font-medium">{tooltip.label}</div>
      <div className="text-gray-300">{tooltip.value}</div>
    </div>
  ) : null;

  // BAR
  if (chart.type === 'bar') {
    return (
      <div ref={containerRef} className={fullSize ? 'w-full relative' : 'w-full h-full flex flex-col justify-end relative'}>
        {TooltipEl}
        {fullSize && <h3 className="text-base font-semibold text-gray-900 mb-1 text-center">{chart.name}</h3>}
        {fullSize && <p className="text-xs text-gray-400 mb-4 text-center">{xCol.name} vs {yCol?.name || 'Count'}</p>}
        <div className={fullSize ? 'relative' : ''}>
          {fullSize && (
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ height: '256px' }}>
              {gridLines.slice().reverse().map(function(v, i) {
                return (
                  <div key={i} className="flex items-center w-full">
                    <span className="text-[10px] text-gray-400 w-12 text-right pr-2 flex-shrink-0">{formatValue(v, yColType)}</span>
                    <div className="flex-1 border-t border-gray-100" />
                  </div>
                );
              })}
            </div>
          )}
          <div className={fullSize ? 'flex items-end justify-center space-x-3 h-64 pl-14' : 'flex items-end justify-center space-x-1 h-28'}>
            {data.map(function(d, i) {
              var height = maxValue > 0 ? (d.value / maxValue) * 100 : 0;
              return (
                <div key={i} className="flex flex-col items-center" style={{ width: fullSize ? Math.max(40, 300 / data.length) + 'px' : '20px' }}>
                  {config.showValues !== false && fullSize && (
                    <span className="text-[10px] text-gray-600 mb-1 font-medium">{formatValue(d.value, yColType)}</span>
                  )}
                  <div className="w-full rounded-t cursor-pointer hover:opacity-80 transition-all duration-700 ease-out"
                    style={{ height: animate ? Math.max(2, height) + '%' : '0%', backgroundColor: d.color, minHeight: '4px' }}
                    onMouseMove={function(e) { showTooltip(e, d.label, d.value); }}
                    onMouseLeave={hideTooltip} />
                  {fullSize && <span className="text-[10px] text-gray-500 mt-2 text-center truncate w-full" title={d.label}>{d.label}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // HORIZONTAL BAR
  if (chart.type === 'horizontal_bar') {
    return (
      <div ref={containerRef} className={fullSize ? 'w-full relative' : 'w-full h-full flex flex-col justify-center relative'}>
        {TooltipEl}
        {fullSize && <h3 className="text-base font-semibold text-gray-900 mb-1 text-center">{chart.name}</h3>}
        <div className="space-y-2">
          {data.map(function(d, i) {
            var width = maxValue > 0 ? (d.value / maxValue) * 100 : 0;
            return (
              <div key={i} className="flex items-center space-x-2"
                onMouseMove={function(e) { showTooltip(e, d.label, d.value); }} onMouseLeave={hideTooltip}>
                {fullSize && <span className="text-xs text-gray-600 w-24 truncate text-right flex-shrink-0" title={d.label}>{d.label}</span>}
                <div className="flex-1 bg-gray-100 rounded-full" style={{ height: fullSize ? '28px' : '12px' }}>
                  <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-700 ease-out cursor-pointer hover:opacity-80"
                    style={{ width: animate ? Math.max(2, width) + '%' : '0%', backgroundColor: d.color }}>
                    {config.showValues !== false && fullSize && width > 15 && (
                      <span className="text-xs text-white font-medium">{formatValue(d.value, yColType)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // LINE / AREA
  if (chart.type === 'line' || chart.type === 'area') {
    var svgWidth = fullSize ? 500 : 200;
    var svgHeight = fullSize ? 250 : 100;
    var padding = fullSize ? 50 : 10;
    var paddingBottom = fullSize ? 30 : 10;
    var chartWidth = svgWidth - padding - 20;
    var chartHeight = svgHeight - padding - paddingBottom;
    var pts = data.map(function(d, i) {
      return {
        x: padding + (i / Math.max(1, data.length - 1)) * chartWidth,
        y: padding + chartHeight - (maxValue > 0 ? (d.value / maxValue) * chartHeight : 0),
        label: d.label, value: d.value,
      };
    });
    var linePath = pts.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y; }).join(' ');
    var areaPath = linePath + ' L' + pts[pts.length - 1].x + ',' + (padding + chartHeight) + ' L' + pts[0].x + ',' + (padding + chartHeight) + ' Z';

    return (
      <div ref={containerRef} className="w-full relative">
        {TooltipEl}
        {fullSize && <h3 className="text-base font-semibold text-gray-900 mb-1 text-center">{chart.name}</h3>}
        <svg viewBox={'0 0 ' + svgWidth + ' ' + svgHeight} className="w-full">
          {fullSize && gridLines.map(function(v, i) {
            var y = padding + chartHeight - (maxValue > 0 ? (v / maxValue) * chartHeight : 0);
            return (
              <g key={i}>
                <line x1={padding} y1={y} x2={padding + chartWidth} y2={y} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4,4" />
                <text x={padding - 8} y={y + 4} textAnchor="end" fill="#9CA3AF" fontSize="9">{formatValue(v, yColType)}</text>
              </g>
            );
          })}
          {chart.type === 'area' && <path d={areaPath} fill="#3B82F6" fillOpacity="0.12" className={animate ? 'opacity-100 transition-opacity duration-700' : 'opacity-0'} />}
          <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth={fullSize ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round"
            className={animate ? 'opacity-100 transition-opacity duration-500' : 'opacity-0'} />
          {pts.map(function(p, i) {
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={fullSize ? 12 : 6} fill="transparent"
                  onMouseMove={function(e: any) { showTooltip(e, p.label, p.value); }} onMouseLeave={hideTooltip} />
                <circle cx={p.x} cy={p.y} r={fullSize ? 4 : 2} fill="white" stroke="#3B82F6" strokeWidth="2"
                  className={animate ? 'opacity-100 transition-opacity duration-700' : 'opacity-0'} />
                {config.showValues !== false && fullSize && (
                  <text x={p.x} y={p.y - 12} textAnchor="middle" fill="#374151" fontSize="10" fontWeight="500">{formatValue(p.value, yColType)}</text>
                )}
                {fullSize && (
                  <text x={p.x} y={svgHeight - 5} textAnchor="middle" fill="#9CA3AF" fontSize="9">
                    {p.label.length > 10 ? p.label.substring(0, 9) + '…' : p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // PIE / DONUT
  if (chart.type === 'pie' || chart.type === 'donut') {
    var pieSize = fullSize ? 220 : 80;
    var pieCx = pieSize / 2, pieCy = pieSize / 2;
    var pieR = (pieSize / 2) - 10;
    var pieIR = chart.type === 'donut' ? pieR * 0.55 : 0;
    var pieStart = -90;

    function ptc(pcx: number, pcy: number, r: number, angle: number) {
      var rad = (angle * Math.PI) / 180;
      return { x: pcx + r * Math.cos(rad), y: pcy + r * Math.sin(rad) };
    }

    var pieSlices = data.map(function(d) {
      var angle = totalValue > 0 ? (d.value / totalValue) * 360 : 0;
      var s = Object.assign({}, d, { startAngle: pieStart, angle: angle, percent: totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : '0' });
      pieStart += angle;
      return s;
    });

    return (
      <div ref={containerRef} className="flex flex-col items-center relative">
        {TooltipEl}
        {fullSize && <h3 className="text-base font-semibold text-gray-900 mb-1">{chart.name}</h3>}
        <svg width={pieSize} height={pieSize} viewBox={'0 0 ' + pieSize + ' ' + pieSize}
          className={animate ? 'opacity-100 transition-opacity duration-500' : 'opacity-0'}>
          {pieSlices.map(function(slice: any, i: number) {
            if (slice.angle <= 0) return null;
            var s1 = ptc(pieCx, pieCy, pieR, slice.startAngle);
            var e1 = ptc(pieCx, pieCy, pieR, slice.startAngle + slice.angle);
            var s2 = ptc(pieCx, pieCy, pieIR, slice.startAngle + slice.angle);
            var e2 = ptc(pieCx, pieCy, pieIR, slice.startAngle);
            var la = slice.angle > 180 ? 1 : 0;
            var d = pieIR > 0
              ? 'M ' + s1.x + ' ' + s1.y + ' A ' + pieR + ' ' + pieR + ' 0 ' + la + ' 1 ' + e1.x + ' ' + e1.y + ' L ' + s2.x + ' ' + s2.y + ' A ' + pieIR + ' ' + pieIR + ' 0 ' + la + ' 0 ' + e2.x + ' ' + e2.y + ' Z'
              : 'M ' + pieCx + ' ' + pieCy + ' L ' + s1.x + ' ' + s1.y + ' A ' + pieR + ' ' + pieR + ' 0 ' + la + ' 1 ' + e1.x + ' ' + e1.y + ' Z';
            return <path key={i} d={d} fill={slice.color} stroke="white" strokeWidth="2"
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onMouseMove={function(e: any) { showTooltip(e, slice.label, slice.value); }} onMouseLeave={hideTooltip} />;
          })}
          {chart.type === 'donut' && fullSize && (
            <>
              <text x={pieCx} y={pieCy - 4} textAnchor="middle" fill="#374151" fontSize="16" fontWeight="700">{formatValue(totalValue, yColType)}</text>
              <text x={pieCx} y={pieCy + 12} textAnchor="middle" fill="#9CA3AF" fontSize="10">Total</text>
            </>
          )}
        </svg>
        {config.showLegend !== false && fullSize && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-4">
            {pieSlices.map(function(d: any, i: number) {
              return (
                <div key={i} className="flex items-center space-x-1.5">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-gray-600">{d.label}</span>
                  <span className="text-xs text-gray-400">({d.percent}%)</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return <div className="text-center text-gray-400 text-sm">Unknown chart type</div>;
}