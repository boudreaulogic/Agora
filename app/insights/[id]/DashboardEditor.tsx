'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboardData, WidgetData } from '@/components/insights/useDashboardData';
import { DashboardCanvas } from '@/components/insights/DashboardCanvas';

// ---- Types ----
interface RawColumn { id: string; name: string; type: string; settings?: any }
interface TableInfo { id: string; name: string; columns: RawColumn[]; }
interface DashboardData { id: string; name: string; slug: string; description?: string; icon?: string; status: string; visibility: string; widgets: WidgetData[]; oikos?: any; }

// ---- Constants ----
var NUMERIC_TYPES = ['number', 'currency', 'percent', 'rating', 'progress'];
var AGG_FUNCTIONS = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count_distinct', label: 'Count Distinct' },
];
// Visualization widget types (selectable in the chart-type picker).
var WIDGET_TYPES = [
  { value: 'kpi_card', label: 'KPI Card', icon: '🔢' },
  { value: 'bar', label: 'Bar', icon: '📊' },
  { value: 'line', label: 'Line', icon: '📈' },
  { value: 'area', label: 'Area', icon: '📉' },
  { value: 'combo', label: 'Combo', icon: '📊' },
  { value: 'pie', label: 'Pie', icon: '🥧' },
  { value: 'donut', label: 'Donut', icon: '🍩' },
  { value: 'gauge', label: 'Gauge', icon: '◔' },
  { value: 'scatter', label: 'Scatter', icon: '⚬' },
  { value: 'data_table', label: 'Table', icon: '📋' },
  { value: 'text', label: 'Text', icon: '📝' },
];
// Buttons shown on the "Add" bar (incl. the interactive slicer control).
var ADD_TYPES = WIDGET_TYPES.concat([{ value: 'slicer', label: 'Slicer', icon: '🎛️' }]);
var ACCENTS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6366F1'];

// Pseudo-columns exposed for grouping/filtering by submission timestamp.
var PSEUDO_COLS: RawColumn[] = [
  { id: '_createdAt', name: '📅 Submitted (date)', type: 'date' },
  { id: '_updatedAt', name: '📅 Last updated (date)', type: 'date' },
];
function columnsFor(table?: TableInfo): RawColumn[] {
  if (!table) return [];
  return PSEUDO_COLS.concat(table.columns);
}

// ---- Styles ----
var inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#111827', fontSize: '12px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };
var selectStyle: React.CSSProperties = Object.assign({}, inputStyle, { cursor: 'pointer' });
var labelStyle: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '3px' };

// Export a chart widget's SVG to PNG via the browser canvas (no external libs).
function exportWidgetAsPng(widgetId: string, widgetName: string) {
  var widgetEl = document.querySelector('[data-widget-id="' + widgetId + '"]');
  if (!widgetEl) { alert('Could not find widget to export'); return; }
  var svg = widgetEl.querySelector('svg');
  if (!svg) { alert('PNG export supports chart widgets (bar, line, area, pie, donut, scatter, combo).'); return; }
  var svgRect = svg.getBoundingClientRect();
  var width = Math.ceil(svgRect.width), height = Math.ceil(svgRect.height);
  var clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  var svgString = new XMLSerializer().serializeToString(clone);
  var url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));
  var img = new Image();
  img.onload = function() {
    var canvas = document.createElement('canvas');
    canvas.width = width * 2; canvas.height = height * 2;
    var ctx = canvas.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); return; }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.scale(2, 2); ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    canvas.toBlob(function(blob) {
      if (!blob) return;
      var dlUrl = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = dlUrl; a.download = (widgetName || 'chart').replace(/[^a-z0-9_-]+/gi, '_') + '.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(dlUrl); }, 1000);
    }, 'image/png');
  };
  img.onerror = function() { URL.revokeObjectURL(url); alert('Failed to render chart for export.'); };
  img.src = url;
}

// ============================================================
// Widget Config Panel
// ============================================================
function WidgetConfigPanel({ widget, tables, seriesOptions, onUpdate, onClose }: { widget: WidgetData; tables: TableInfo[]; seriesOptions: string[]; onUpdate: (config: any) => void; onClose: () => void }) {
  var [localDc, setLocalDc] = useState<any>(widget.dataConfig || {});
  var [localVc, setLocalVc] = useState<any>(widget.vizConfig || {});
  var [localName, setLocalName] = useState(widget.name);
  var [localType, setLocalType] = useState(widget.type);

  useEffect(function() {
    setLocalDc(widget.dataConfig || {}); setLocalVc(widget.vizConfig || {});
    setLocalName(widget.name); setLocalType(widget.type);
  }, [widget.id]);

  var selectedTable = tables.find(function(t) { return t.id === localDc.tableId; });
  var cols = columnsFor(selectedTable);
  var dateCols = cols.filter(function(c) { return c.type === 'date' || c.id === '_createdAt' || c.id === '_updatedAt'; });

  function commitDc(key: string, val: any) { var next = Object.assign({}, localDc, { [key]: val }); setLocalDc(next); onUpdate({ dataConfig: next }); }
  function commitVc(key: string, val: any) { var next = Object.assign({}, localVc, { [key]: val }); setLocalVc(next); onUpdate({ vizConfig: next }); }

  var isChart = ['bar', 'line', 'area', 'combo', 'scatter', 'pie', 'donut', 'data_table'].indexOf(localType) !== -1;
  var supportsSeries = ['bar', 'line', 'area', 'combo'].indexOf(localType) !== -1;

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '340px', background: '#ffffff', borderLeft: '1px solid #e5e7eb', zIndex: 50, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 12px rgba(0,0,0,0.08)' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Configure {localType === 'slicer' ? 'Slicer' : 'Widget'}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '16px' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={labelStyle}>{localType === 'slicer' ? 'Slicer Label' : 'Widget Name'}</label>
          <input type="text" value={localName} onChange={function(e) { setLocalName(e.target.value); onUpdate({ name: e.target.value }); if (localType === 'slicer') commitVc('label', e.target.value); }} style={inputStyle} />
        </div>

        {/* Chart type picker (not for slicer) */}
        {localType !== 'slicer' && (
          <div>
            <label style={labelStyle}>Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {WIDGET_TYPES.map(function(wt) {
                var active = localType === wt.value;
                return (
                  <button key={wt.value} onClick={function() { setLocalType(wt.value); onUpdate({ type: wt.value }); }}
                    style={{ padding: '8px 4px', border: active ? '2px solid #2563eb' : '1px solid #e5e7eb', borderRadius: '6px', background: active ? '#eff6ff' : '#fff', cursor: 'pointer', textAlign: 'center' as const, fontSize: '9px', color: active ? '#1d4ed8' : '#6b7280' }}>
                    <div style={{ fontSize: '15px' }}>{wt.icon}</div>
                    <div style={{ marginTop: '2px' }}>{wt.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Text */}
        {localType === 'text' && (
          <div>
            <label style={labelStyle}>Text Content</label>
            <textarea value={localVc.text || ''} onChange={function(e) { commitVc('text', e.target.value); }} style={Object.assign({}, inputStyle, { minHeight: '80px', resize: 'vertical' as const })} placeholder="Enter text..." />
          </div>
        )}

        {/* Slicer config */}
        {localType === 'slicer' && (<>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
            <div>
              <label style={labelStyle}>Table</label>
              <select value={localDc.tableId || ''} onChange={function(e) { var next = { tableId: e.target.value, columnId: '', control: localDc.control || 'checklist' }; setLocalDc(next); onUpdate({ dataConfig: next }); }} style={selectStyle}>
                <option value="">— Select table —</option>
                {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
              </select>
            </div>
            {localDc.tableId && (
              <div style={{ marginTop: '10px' }}>
                <label style={labelStyle}>Column to filter</label>
                <select value={localDc.columnId || ''} onChange={function(e) { commitDc('columnId', e.target.value); }} style={selectStyle}>
                  <option value="">— Select column —</option>
                  {cols.map(function(c) { return <option key={c.id} value={c.id}>{c.name} ({c.type})</option>; })}
                </select>
              </div>
            )}
            <div style={{ marginTop: '10px' }}>
              <label style={labelStyle}>Control Type</label>
              <select value={localDc.control || 'checklist'} onChange={function(e) { commitDc('control', e.target.value); }} style={selectStyle}>
                <option value="checklist">Checklist (multi-select)</option>
                <option value="dropdown">Dropdown (single)</option>
                <option value="search">Search list</option>
                <option value="buttons">Buttons</option>
                <option value="daterange">Date range</option>
              </select>
            </div>
            <div style={{ marginTop: '10px' }}>
              <label style={labelStyle}>Placement</label>
              <select value={localVc.placement || 'topbar'} onChange={function(e) { commitVc('placement', e.target.value); }} style={selectStyle}>
                <option value="topbar">Top filter bar</option>
                <option value="canvas">On the dashboard (tile)</option>
              </select>
            </div>
            <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '8px' }}>Viewers use this control to filter every widget on the same table — live, in view mode and embeds.</p>
          </div>
        </>)}

        {/* Data widgets */}
        {localType !== 'text' && localType !== 'slicer' && (<>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Data Source</div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Table</label>
              <select value={localDc.tableId || ''} onChange={function(e) { var next = { tableId: e.target.value, groupBy: '', columnId: '', function: 'count' }; setLocalDc(next); onUpdate({ dataConfig: next }); }} style={selectStyle}>
                <option value="">— Select table —</option>
                {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
              </select>
            </div>
            {localDc.tableId && localType !== 'kpi_card' && localType !== 'gauge' && (
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Group By (X axis)</label>
                <select value={localDc.groupBy || ''} onChange={function(e) { commitDc('groupBy', e.target.value); }} style={selectStyle}>
                  <option value="">— No grouping —</option>
                  {cols.map(function(c) { return <option key={c.id} value={c.id}>{c.name} ({c.type})</option>; })}
                </select>
              </div>
            )}
            {localDc.tableId && supportsSeries && localDc.groupBy && (
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Split by series (optional)</label>
                <select value={localDc.series || ''} onChange={function(e) { commitDc('series', e.target.value || undefined); }} style={selectStyle}>
                  <option value="">— Single series —</option>
                  {cols.filter(function(c) { return c.id !== localDc.groupBy; }).map(function(c) { return <option key={c.id} value={c.id}>{c.name} ({c.type})</option>; })}
                </select>
                {localDc.series && <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>Creates a stacked/grouped chart — top 8 series, rest grouped as “Other”.</p>}
              </div>
            )}
            {localDc.tableId && (
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Measure Column</label>
                <select value={localDc.columnId || '*'} onChange={function(e) { commitDc('columnId', e.target.value); }} style={selectStyle}>
                  <option value="*">— All rows (count) —</option>
                  {cols.map(function(c) { return <option key={c.id} value={c.id}>{c.name} ({c.type})</option>; })}
                </select>
              </div>
            )}
            {localDc.tableId && (
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Aggregation</label>
                <select value={localDc.function || 'count'} onChange={function(e) { commitDc('function', e.target.value); }} style={selectStyle}>
                  {AGG_FUNCTIONS.map(function(f) { return <option key={f.value} value={f.value}>{f.label}</option>; })}
                </select>
              </div>
            )}
            {localDc.tableId && isChart && localType !== 'pie' && localType !== 'donut' && (
              <div>
                <label style={labelStyle}>Limit Results</label>
                <select value={localDc.limit || ''} onChange={function(e) { commitDc('limit', e.target.value ? parseInt(e.target.value) : null); }} style={selectStyle}>
                  <option value="">No limit</option>
                  <option value="5">Top 5</option><option value="10">Top 10</option><option value="20">Top 20</option><option value="50">Top 50</option>
                </select>
              </div>
            )}
            {localDc.groupBy && isChart && (
              <div style={{ marginTop: '10px' }}>
                <label style={labelStyle}>Date Grouping (X)</label>
                <select value={localDc.dateGrouping || 'none'} onChange={function(e) { commitDc('dateGrouping', e.target.value); }} style={selectStyle}>
                  <option value="none">None (raw values)</option>
                  <option value="day">By Day</option><option value="week">By Week</option><option value="month">By Month</option><option value="quarter">By Quarter</option><option value="year">By Year</option>
                </select>
              </div>
            )}
          </div>

          {/* Chart options */}
          {isChart && (
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Chart Options</div>
              {(localType === 'bar' || localType === 'area' || localType === 'combo') && localDc.series && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151', cursor: 'pointer', marginBottom: '8px' }}>
                  <input type="checkbox" checked={localVc.stacked || false} onChange={function(e) { commitVc('stacked', e.target.checked); }} /> Stacked
                </label>
              )}
              {localType === 'combo' && (localDc.series ? seriesOptions : []).length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <label style={labelStyle}>Show as line (vs bar)</label>
                  {seriesOptions.map(function(sk) {
                    var on = Array.isArray(localVc.comboLineSeries) && localVc.comboLineSeries.indexOf(sk) !== -1;
                    return <label key={sk} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#374151', cursor: 'pointer' }}>
                      <input type="checkbox" checked={on} onChange={function() { var cur = Array.isArray(localVc.comboLineSeries) ? localVc.comboLineSeries.slice() : []; if (on) cur = cur.filter(function(x: string) { return x !== sk; }); else cur.push(sk); commitVc('comboLineSeries', cur); }} /> {sk}
                    </label>;
                  })}
                </div>
              )}
              {localType === 'bar' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151', cursor: 'pointer', marginBottom: '8px' }}>
                  <input type="checkbox" checked={localVc.horizontal || false} onChange={function(e) { commitVc('horizontal', e.target.checked); }} /> Horizontal bars
                </label>
              )}
              {['bar', 'line', 'area', 'pie', 'donut'].indexOf(localType) !== -1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151', cursor: 'pointer', marginBottom: '8px' }}>
                  <input type="checkbox" checked={localVc.showLabels || false} onChange={function(e) { commitVc('showLabels', e.target.checked); }} /> Show data labels
                </label>
              )}
              {['bar', 'line', 'area', 'pie', 'donut', 'combo'].indexOf(localType) !== -1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151', cursor: 'pointer', marginBottom: '8px' }}>
                  <input type="checkbox" checked={localVc.showLegend || false} onChange={function(e) { commitVc('showLegend', e.target.checked); }} /> Show legend
                </label>
              )}
              {localType === 'data_table' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151', cursor: 'pointer', marginBottom: '8px' }}>
                  <input type="checkbox" checked={localVc.dataBars !== false} onChange={function(e) { commitVc('dataBars', e.target.checked); }} /> Data bars (conditional formatting)
                </label>
              )}
              <div style={{ marginBottom: '8px' }}>
                <label style={labelStyle}>Color Theme</label>
                <select value={localVc.colorTheme || 'default'} onChange={function(e) { commitVc('colorTheme', e.target.value); }} style={selectStyle}>
                  <option value="default">Accent (dashboard)</option>
                  <option value="blue">Blues</option><option value="green">Greens</option><option value="purple">Purples</option><option value="warm">Warm</option><option value="mono">Monochrome</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Value Format</label>
                <select value={localVc.valueFormat || 'number'} onChange={function(e) { commitVc('valueFormat', e.target.value); }} style={selectStyle}>
                  <option value="number">Number (1,234)</option><option value="compact">Compact (1.2K)</option><option value="currency">Currency ($1.2K)</option><option value="percent">Percent (12.3%)</option>
                </select>
              </div>
            </div>
          )}

          {/* KPI options */}
          {localType === 'kpi_card' && localDc.tableId && (
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>KPI Display</div>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Format</label>
                <select value={localVc.format || 'number'} onChange={function(e) { commitVc('format', e.target.value); }} style={selectStyle}>
                  <option value="number">Number</option><option value="compact">Compact</option><option value="currency">Currency ($)</option><option value="percent">Percent (%)</option>
                </select>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Target (optional)</label>
                <input type="number" value={localVc.target || ''} onChange={function(e) { commitVc('target', e.target.value); }} style={inputStyle} placeholder="e.g. 1000" />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Sparkline over (date column)</label>
                <select value={localVc.sparklineDateColumn || ''} onChange={function(e) { commitVc('sparklineDateColumn', e.target.value || undefined); }} style={selectStyle}>
                  <option value="">— None —</option>
                  {dateCols.map(function(c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
                </select>
              </div>
              {localVc.sparklineDateColumn && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={labelStyle}>Sparkline grain</label>
                  <select value={localVc.sparklineGrain || 'month'} onChange={function(e) { commitVc('sparklineGrain', e.target.value); }} style={selectStyle}>
                    <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="quarter">Quarterly</option>
                  </select>
                </div>
              )}
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Compare vs previous (trend)</label>
                <select value={localVc.comparePeriod || 'none'} onChange={function(e) { commitVc('comparePeriod', e.target.value); }} style={selectStyle}>
                  <option value="none">No comparison</option>
                  <option value="month">vs last month</option><option value="quarter">vs last quarter</option><option value="year">vs last year</option>
                </select>
              </div>
              {localVc.comparePeriod && localVc.comparePeriod !== 'none' && (
                <div>
                  <label style={labelStyle}>Comparison date column</label>
                  <select value={localVc.compareDateColumn || ''} onChange={function(e) { commitVc('compareDateColumn', e.target.value || undefined); }} style={selectStyle}>
                    <option value="">— Select date column —</option>
                    {dateCols.map(function(c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Gauge options */}
          {localType === 'gauge' && localDc.tableId && (
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Gauge</div>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Target</label>
                <input type="number" value={localVc.target || ''} onChange={function(e) { commitVc('target', e.target.value); }} style={inputStyle} placeholder="e.g. 100" />
              </div>
              <div>
                <label style={labelStyle}>Value Format</label>
                <select value={localVc.format || 'number'} onChange={function(e) { commitVc('format', e.target.value); }} style={selectStyle}>
                  <option value="number">Number</option><option value="compact">Compact</option><option value="currency">Currency ($)</option><option value="percent">Percent (%)</option>
                </select>
              </div>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

// ============================================================
// Main Dashboard Editor
// ============================================================
export function DashboardEditor({ dashboardId, tables }: { dashboardId: string; tables: TableInfo[] }) {
  var router = useRouter();
  var [dashboard, setDashboard] = useState<DashboardData | null>(null);
  var [loading, setLoading] = useState(true);
  var [editingWidget, setEditingWidget] = useState<string | null>(null);
  var [editingName, setEditingName] = useState(false);
  var [nameValue, setNameValue] = useState('');
  var [isEditing, setIsEditing] = useState(true);
  var [showThemeMenu, setShowThemeMenu] = useState(false);

  // Permissions modal
  var [showPermissions, setShowPermissions] = useState(false);
  var [permUsers, setPermUsers] = useState<any[]>([]);
  var [permGroups, setPermGroups] = useState<any[]>([]);
  var [allUsers, setAllUsers] = useState<any[]>([]);
  var [allGroups, setAllGroups] = useState<any[]>([]);
  var [permLoading, setPermLoading] = useState(false);
  var [addPermType, setAddPermType] = useState<'user' | 'group'>('user');
  var [addPermId, setAddPermId] = useState('');
  var [addPermLevel, setAddPermLevel] = useState('viewer');

  var widgets = dashboard?.widgets || [];
  var hook = useDashboardData({ dashboardId: dashboardId, widgets: widgets, mode: 'auth' });

  var fetchDashboard = useCallback(async function() {
    try {
      var r = await fetch('/api/insights/dashboards/' + dashboardId);
      if (r.ok) { var d = await r.json(); setDashboard(d); setNameValue(d.name); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [dashboardId]);
  useEffect(function() { fetchDashboard(); }, [fetchDashboard]);

  // ---- Widget CRUD ----
  async function addWidget(type: string) {
    if (!dashboard) return;
    var maxY = 0; widgets.forEach(function(w) { var b = w.layoutY + w.layoutH; if (b > maxY) maxY = b; });
    var defaults: any = { name: 'New ' + (ADD_TYPES.find(function(t) { return t.value === type; })?.label || 'Widget'), type: type, layoutX: 0, layoutY: maxY };
    if (type === 'slicer') { defaults.name = 'Filter'; defaults.dataConfig = { control: 'checklist' }; defaults.vizConfig = { placement: 'topbar', label: 'Filter' }; defaults.layoutW = 3; defaults.layoutH = 2; }
    else if (type === 'kpi_card' || type === 'gauge') { defaults.layoutW = 3; defaults.layoutH = 2; }
    else if (type === 'text') { defaults.layoutW = 12; defaults.layoutH = 2; }
    else { defaults.layoutW = 6; defaults.layoutH = 4; }
    var r = await fetch('/api/insights/dashboards/' + dashboardId + '/widgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(defaults) });
    if (r.ok) { var w = await r.json(); setDashboard(function(prev) { return prev ? Object.assign({}, prev, { widgets: prev.widgets.concat([w]) }) : prev; }); if (type !== 'text') setEditingWidget(w.id); }
  }

  async function updateWidget(widgetId: string, updates: any) {
    var current = widgets.find(function(w) { return w.id === widgetId; });
    var merged = Object.assign({}, current, updates) as WidgetData;
    setDashboard(function(prev) { return prev ? Object.assign({}, prev, { widgets: prev.widgets.map(function(w) { return w.id === widgetId ? merged : w; }) }) : prev; });
    await fetch('/api/insights/widgets/' + widgetId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (updates.dataConfig || updates.type || updates.vizConfig) {
      if (merged.type !== 'slicer' && merged.type !== '_settings' && merged.type !== 'text') hook.refetchWidget(merged);
    }
  }

  function moveWidget(widgetId: string, direction: number) {
    if (!dashboard) return;
    var ws = widgets.slice();
    var idx = ws.findIndex(function(w) { return w.id === widgetId; });
    var newIdx = idx + direction;
    if (idx === -1 || newIdx < 0 || newIdx >= ws.length) return;
    var tmp = ws[idx]; ws[idx] = ws[newIdx]; ws[newIdx] = tmp;
    var layouts: any[] = [];
    for (var i = 0; i < ws.length; i++) { ws[i] = Object.assign({}, ws[i], { sortOrder: i }); layouts.push({ id: ws[i].id, x: ws[i].layoutX, y: ws[i].layoutY, w: ws[i].layoutW, h: ws[i].layoutH, sortOrder: i }); }
    setDashboard(function(prev) { return prev ? Object.assign({}, prev, { widgets: ws }) : prev; });
    fetch('/api/insights/dashboards/' + dashboardId + '/layout', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layouts: layouts }) });
  }

  async function duplicateWidget(widget: WidgetData) {
    if (!dashboard) return;
    var maxY = 0; widgets.forEach(function(w) { var b = w.layoutY + w.layoutH; if (b > maxY) maxY = b; });
    var r = await fetch('/api/insights/dashboards/' + dashboardId + '/widgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: widget.name + ' (copy)', type: widget.type, dataConfig: widget.dataConfig, vizConfig: widget.vizConfig, layoutX: 0, layoutY: maxY, layoutW: widget.layoutW, layoutH: widget.layoutH }) });
    if (r.ok) { var w = await r.json(); setDashboard(function(prev) { return prev ? Object.assign({}, prev, { widgets: prev.widgets.concat([w]) }) : prev; }); }
  }

  async function deleteWidget(widgetId: string) {
    if (!confirm('Delete this widget?')) return;
    await fetch('/api/insights/widgets/' + widgetId, { method: 'DELETE' });
    setDashboard(function(prev) { return prev ? Object.assign({}, prev, { widgets: prev.widgets.filter(function(w) { return w.id !== widgetId; }) }) : prev; });
    if (editingWidget === widgetId) setEditingWidget(null);
  }

  // ---- Theme (persisted via a hidden _settings widget) ----
  async function setDashboardTheme(themeName: string, accent: string) {
    if (!dashboard) return;
    var settings = widgets.find(function(w) { return w.type === '_settings'; });
    var vc = { theme: themeName, accent: accent };
    if (settings) { updateWidget(settings.id, { vizConfig: vc }); }
    else {
      var r = await fetch('/api/insights/dashboards/' + dashboardId + '/widgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '_settings', type: '_settings', vizConfig: vc, layoutX: 0, layoutY: 0, layoutW: 0, layoutH: 0 }) });
      if (r.ok) { var w = await r.json(); setDashboard(function(prev) { return prev ? Object.assign({}, prev, { widgets: prev.widgets.concat([w]) }) : prev; }); }
    }
  }

  // ---- Permissions ----
  async function fetchPermissions() {
    setPermLoading(true);
    try {
      var [permRes, usersRes, groupsRes] = await Promise.all([fetch('/api/insights/dashboards/' + dashboardId), fetch('/api/users'), fetch('/api/groups')]);
      if (permRes.ok) { var d = await permRes.json(); var perms = d.permissions || []; setPermUsers(perms.filter(function(p: any) { return p.userId; })); setPermGroups(perms.filter(function(p: any) { return p.groupId; })); }
      if (usersRes.ok) { var ud = await usersRes.json(); setAllUsers(ud.users || []); }
      if (groupsRes.ok) { var gd = await groupsRes.json(); setAllGroups(gd.groups || gd || []); }
    } catch (e) { console.error(e); } finally { setPermLoading(false); }
  }
  async function addPermission() { if (!addPermId) return; var body: any = { permission: addPermLevel }; if (addPermType === 'user') body.userId = addPermId; else body.groupId = addPermId; await fetch('/api/insights/dashboards/' + dashboardId + '/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); setAddPermId(''); fetchPermissions(); }
  async function removePermission(permId: string) { await fetch('/api/insights/dashboards/' + dashboardId + '/permissions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissionId: permId }) }); fetchPermissions(); }
  async function updatePermissionLevel(permId: string, level: string) { await fetch('/api/insights/dashboards/' + dashboardId + '/permissions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissionId: permId, permission: level }) }); fetchPermissions(); }

  async function saveName() {
    if (!nameValue.trim() || !dashboard) return;
    await fetch('/api/insights/dashboards/' + dashboardId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nameValue.trim() }) });
    setDashboard(function(prev) { return prev ? Object.assign({}, prev, { name: nameValue.trim() }) : prev; });
    setEditingName(false);
  }
  async function togglePublish() {
    if (!dashboard) return;
    var newStatus = dashboard.status === 'published' ? 'draft' : 'published';
    await fetch('/api/insights/dashboards/' + dashboardId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
    setDashboard(function(prev) { return prev ? Object.assign({}, prev, { status: newStatus }) : prev; });
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading dashboard...</div>;
  if (!dashboard) return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Dashboard not found</div>;

  var editingWidgetObj = editingWidget ? widgets.find(function(w) { return w.id === editingWidget; }) : null;
  var editingSeriesOptions: string[] = (editingWidget && hook.data[editingWidget] && hook.data[editingWidget].meta && hook.data[editingWidget].meta.series) || [];

  // Per-widget editor toolbar injected into the shared canvas header.
  function widgetChrome(widget: WidgetData) {
    if (!isEditing) return null;
    var isChartW = ['bar', 'line', 'area', 'combo', 'pie', 'donut', 'scatter'].indexOf(widget.type) !== -1;
    return (
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        <button onClick={function() { updateWidget(widget.id, { layoutW: Math.max(2, widget.layoutW - 1) }); }} style={chromeBtn} title="Narrower">◀</button>
        <button onClick={function() { updateWidget(widget.id, { layoutW: Math.min(12, widget.layoutW + 1) }); }} style={chromeBtn} title="Wider">▶</button>
        <button onClick={function() { updateWidget(widget.id, { layoutH: Math.max(2, widget.layoutH - 1) }); }} style={chromeBtn} title="Shorter">▲</button>
        <button onClick={function() { updateWidget(widget.id, { layoutH: Math.min(10, widget.layoutH + 1) }); }} style={chromeBtn} title="Taller">▼</button>
        <span style={divider} />
        <button onClick={function() { setEditingWidget(editingWidget === widget.id ? null : widget.id); }} style={Object.assign({}, chromeBtn, { color: editingWidget === widget.id ? '#2563eb' : '#9ca3af' })} title="Configure">⚙</button>
        <button onClick={function() { moveWidget(widget.id, -1); }} style={chromeBtn} title="Move up">⬆</button>
        <button onClick={function() { moveWidget(widget.id, 1); }} style={chromeBtn} title="Move down">⬇</button>
        <span style={divider} />
        <button onClick={function() { duplicateWidget(widget); }} style={chromeBtn} title="Duplicate">⧉</button>
        {isChartW && <button onClick={function() { exportWidgetAsPng(widget.id, widget.name); }} style={chromeBtn} title="Export PNG">⬇️</button>}
        <button onClick={function() { deleteWidget(widget.id); }} style={chromeBtn} title="Delete">✕</button>
      </div>
    );
  }

  var theme = hook.theme;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.bg }}>
      {/* Toolbar */}
      <div style={{ background: theme.panelBg, borderBottom: '1px solid ' + theme.border, padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>{dashboard.icon || '📊'}</span>
          {editingName && isEditing ? (
            <input type="text" value={nameValue} onChange={function(e) { setNameValue(e.target.value); }} onBlur={saveName} onKeyDown={function(e) { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameValue(dashboard?.name || ''); } }} style={Object.assign({}, inputStyle, { width: '300px', fontSize: '16px', fontWeight: 700 })} autoFocus />
          ) : (
            <h1 onClick={function() { if (isEditing) setEditingName(true); }} style={{ fontSize: '16px', fontWeight: 700, color: theme.text, margin: 0, cursor: isEditing ? 'pointer' : 'default' }} title={isEditing ? 'Click to rename' : ''}>{dashboard.name}</h1>
          )}
          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: dashboard.status === 'published' ? '#dcfce7' : '#f3f4f6', color: dashboard.status === 'published' ? '#166534' : '#6b7280' }}>{dashboard.status === 'published' ? 'Published' : 'Draft'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Theme menu */}
          <div style={{ position: 'relative' as const }}>
            <button onClick={function() { setShowThemeMenu(!showThemeMenu); }} style={toolBtn(theme)}>🎨 Theme</button>
            {showThemeMenu && (
              <div style={{ position: 'absolute' as const, top: 'calc(100% + 4px)', right: 0, zIndex: 100, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '12px', width: '200px' }} onMouseLeave={function() { setShowThemeMenu(false); }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, marginBottom: '6px' }}>Mode</div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  <button onClick={function() { setDashboardTheme('light', theme.accent); }} style={{ flex: 1, padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid ' + (theme.name === 'light' ? '#2563eb' : '#e5e7eb'), background: theme.name === 'light' ? '#eff6ff' : '#fff', cursor: 'pointer' }}>☀️ Light</button>
                  <button onClick={function() { setDashboardTheme('dark', theme.accent); }} style={{ flex: 1, padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid ' + (theme.name === 'dark' ? '#2563eb' : '#e5e7eb'), background: theme.name === 'dark' ? '#eff6ff' : '#fff', cursor: 'pointer' }}>🌙 Dark</button>
                </div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, marginBottom: '6px' }}>Accent</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px' }}>
                  {ACCENTS.map(function(c) { return <button key={c} onClick={function() { setDashboardTheme(theme.name, c); }} style={{ width: '24px', height: '24px', borderRadius: '50%', background: c, border: theme.accent.toLowerCase() === c.toLowerCase() ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer' }} />; })}
                </div>
              </div>
            )}
          </div>
          <button onClick={function() { setIsEditing(!isEditing); }} style={Object.assign({}, toolBtn(theme), { background: isEditing ? '#eff6ff' : theme.panelBg, color: isEditing ? '#1d4ed8' : theme.subtext })}>{isEditing ? '👁 View' : '✏️ Edit'}</button>
          <button onClick={function() { setShowPermissions(true); fetchPermissions(); }} style={toolBtn(theme)}>🔒 Share</button>
          <select value={dashboard.visibility} onChange={function(e) { fetch('/api/insights/dashboards/' + dashboardId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility: e.target.value }) }); setDashboard(function(prev) { return prev ? Object.assign({}, prev, { visibility: e.target.value }) : prev; }); }} style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '6px', border: '1px solid ' + theme.border, background: theme.panelBg, color: theme.subtext, cursor: 'pointer' }}>
            <option value="private">🔒 Private</option><option value="workspace">🏢 Workspace</option><option value="public">🌐 All Users</option>
          </select>
          {dashboard.status === 'published' && (
            <button onClick={async function() { var r = await fetch('/api/insights/dashboards/' + dashboardId + '/embed-token', { method: 'POST' }); if (r.ok) { var d = await r.json(); var fullUrl = window.location.origin + d.embedUrl; try { await navigator.clipboard.writeText(fullUrl); } catch {} alert('Embed URL copied:\n\n' + fullUrl); } }} style={toolBtn(theme)}>📋 Embed</button>
          )}
          <button onClick={togglePublish} style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: '1px solid', cursor: 'pointer', background: dashboard.status === 'published' ? '#fef2f2' : '#f0fdf4', borderColor: dashboard.status === 'published' ? '#fecaca' : '#bbf7d0', color: dashboard.status === 'published' ? '#991b1b' : '#166534' }}>{dashboard.status === 'published' ? 'Unpublish' : 'Publish'}</button>
        </div>
      </div>

      {/* Add Widget bar */}
      {isEditing && (
        <div style={{ background: theme.panelBg, borderBottom: '1px solid ' + theme.border, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: theme.subtext, marginRight: '8px' }}>ADD:</span>
          {ADD_TYPES.map(function(wt) { return (
            <button key={wt.value} onClick={function() { addWidget(wt.value); }} style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid ' + theme.border, borderRadius: '6px', background: theme.cardBg, cursor: 'pointer', color: theme.text, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>{wt.icon}</span> {wt.label}
            </button>
          ); })}
        </div>
      )}

      {/* Shared canvas (grid + filter bar) */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DashboardCanvas
          widgets={widgets}
          hook={hook}
          interactive={true}
          editing={isEditing}
          renderWidgetChrome={isEditing ? widgetChrome : undefined}
          onRemoveSlicerWidget={deleteWidget}
          emptyState={isEditing ? <div style={{ textAlign: 'center', padding: '80px 24px', color: theme.subtext }}><div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div><p style={{ fontSize: '16px', fontWeight: 500, color: theme.text }}>Empty dashboard</p><p style={{ fontSize: '13px' }}>Use the ADD bar above to drop in charts, KPIs, and slicers.</p></div> : undefined}
        />
      </div>

      {/* Config panel */}
      {isEditing && editingWidgetObj && (
        <WidgetConfigPanel widget={editingWidgetObj} tables={tables} seriesOptions={editingSeriesOptions} onUpdate={function(updates) { updateWidget(editingWidgetObj!.id, updates); }} onClose={function() { setEditingWidget(null); }} />
      )}

      {/* Permissions modal */}
      {showPermissions && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setShowPermissions(false); }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', margin: '16px' }} onClick={function(e) { e.stopPropagation(); }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Dashboard Permissions</h3><p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>Control who can view or edit this dashboard</p></div>
              <button onClick={function() { setShowPermissions(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <button onClick={function() { setAddPermType('user'); setAddPermId(''); }} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: addPermType === 'user' ? '#eff6ff' : '#f3f4f6', color: addPermType === 'user' ? '#1d4ed8' : '#6b7280', fontWeight: 600 }}>👤 User</button>
                <button onClick={function() { setAddPermType('group'); setAddPermId(''); }} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: addPermType === 'group' ? '#eff6ff' : '#f3f4f6', color: addPermType === 'group' ? '#1d4ed8' : '#6b7280', fontWeight: 600 }}>👥 Group</button>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select value={addPermId} onChange={function(e) { setAddPermId(e.target.value); }} style={Object.assign({}, selectStyle, { flex: 1 })}>
                  <option value="">Select {addPermType}...</option>
                  {addPermType === 'user' ? allUsers.map(function(u: any) { return <option key={u.id} value={u.id}>{u.name || u.email}</option>; }) : allGroups.map(function(g: any) { return <option key={g.id} value={g.id}>{g.name}</option>; })}
                </select>
                <select value={addPermLevel} onChange={function(e) { setAddPermLevel(e.target.value); }} style={Object.assign({}, selectStyle, { width: '100px' })}><option value="viewer">Viewer</option><option value="editor">Editor</option></select>
                <button onClick={addPermission} disabled={!addPermId} style={{ padding: '6px 12px', fontSize: '11px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: addPermId ? 1 : 0.5, fontWeight: 600 }}>Add</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
              {permLoading ? <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>Loading...</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {permUsers.length === 0 && permGroups.length === 0 && <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>No permissions set. Visibility is controlled by publish status.</p>}
                  {permUsers.map(function(p: any) { var user = allUsers.find(function(u: any) { return u.id === p.userId; }); return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#f9fafb', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, color: '#1d4ed8' }}>{(user?.name || user?.email || '?')[0].toUpperCase()}</div><div><div style={{ fontSize: '12px', fontWeight: 500, color: '#111827' }}>{user?.name || user?.email || 'Unknown'}</div></div></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><select value={p.permission} onChange={function(e) { updatePermissionLevel(p.id, e.target.value); }} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: 'none', background: p.permission === 'editor' ? '#dbeafe' : '#f3f4f6', color: p.permission === 'editor' ? '#1d4ed8' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}><option value="viewer">Viewer</option><option value="editor">Editor</option></select><button onClick={function() { removePermission(p.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '14px' }}>✕</button></div>
                    </div>
                  ); })}
                  {permGroups.map(function(p: any) { var group = allGroups.find(function(g: any) { return g.id === p.groupId; }); return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#f9fafb', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>👥</div><div style={{ fontSize: '12px', fontWeight: 500, color: '#111827' }}>{group?.name || 'Unknown group'}</div></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><select value={p.permission} onChange={function(e) { updatePermissionLevel(p.id, e.target.value); }} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: 'none', background: p.permission === 'editor' ? '#dbeafe' : '#f3f4f6', color: p.permission === 'editor' ? '#1d4ed8' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}><option value="viewer">Viewer</option><option value="editor">Editor</option></select><button onClick={function() { removePermission(p.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '14px' }}>✕</button></div>
                    </div>
                  ); })}
                </div>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}><button onClick={function() { setShowPermissions(false); }} style={{ padding: '6px 14px', fontSize: '12px', background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#374151' }}>Done</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

var chromeBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '11px', padding: '2px' };
var divider: React.CSSProperties = { width: '1px', height: '12px', background: '#e5e7eb' };
function toolBtn(theme: any): React.CSSProperties { return { padding: '6px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: '1px solid ' + theme.border, cursor: 'pointer', background: theme.panelBg, color: theme.subtext }; }
