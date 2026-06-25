'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ZAxis } from 'recharts';

// ---- Types ----
interface TableInfo { id: string; name: string; columns: { id: string; name: string; type: string; settings?: any }[]; }
interface WidgetData { id: string; name: string; type: string; dataConfig: any; vizConfig: any; layoutX: number; layoutY: number; layoutW: number; layoutH: number; sortOrder: number; }
interface DashboardData { id: string; name: string; slug: string; description?: string; icon?: string; status: string; visibility: string; widgets: WidgetData[]; oikos?: any; }

// Filter now stores an array of selected values, not a single value.
interface DashboardFilter { tableId: string; columnId: string; values: string[]; }

// ---- Constants ----
var COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];
var COLOR_THEMES: Record<string, string[]> = {
  default: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'],
  blue: ['#1e3a5f', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#1d4ed8', '#1e40af', '#1e3a8a'],
  green: ['#064e3b', '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#047857', '#065f46', '#064e3b'],
  purple: ['#4c1d95', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#5b21b6', '#4c1d95', '#3b0764'],
  warm: ['#9a3412', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#dc2626', '#ef4444', '#f59e0b', '#eab308', '#ca8a04'],
  mono: ['#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb'],
};
var NUMERIC_TYPES = ['number', 'currency', 'percent', 'rating', 'progress'];
var AGG_FUNCTIONS = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count_distinct', label: 'Count Distinct' },
];
var WIDGET_TYPES = [
  { value: 'kpi_card', label: 'KPI Card', icon: '🔢' },
  { value: 'bar', label: 'Bar Chart', icon: '📊' },
  { value: 'line', label: 'Line Chart', icon: '📈' },
  { value: 'pie', label: 'Pie Chart', icon: '🥧' },
  { value: 'donut', label: 'Donut Chart', icon: '🍩' },
  { value: 'area', label: 'Area Chart', icon: '📉' },
  { value: 'scatter', label: 'Scatter Plot', icon: '⚬' },
  { value: 'data_table', label: 'Data Table', icon: '📋' },
  { value: 'text', label: 'Text Block', icon: '📝' },
];

// Custom tick renderer that truncates long axis labels.
// The full label still shows in the chart tooltip on bar hover.
var MAX_LABEL_CHARS = 18;
function renderTruncatedTick(props: any) {
  var payload = props.payload || {};
  var raw = String(payload.value || '');
  var display = raw.length > MAX_LABEL_CHARS ? raw.slice(0, MAX_LABEL_CHARS - 1) + '…' : raw;
  return (
    <g transform={'translate(' + props.x + ',' + props.y + ')'}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        transform="rotate(-45)"
        fontSize={10}
        fill="#6b7280">
        <title>{raw}</title>
        {display}
      </text>
    </g>
  );
}

// Export a widget's rendered chart to PNG via SVG-to-Canvas trick.
// No external libs needed — browser native.
function exportWidgetAsPng(widgetId: string, widgetName: string) {
  var widgetEl = document.querySelector('[data-widget-id="' + widgetId + '"]');
  if (!widgetEl) { alert('Could not find widget to export'); return; }

  var svg = widgetEl.querySelector('svg');
  if (!svg) {
    // Try html2canvas fallback path for non-SVG widgets (data tables, KPI cards)
    alert('PNG export currently supports chart widgets (bar, line, area, pie, donut, scatter).');
    return;
  }

  var svgRect = svg.getBoundingClientRect();
  var width = Math.ceil(svgRect.width);
  var height = Math.ceil(svgRect.height);

  // Clone the SVG so we can inline styles without disturbing the live one
  var clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // Serialize SVG to string
  var serializer = new XMLSerializer();
  var svgString = serializer.serializeToString(clone);
  var svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  var url = URL.createObjectURL(svgBlob);

  var img = new Image();
  img.onload = function() {
    var canvas = document.createElement('canvas');
    // 2x for retina sharpness
    canvas.width = width * 2;
    canvas.height = height * 2;
    var ctx = canvas.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); return; }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);

    canvas.toBlob(function(blob) {
      if (!blob) return;
      var dlUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = dlUrl;
      a.download = (widgetName || 'chart').replace(/[^a-z0-9_-]+/gi, '_') + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(dlUrl); }, 1000);
    }, 'image/png');
  };
  img.onerror = function() {
    URL.revokeObjectURL(url);
    alert('Failed to render chart for export. Try refreshing the page.');
  };
  img.src = url;
}

// Y-axis number formatter. "number" = plain comma-separated, "compact" = 45K/1.2M,
// "currency" = $-prefixed compact, "percent" = N.N%.
function formatYAxisValue(value: any, format: string): string {
  var num = Number(value);
  if (isNaN(num)) return String(value);

  if (format === 'percent') {
    return num.toFixed(1) + '%';
  }

  // Plain number — no abbreviation, just thousands separators
  if (format === 'number') {
    return num.toLocaleString();
  }

  // Compact and currency both abbreviate
  var prefix = format === 'currency' ? '$' : '';
  var abs = Math.abs(num);

  if (abs >= 1000000000) return prefix + (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (abs >= 1000000) return prefix + (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1000) return prefix + (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return prefix + num.toLocaleString();
}

// ---- Styles ----
var inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#111827', fontSize: '12px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };
var selectStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#111827', fontSize: '12px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, cursor: 'pointer' };
var labelStyle: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '3px' };

// ============================================================
// SlicerPopover — multi-select checkbox filter
// ============================================================
function SlicerPopover(props: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  onRemove: () => void;
}) {
  var [open, setOpen] = useState(false);
  var [search, setSearch] = useState('');
  var anchorRef = useRef<HTMLDivElement | null>(null);
  var popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(function() {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return function() { document.removeEventListener('mousedown', handleClickOutside); };
  }, [open]);

  var filteredOptions = search.trim()
    ? props.options.filter(function(o) { return o.toLowerCase().includes(search.toLowerCase()); })
    : props.options;

  var allSelected = props.selected.length === 0 || props.selected.length === props.options.length;
  var summary = props.selected.length === 0
    ? 'All'
    : props.selected.length === 1
      ? props.selected[0]
      : props.selected.length + ' selected';

  function toggleValue(v: string) {
    if (props.selected.indexOf(v) === -1) {
      props.onChange(props.selected.concat([v]));
    } else {
      props.onChange(props.selected.filter(function(s) { return s !== v; }));
    }
  }

  function selectAll() { props.onChange([]); /* empty means "all" */ }
  function selectNone() { props.onChange(['__none__']); /* sentinel — matches nothing */ }
  function selectVisible() { props.onChange(filteredOptions.slice()); }

  return (
    <div style={{ position: 'relative' as const, display: 'inline-block' }}>
      <div
        ref={anchorRef}
        onClick={function() { setOpen(!open); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 4px 3px 8px',
          background: !allSelected ? '#eff6ff' : '#f3f4f6',
          border: '1px solid ' + (!allSelected ? '#93c5fd' : '#e5e7eb'),
          borderRadius: '6px',
          cursor: 'pointer',
        }}>
        <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 500 }}>{props.label}:</span>
        <span style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 600 }}>{summary}</span>
        <span style={{ fontSize: '8px', color: '#9ca3af' }}>▼</span>
        <button
          onClick={function(e) { e.stopPropagation(); props.onRemove(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '12px', padding: '0 2px', marginLeft: '2px' }}
          title="Remove filter">✕</button>
      </div>

      {open && (
        <div
          ref={popoverRef}
          style={{
            position: 'absolute' as const,
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 100,
            width: '260px',
            maxHeight: '360px',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            display: 'flex',
            flexDirection: 'column' as const,
          }}>
          {/* Search */}
          <div style={{ padding: '8px', borderBottom: '1px solid #f3f4f6' }}>
            <input
              type="text"
              autoFocus
              value={search}
              onChange={function(e) { setSearch(e.target.value); }}
              placeholder="Search values..."
              style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' as const }} />
          </div>

          {/* Quick actions */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '8px', fontSize: '10px' }}>
            <button onClick={selectAll} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: '2px 4px', fontWeight: 600 }}>Select all</button>
            <button onClick={selectNone} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px 4px', fontWeight: 600 }}>Select none</button>
            {search.trim() && filteredOptions.length > 0 && (
              <button onClick={selectVisible} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: '2px 4px', fontWeight: 600 }}>
                Select {filteredOptions.length} visible
              </button>
            )}
          </div>

          {/* Options list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
            {filteredOptions.length === 0 && (
              <div style={{ padding: '12px', fontSize: '11px', color: '#9ca3af', textAlign: 'center' as const }}>No matches</div>
            )}
            {filteredOptions.map(function(opt) {
              var checked = allSelected || props.selected.indexOf(opt) !== -1;
              // If user clicked "Clear" we set sentinel — in that case nothing is checked.
              if (props.selected.length === 1 && props.selected[0] === '__none__') checked = false;
              return (
                <label key={opt}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', fontSize: '11px', cursor: 'pointer', color: '#374151' }}
                  onMouseEnter={function(e) { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                  onMouseLeave={function(e) { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={function() {
                      // If currently "all" (empty selected), clicking a box should START a selection of all others except this one
                      if (allSelected && !(props.selected.length === 1 && props.selected[0] === '__none__')) {
                        // First click: switch from "all" to "everything except this one" — most users want the opposite
                        // Simpler behavior: switch to "only this one selected"
                        props.onChange([opt]);
                      } else {
                        // Clear sentinel state on first interaction
                        var current = (props.selected.length === 1 && props.selected[0] === '__none__') ? [] : props.selected;
                        if (current.indexOf(opt) === -1) {
                          props.onChange(current.concat([opt]));
                        } else {
                          props.onChange(current.filter(function(s) { return s !== opt; }));
                        }
                      }
                    }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{opt}</span>
                </label>
              );
            })}
          </div>

          {/* Footer count */}
          <div style={{ padding: '6px 12px', borderTop: '1px solid #f3f4f6', fontSize: '10px', color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
            <span>{props.options.length} total values</span>
            <span>{allSelected ? 'All shown' : (props.selected.length === 1 && props.selected[0] === '__none__' ? 'None — chart will be empty' : props.selected.length + ' selected')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Widget Renderer ----
function WidgetChart({ widget, queryData, onCrossFilter }: { widget: WidgetData; queryData: any; onCrossFilter?: (label: string) => void }) {
  if (!queryData || (!queryData.data && queryData.value === undefined)) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '12px' }}>Configure data source →</div>;
  }

  var data = queryData.data;
  var vizConfig = widget.vizConfig || {};

  // KPI Card
  if (widget.type === 'kpi_card') {
    var kpiValue = queryData.value !== undefined ? queryData.value : (data[0]?.value || 0);
    var trend = queryData.trend;
    var format = vizConfig.format || 'number';
    var displayValue = format === 'currency' ? '$' + Number(kpiValue).toLocaleString() : format === 'percent' ? kpiValue + '%' : Number(kpiValue).toLocaleString();

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '16px' }}>
        <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{widget.name}</div>
        <div style={{ fontSize: '36px', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{displayValue}</div>
        {trend !== undefined && trend !== null && (
          <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '6px', color: trend > 0 ? '#16a34a' : trend < 0 ? '#dc2626' : '#6b7280' }}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend)}%
          </div>
        )}
        {queryData.meta && <div style={{ fontSize: '10px', color: '#d1d5db', marginTop: '8px' }}>{queryData.meta.rowCount} records</div>}
      </div>
    );
  }

  // Text Block
  if (widget.type === 'text') {
    return (
      <div style={{ padding: '16px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: '#374151', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const }}>{vizConfig.text || 'Double-click to edit text'}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '12px', padding: '20px', textAlign: 'center' as const, gap: '8px' }}>
        <div style={{ fontSize: '28px', opacity: 0.5 }}>🔍</div>
        <div style={{ fontWeight: 600, color: '#6b7280' }}>No data matches your filters</div>
        <div style={{ fontSize: '11px', color: '#9ca3af' }}>Try removing or adjusting the filters at the top of the dashboard.</div>
      </div>
    );
  }

  var dataKey = Object.keys(data[0]).find(function(k) { return k !== '_label' && k !== '_count'; }) || '_count';
  var chartColors = COLOR_THEMES[vizConfig.colorTheme || 'default'] || COLOR_THEMES.default;

  // Bar Chart
  if (widget.type === 'bar') {
    var isHorizontal = vizConfig.horizontal;
    // Auto-scroll when there are too many categories to fit comfortably.
    // Vertical bars: each bar needs ~36px of width; if the total exceeds the
    // widget we grow the chart wider and let the container scroll sideways.
    // Horizontal bars: each bar needs ~32px of height; grow taller and scroll down.
    var barThreshold = 35;
    var needsScroll = data.length > barThreshold;
    var scrollMinWidth = (!isHorizontal && needsScroll) ? (data.length * 36) + 'px' : undefined;
    var scrollMinHeight = (isHorizontal && needsScroll) ? (data.length * 32 + 60) + 'px' : undefined;
    return (
      <div style={{
        width: '100%',
        height: '100%',
        overflowX: (!isHorizontal && needsScroll) ? 'auto' : 'hidden',
        overflowY: (isHorizontal && needsScroll) ? 'auto' : 'hidden',
      }}>
      <div style={{
        width: scrollMinWidth || '100%',
        height: scrollMinHeight || '100%',
        minWidth: scrollMinWidth,
        minHeight: scrollMinHeight,
      }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={isHorizontal ? 'vertical' : 'horizontal'} margin={{ top: 10, right: 20, left: isHorizontal ? 80 : 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          {isHorizontal ? (<>
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={function(v) { return formatYAxisValue(v, vizConfig.valueFormat || 'number'); }} label={vizConfig.xLabel ? { value: vizConfig.xLabel, position: 'bottom', fontSize: 10, fill: '#9ca3af' } : undefined} />
            <YAxis dataKey="_label" type="category" tick={renderTruncatedTick} width={140} label={vizConfig.yLabel ? { value: vizConfig.yLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9ca3af' } : undefined} />
          </>) : (<>
            <XAxis dataKey="_label" tick={renderTruncatedTick} angle={-45} textAnchor="end" height={120} interval={0} label={vizConfig.xLabel ? { value: vizConfig.xLabel, position: 'bottom', offset: -10, fontSize: 10, fill: '#9ca3af' } : undefined} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={function(v) { return formatYAxisValue(v, vizConfig.valueFormat || 'number'); }} label={vizConfig.yLabel ? { value: vizConfig.yLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9ca3af' } : undefined} />
          </>)}
          <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
          {vizConfig.showLegend && <Legend fontSize={10} />}
          <Bar dataKey={dataKey} fill="#3B82F6" radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} cursor={onCrossFilter ? 'pointer' : 'default'}
            onClick={function(entry: any) { if (onCrossFilter && entry?._label) onCrossFilter(entry._label); }}
            label={vizConfig.showLabels ? { position: isHorizontal ? 'right' : 'top', fontSize: 9, fill: '#6b7280' } : false}>
            {data.map(function(_: any, i: number) { return <Cell key={i} fill={chartColors[i % chartColors.length]} />; })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
      </div>
    );
  }

  // Line Chart
  if (widget.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="_label" tick={renderTruncatedTick} angle={-45} textAnchor="end" height={120} interval={0} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={function(v) { return formatYAxisValue(v, vizConfig.valueFormat || 'number'); }} />
          <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
          {vizConfig.showLegend && <Legend fontSize={10} />}
          <Line type="monotone" dataKey={dataKey} stroke={chartColors[0]} strokeWidth={2} dot={{ r: 4 }}
            label={vizConfig.showLabels ? { position: 'top', fontSize: 9, fill: '#6b7280' } : false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Area Chart
  if (widget.type === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="_label" tick={renderTruncatedTick} angle={-45} textAnchor="end" height={120} interval={0} label={vizConfig.xLabel ? { value: vizConfig.xLabel, position: 'bottom', offset: -10, fontSize: 10, fill: '#9ca3af' } : undefined} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={function(v) { return formatYAxisValue(v, vizConfig.valueFormat || 'number'); }} label={vizConfig.yLabel ? { value: vizConfig.yLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9ca3af' } : undefined} />
          <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
          {vizConfig.showLegend && <Legend fontSize={10} />}
          <Area type="monotone" dataKey={dataKey} stroke={chartColors[0]} fill={chartColors[0]} fillOpacity={0.2}
            label={vizConfig.showLabels ? { position: 'top', fontSize: 9, fill: '#6b7280' } : false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Pie / Donut
  if (widget.type === 'pie' || widget.type === 'donut') {
    var innerRadius = widget.type === 'donut' ? '50%' : 0;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey={dataKey} nameKey="_label" cx="50%" cy="50%" innerRadius={innerRadius} outerRadius="75%" label={function(entry: any) { return entry._label; }} labelLine={true} fontSize={10}
            onClick={function(entry: any) { if (onCrossFilter && entry?._label) onCrossFilter(entry._label); }} cursor={onCrossFilter ? 'pointer' : 'default'}>
            {data.map(function(_: any, i: number) { return <Cell key={i} fill={chartColors[i % chartColors.length]} />; })}
          </Pie>
          <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // Scatter Chart
  if (widget.type === 'scatter') {
    var scatterData = data.map(function(d: any) { return { name: d._label, value: d[dataKey] || 0, count: d._count || 1 }; });
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={renderTruncatedTick} angle={-45} textAnchor="end" height={120} interval={0} />
          <YAxis dataKey="value" tick={{ fontSize: 10 }} tickFormatter={function(v) { return formatYAxisValue(v, vizConfig.valueFormat || 'number'); }} />
          <ZAxis dataKey="count" range={[40, 400]} />
          <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
          <Scatter data={scatterData} fill="#8B5CF6">
            {scatterData.map(function(_: any, i: number) { return <Cell key={i} fill={COLORS[i % COLORS.length]} />; })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // Data Table
  if (widget.type === 'data_table') {
    var columns = Object.keys(data[0] || {}).filter(function(k) { return k !== '_count'; });
    return (
      <div style={{ overflow: 'auto', height: '100%', padding: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr>
              {columns.map(function(col) { return (
                <th key={col} style={{ padding: '6px 10px', textAlign: 'left' as const, borderBottom: '2px solid #e5e7eb', fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', position: 'sticky' as const, top: 0, background: '#fff' }}>
                  {col === '_label' ? 'Category' : col}
                </th>
              ); })}
            </tr>
          </thead>
          <tbody>
            {data.map(function(row: any, ri: number) { return (
              <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6', background: ri % 2 === 0 ? '#fff' : '#fafafa' }}>
                {columns.map(function(col) { return (
                  <td key={col} style={{ padding: '6px 10px', color: '#374151' }}>
                    {typeof row[col] === 'number' ? Number(row[col]).toLocaleString() : String(row[col] || '')}
                  </td>
                ); })}
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    );
  }

  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '12px' }}>Unsupported type: {widget.type}</div>;
}

// ---- Widget Config Panel ----
function WidgetConfigPanel({ widget, tables, onUpdate, onClose }: { widget: WidgetData; tables: TableInfo[]; onUpdate: (config: any) => void; onClose: () => void }) {
  var [localDc, setLocalDc] = useState<any>(widget.dataConfig || {});
  var [localVc, setLocalVc] = useState<any>(widget.vizConfig || {});
  var [localName, setLocalName] = useState(widget.name);
  var [localType, setLocalType] = useState(widget.type);

  // Per-widget slicer: which column to filter on + distinct values for the checkbox list.
  var [sliceColumnId, setSliceColumnId] = useState('');
  var [sliceOptions, setSliceOptions] = useState<string[]>([]);
  var [sliceLoading, setSliceLoading] = useState(false);

  useEffect(function() {
    setLocalDc(widget.dataConfig || {});
    setLocalVc(widget.vizConfig || {});
    setLocalName(widget.name);
    setLocalType(widget.type);
    // Pre-load the slicer column if one was already saved on this widget.
    var existing = (widget.dataConfig && widget.dataConfig.filters && widget.dataConfig.filters[0]) || null;
    setSliceColumnId(existing ? existing.columnId : '');
    setSliceOptions([]);
  }, [widget.id]);

  // Fetch distinct values whenever the slicer column changes.
  useEffect(function() {
    if (!localDc.tableId || !sliceColumnId) { setSliceOptions([]); return; }
    setSliceLoading(true);
    fetch('/api/insights/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'distinct', tableId: localDc.tableId, columnId: sliceColumnId }),
    }).then(function(r) { return r.ok ? r.json() : { values: [] }; })
      .then(function(d) { setSliceOptions(d.values || []); })
      .catch(function() { setSliceOptions([]); })
      .finally(function() { setSliceLoading(false); });
  }, [sliceColumnId, localDc.tableId]);

  // Current slicer selection (values) pulled out of dataConfig.filters.
  var sliceFilter = (localDc.filters && localDc.filters.find(function(f: any) { return f.columnId === sliceColumnId; })) || null;
  var sliceValues: string[] = sliceFilter ? (sliceFilter.values || []) : [];

  function setSliceColumn(colId: string) {
    setSliceColumnId(colId);
    // Reset any existing widget filter when the column changes.
    commitDc('filters', colId ? [{ columnId: colId, operator: 'in', values: [] }] : []);
  }

  function setSliceSelection(values: string[]) {
    if (!sliceColumnId) return;
    // Empty array = "all" (no filter). Sentinel handled same as dashboard slicer.
    if (!values || values.length === 0) {
      commitDc('filters', [{ columnId: sliceColumnId, operator: 'in', values: [] }]);
    } else {
      commitDc('filters', [{ columnId: sliceColumnId, operator: 'in', values: values }]);
    }
  }

  var selectedTable = tables.find(function(t) { return t.id === localDc.tableId; });
  var numericColumns = selectedTable ? selectedTable.columns.filter(function(c) { return NUMERIC_TYPES.indexOf(c.type) !== -1; }) : [];

  function commitDc(key: string, val: any) {
    var next = Object.assign({}, localDc, { [key]: val });
    setLocalDc(next);
    onUpdate({ dataConfig: next });
  }
  function commitVc(key: string, val: any) {
    var next = Object.assign({}, localVc, { [key]: val });
    setLocalVc(next);
    onUpdate({ vizConfig: next });
  }

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '340px', background: '#ffffff', borderLeft: '1px solid #e5e7eb', zIndex: 50, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 12px rgba(0,0,0,0.08)' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Configure Widget</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '16px' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Widget Name</label>
          <input type="text" value={localName} onChange={function(e) { setLocalName(e.target.value); onUpdate({ name: e.target.value }); }} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Chart Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
            {WIDGET_TYPES.map(function(wt) {
              var active = localType === wt.value;
              return (
                <button key={wt.value} onClick={function() { setLocalType(wt.value); onUpdate({ type: wt.value }); }}
                  style={{ padding: '8px 4px', border: active ? '2px solid #2563eb' : '1px solid #e5e7eb', borderRadius: '6px', background: active ? '#eff6ff' : '#fff', cursor: 'pointer', textAlign: 'center' as const, fontSize: '10px', color: active ? '#1d4ed8' : '#6b7280' }}>
                  <div style={{ fontSize: '16px' }}>{wt.icon}</div>
                  <div style={{ marginTop: '2px' }}>{wt.label}</div>
                </button>
              );
            })}
          </div>
        </div>
        {localType === 'text' && (
          <div>
            <label style={labelStyle}>Text Content</label>
            <textarea value={localVc.text || ''} onChange={function(e) { commitVc('text', e.target.value); }}
              style={Object.assign({}, inputStyle, { minHeight: '80px', resize: 'vertical' as const })} placeholder="Enter text..." />
          </div>
        )}
        {localType !== 'text' && (<>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Data Source</div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Table</label>
              <select value={localDc.tableId || ''} onChange={function(e) { var next = { tableId: e.target.value, groupBy: '', columnId: '', function: 'count' }; setLocalDc(next); onUpdate({ dataConfig: next }); }} style={selectStyle}>
                <option value="">— Select table —</option>
                {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
              </select>
            </div>
            {localDc.tableId && localType !== 'kpi_card' && (
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Group By</label>
                <select value={localDc.groupBy || ''} onChange={function(e) { commitDc('groupBy', e.target.value); }} style={selectStyle}>
                  <option value="">— No grouping —</option>
                  {selectedTable?.columns.map(function(c) { return <option key={c.id} value={c.id}>{c.name} ({c.type})</option>; })}
                </select>
              </div>
            )}
            {localDc.tableId && (
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Measure Column</label>
                <select value={localDc.columnId || '*'} onChange={function(e) { commitDc('columnId', e.target.value); }} style={selectStyle}>
                  <option value="*">— All rows (count) —</option>
                  {selectedTable?.columns.map(function(c) { return <option key={c.id} value={c.id}>{c.name} ({c.type})</option>; })}
                </select>
              </div>
            )}
            {localDc.tableId && (
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Aggregation</label>
                <select value={localDc.function || 'count'} onChange={function(e) { commitDc('function', e.target.value); }} style={selectStyle}>
                  {AGG_FUNCTIONS.map(function(f) { return <option key={f.value} value={f.value}>{f.label}</option>; })}
                </select>
				{localDc.tableId && localType === 'data_table' && (
              <div style={{ marginTop: '10px', padding: '8px', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '10px', color: '#166534' }}>📋 Data table shows all grouped results with their aggregated values. Use Group By to define rows and Measure + Aggregation to define the value column.</span>
              </div>
            )}
              </div>
            )}
            {localDc.tableId && (
              <div>
                <label style={labelStyle}>Limit Results</label>
                <select value={localDc.limit || ''} onChange={function(e) { commitDc('limit', e.target.value ? parseInt(e.target.value) : null); }} style={selectStyle}>
                  <option value="">No limit</option>
                  <option value="5">Top 5</option>
                  <option value="10">Top 10</option>
                  <option value="20">Top 20</option>
                  <option value="50">Top 50</option>
                </select>
              </div>
            )}
            {localDc.tableId && (
              <div style={{ marginTop: '10px' }}>
                <label style={labelStyle}>Slice This Widget</label>
                <select value={sliceColumnId} onChange={function(e) { setSliceColumn(e.target.value); }} style={selectStyle}>
                  <option value="">— No widget slicer —</option>
                  {selectedTable?.columns.map(function(c) { return <option key={c.id} value={c.id}>{c.name} ({c.type})</option>; })}
                </select>
                {sliceColumnId && (
                  <div style={{ marginTop: '6px' }}>
                    {sliceLoading ? (
                      <span style={{ fontSize: '10px', color: '#9ca3af' }}>Loading values…</span>
                    ) : (
                      <SlicerPopover
                        label="Show"
                        options={sliceOptions}
                        selected={sliceValues}
                        onChange={function(next) { setSliceSelection(next); }}
                        onRemove={function() { setSliceColumn(''); }}
                      />
                    )}
                    <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                      Filters only this widget. Leave blank to show all.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
		  {localDc.tableId && ['bar', 'line', 'area', 'scatter', 'pie', 'donut', 'data_table'].indexOf(localType) !== -1 && (
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Chart Options</div>

              {['bar', 'line', 'area'].indexOf(localType) !== -1 && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={labelStyle}>Sort Order</label>
                  <select value={localVc.sortOrder || 'value_desc'} onChange={function(e) { commitVc('sortOrder', e.target.value); commitDc('orderBy', e.target.value === 'value_desc' ? { field: 'value', direction: 'desc' } : e.target.value === 'value_asc' ? { field: 'value', direction: 'asc' } : e.target.value === 'label_asc' ? { field: '_label', direction: 'asc' } : { field: '_label', direction: 'desc' }); }} style={selectStyle}>
                    <option value="value_desc">Highest first</option>
                    <option value="value_asc">Lowest first</option>
                    <option value="label_asc">A → Z</option>
                    <option value="label_desc">Z → A</option>
                  </select>
                </div>
              )}

              {localType === 'bar' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151', cursor: 'pointer', marginBottom: '8px' }}>
                  <input type="checkbox" checked={localVc.horizontal || false} onChange={function(e) { commitVc('horizontal', e.target.checked); }} />
                  Horizontal bars
                </label>
              )}

              {['bar', 'line', 'area', 'pie', 'donut'].indexOf(localType) !== -1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151', cursor: 'pointer', marginBottom: '8px' }}>
                  <input type="checkbox" checked={localVc.showLabels || false} onChange={function(e) { commitVc('showLabels', e.target.checked); }} />
                  Show data labels
                </label>
              )}

              {['bar', 'line', 'area', 'scatter'].indexOf(localType) !== -1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151', cursor: 'pointer', marginBottom: '8px' }}>
                  <input type="checkbox" checked={localVc.showLegend || false} onChange={function(e) { commitVc('showLegend', e.target.checked); }} />
                  Show legend
                </label>
              )}

              {['bar', 'line', 'area'].indexOf(localType) !== -1 && (<>
                <div style={{ marginBottom: '8px' }}>
                  <label style={labelStyle}>X-Axis Label</label>
                  <input type="text" value={localVc.xLabel || ''} onChange={function(e) { commitVc('xLabel', e.target.value); }} style={inputStyle} placeholder="Auto" />
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={labelStyle}>Y-Axis Label</label>
                  <input type="text" value={localVc.yLabel || ''} onChange={function(e) { commitVc('yLabel', e.target.value); }} style={inputStyle} placeholder="Auto" />
                </div>
              </>)}

              {localDc.groupBy && (
                <div style={{ marginBottom: '8px' }}>
                  <label style={labelStyle}>Date Grouping</label>
                  <select value={localDc.dateGrouping || 'none'} onChange={function(e) { commitDc('dateGrouping', e.target.value); }} style={selectStyle}>
                    <option value="none">None (raw values)</option>
                    <option value="day">By Day</option>
                    <option value="week">By Week</option>
                    <option value="month">By Month</option>
                    <option value="quarter">By Quarter</option>
                    <option value="year">By Year</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '8px' }}>
                <label style={labelStyle}>Color Theme</label>
                <select value={localVc.colorTheme || 'default'} onChange={function(e) { commitVc('colorTheme', e.target.value); }} style={selectStyle}>
                  <option value="default">Default (Multi-color)</option>
                  <option value="blue">Blues</option>
                  <option value="green">Greens</option>
                  <option value="purple">Purples</option>
                  <option value="warm">Warm (Red/Orange/Yellow)</option>
                  <option value="mono">Monochrome</option>
                </select>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label style={labelStyle}>Value Format (axis)</label>
                <select value={localVc.valueFormat || 'number'} onChange={function(e) { commitVc('valueFormat', e.target.value); }} style={selectStyle}>
                  <option value="number">Number (1,234)</option>
                  <option value="compact">Compact (1.2K)</option>
                  <option value="currency">Currency ($1.2K)</option>
                  <option value="percent">Percent (12.3%)</option>
                </select>
              </div>
            </div>
          )}
          {localType === 'kpi_card' && localDc.tableId && (
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Display</div>
              <div>
                <label style={labelStyle}>Format</label>
                <select value={localVc.format || 'number'} onChange={function(e) { commitVc('format', e.target.value); }} style={selectStyle}>
                  <option value="number">Number</option>
                  <option value="currency">Currency ($)</option>
                  <option value="percent">Percent (%)</option>
                </select>
              </div>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

// ---- Main Dashboard Editor ----
export function DashboardEditor({ dashboardId, tables }: { dashboardId: string; tables: TableInfo[] }) {
  var router = useRouter();
  var [dashboard, setDashboard] = useState<DashboardData | null>(null);
  var [loading, setLoading] = useState(true);
  var [editingWidget, setEditingWidget] = useState<string | null>(null);
  var [widgetData, setWidgetData] = useState<Record<string, any>>({});
  var [saving, setSaving] = useState(false);
  var [editingName, setEditingName] = useState(false);
  var [nameValue, setNameValue] = useState('');
  var [isEditing, setIsEditing] = useState(true);

  // Filters now store arrays of selected values for multi-select slicer behavior.
  var [dashboardFilters, setDashboardFilters] = useState<Record<string, DashboardFilter>>({});
  var [filterOptions, setFilterOptions] = useState<Record<string, string[]>>({});

  var [showAddFilter, setShowAddFilter] = useState(false);
  var [newFilterTableId, setNewFilterTableId] = useState('');
  var [newFilterColumnId, setNewFilterColumnId] = useState('');
  var [showPermissions, setShowPermissions] = useState(false);
  var [permUsers, setPermUsers] = useState<any[]>([]);
  var [permGroups, setPermGroups] = useState<any[]>([]);
  var [allUsers, setAllUsers] = useState<any[]>([]);
  var [allGroups, setAllGroups] = useState<any[]>([]);
  var [permLoading, setPermLoading] = useState(false);
  var [addPermType, setAddPermType] = useState<'user'|'group'>('user');
  var [addPermId, setAddPermId] = useState('');
  var [addPermLevel, setAddPermLevel] = useState('viewer');

  var fetchDashboard = useCallback(async function() {
    try {
      var r = await fetch('/api/insights/dashboards/' + dashboardId);
      if (r.ok) {
        var d = await r.json();
        setDashboard(d);
        setNameValue(d.name);
        for (var i = 0; i < (d.widgets || []).length; i++) {
          fetchWidgetData(d.widgets[i]);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [dashboardId]);

  useEffect(function() { fetchDashboard(); }, [fetchDashboard]);

  async function fetchPermissions() {
    setPermLoading(true);
    try {
      var [permRes, usersRes, groupsRes] = await Promise.all([
        fetch('/api/insights/dashboards/' + dashboardId),
        fetch('/api/users'),
        fetch('/api/groups'),
      ]);
      if (permRes.ok) {
        var d = await permRes.json();
        var perms = d.permissions || [];
        setPermUsers(perms.filter(function(p: any) { return p.userId; }));
        setPermGroups(perms.filter(function(p: any) { return p.groupId; }));
      }
      if (usersRes.ok) { var ud = await usersRes.json(); setAllUsers(ud.users || []); }
      if (groupsRes.ok) { var gd = await groupsRes.json(); setAllGroups(gd.groups || gd || []); }
    } catch (e) { console.error(e); }
    finally { setPermLoading(false); }
  }

  async function addPermission() {
    if (!addPermId) return;
    var body: any = { permission: addPermLevel };
    if (addPermType === 'user') body.userId = addPermId;
    else body.groupId = addPermId;
    await fetch('/api/insights/dashboards/' + dashboardId + '/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setAddPermId('');
    fetchPermissions();
  }

  async function removePermission(permId: string) {
    await fetch('/api/insights/dashboards/' + dashboardId + '/permissions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissionId: permId }) });
    fetchPermissions();
  }

  async function updatePermissionLevel(permId: string, level: string) {
    await fetch('/api/insights/dashboards/' + dashboardId + '/permissions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissionId: permId, permission: level }) });
    fetchPermissions();
  }

  async function addDashboardFilter(tableId: string, columnId: string) {
    var key = tableId + ':' + columnId;
    if (dashboardFilters[key]) return;

    // Fetch distinct values for the checkbox list
    try {
      var r = await fetch('/api/insights/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'distinct', tableId: tableId, columnId: columnId }),
      });
      if (r.ok) {
        var result = await r.json();
        setFilterOptions(function(prev) { var next = Object.assign({}, prev); next[key] = result.values || []; return next; });
      }
    } catch (e) { console.error(e); }

    setDashboardFilters(function(prev) {
      var next = Object.assign({}, prev);
      next[key] = { tableId: tableId, columnId: columnId, values: [] }; // empty array = "all selected"
      return next;
    });
    setShowAddFilter(false);
    setNewFilterTableId('');
    setNewFilterColumnId('');
  }

  function setFilterValues(key: string, values: string[]) {
    setDashboardFilters(function(prev) {
      var next = Object.assign({}, prev);
      next[key] = Object.assign({}, next[key], { values: values });
      refreshAllWidgetsWithFilters(next);
      return next;
    });
  }

  function removeFilter(key: string) {
    setDashboardFilters(function(prev) {
      var next = Object.assign({}, prev);
      delete next[key];
      refreshAllWidgetsWithFilters(next);
      return next;
    });
  }

  function refreshAllWidgetsWithFilters(overrideFilters?: Record<string, DashboardFilter>) {
    if (!dashboard) return;
    var filtersToUse = overrideFilters || dashboardFilters;
    for (var i = 0; i < dashboard.widgets.length; i++) {
      fetchWidgetData(dashboard.widgets[i], filtersToUse);
    }
  }

  function refreshAllWidgets() {
    if (!dashboard) return;
    for (var i = 0; i < dashboard.widgets.length; i++) {
      fetchWidgetData(dashboard.widgets[i]);
    }
  }

  // Build the set of filters to apply to a given widget's query, based on which
  // dashboard filters target the same table as the widget.
  function buildFiltersForWidget(widget: WidgetData, filtersSource?: Record<string, DashboardFilter>): any[] {
    var dc = widget.dataConfig || {};
    var widgetFilters: any[] = [];
    var source = filtersSource || dashboardFilters;

    Object.keys(source).forEach(function(key) {
      var f = source[key];
      if (f.tableId !== dc.tableId) return;

      // Empty values array = "all" — no filtering applied
      if (!f.values || f.values.length === 0) return;

      // Sentinel "__none__" means user cleared all options — match nothing
      if (f.values.length === 1 && f.values[0] === '__none__') {
        widgetFilters.push({ columnId: f.columnId, operator: 'in', values: ['__never_matches__'] });
        return;
      }

      widgetFilters.push({ columnId: f.columnId, operator: 'in', values: f.values });
    });

    // Merge with any pre-existing widget-level filters
    if (dc.filters && Array.isArray(dc.filters)) {
      return dc.filters.concat(widgetFilters);
    }
    return widgetFilters;
  }

  async function fetchWidgetData(widget: WidgetData, filtersOverride?: Record<string, DashboardFilter>) {
    var dc = widget.dataConfig || {};
    if (!dc.tableId) return;

    var effectiveFilters = buildFiltersForWidget(widget, filtersOverride);

    try {
      var body: any = {};

      if (widget.type === 'kpi_card') {
        body = { type: 'kpi', tableId: dc.tableId, columnId: dc.columnId || '*', function: dc.function || 'count', filters: effectiveFilters };
      } else {
        body = {
          tableId: dc.tableId,
          groupBy: dc.groupBy || undefined,
          dateGrouping: dc.dateGrouping || undefined,
          aggregations: [{ columnId: dc.columnId || '*', function: dc.function || 'count', alias: 'value' }],
          filters: effectiveFilters,
          orderBy: dc.orderBy || (dc.groupBy ? { field: 'value', direction: 'desc' } : undefined),
          limit: dc.limit || undefined,
        };
      }

      var r = await fetch('/api/insights/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (r.ok) {
        var result = await r.json();
        setWidgetData(function(prev) { var next = Object.assign({}, prev); next[widget.id] = result; return next; });
      }
    } catch (e) { console.error('[Insights] Query failed for widget ' + widget.id, e); }
  }

  async function addWidget(type: string) {
    if (!dashboard) return;
    var maxY = 0;
    (dashboard.widgets || []).forEach(function(w) { var bottom = w.layoutY + w.layoutH; if (bottom > maxY) maxY = bottom; });

    var r = await fetch('/api/insights/dashboards/' + dashboardId + '/widgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New ' + (WIDGET_TYPES.find(function(wt) { return wt.value === type; })?.label || 'Widget'),
        type: type,
        layoutX: 0,
        layoutY: maxY,
        layoutW: type === 'kpi_card' ? 3 : type === 'text' ? 12 : 6,
        layoutH: type === 'kpi_card' ? 2 : type === 'text' ? 2 : 4,
      }),
    });

    if (r.ok) {
      var w = await r.json();
      setDashboard(function(prev) {
        if (!prev) return prev;
        return Object.assign({}, prev, { widgets: (prev.widgets || []).concat([w]) });
      });
      setEditingWidget(w.id);
    }
  }

  async function updateWidget(widgetId: string, updates: any) {
    setDashboard(function(prev) {
      if (!prev) return prev;
      return Object.assign({}, prev, {
        widgets: prev.widgets.map(function(w) { return w.id === widgetId ? Object.assign({}, w, updates) : w; }),
      });
    });

    await fetch('/api/insights/widgets/' + widgetId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (updates.dataConfig || updates.type) {
      var currentWidgets = dashboard?.widgets || [];
      var currentWidget = currentWidgets.find(function(w) { return w.id === widgetId; });
      var merged = Object.assign({}, currentWidget || { id: widgetId, name: '', type: 'bar', dataConfig: {}, vizConfig: {}, layoutX: 0, layoutY: 0, layoutW: 6, layoutH: 4, sortOrder: 0 }, updates);
      fetchWidgetData(merged);
    }
  }

  function moveWidget(widgetId: string, direction: number) {
    if (!dashboard) return;
    var widgets = dashboard.widgets.slice();
    var idx = widgets.findIndex(function(w) { return w.id === widgetId; });
    if (idx === -1) return;
    var newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= widgets.length) return;

    var temp = widgets[idx];
    widgets[idx] = widgets[newIdx];
    widgets[newIdx] = temp;

    var updates: { id: string; sortOrder: number }[] = [];
    for (var i = 0; i < widgets.length; i++) {
      widgets[i] = Object.assign({}, widgets[i], { sortOrder: i });
      updates.push({ id: widgets[i].id, sortOrder: i });
    }

    setDashboard(function(prev) { return prev ? Object.assign({}, prev, { widgets: widgets }) : prev; });

    fetch('/api/insights/dashboards/' + dashboardId + '/layout', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layouts: updates.map(function(u) { var w = widgets.find(function(ww) { return ww.id === u.id; }); return { id: u.id, x: w?.layoutX || 0, y: w?.layoutY || 0, w: w?.layoutW || 6, h: w?.layoutH || 4, sortOrder: u.sortOrder }; }) }),
    });
  }

  async function duplicateWidget(widget: WidgetData) {
    if (!dashboard) return;
    var maxY = 0;
    dashboard.widgets.forEach(function(w) { var bottom = w.layoutY + w.layoutH; if (bottom > maxY) maxY = bottom; });

    var r = await fetch('/api/insights/dashboards/' + dashboardId + '/widgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: widget.name + ' (copy)',
        type: widget.type,
        dataConfig: widget.dataConfig,
        vizConfig: widget.vizConfig,
        layoutX: 0,
        layoutY: maxY,
        layoutW: widget.layoutW,
        layoutH: widget.layoutH,
      }),
    });
    if (r.ok) {
      var w = await r.json();
      setDashboard(function(prev) {
        if (!prev) return prev;
        return Object.assign({}, prev, { widgets: prev.widgets.concat([w]) });
      });
      fetchWidgetData(w);
    }
  }

  async function deleteWidget(widgetId: string) {
    if (!confirm('Delete this widget?')) return;
    await fetch('/api/insights/widgets/' + widgetId, { method: 'DELETE' });
    setDashboard(function(prev) {
      if (!prev) return prev;
      return Object.assign({}, prev, { widgets: prev.widgets.filter(function(w) { return w.id !== widgetId; }) });
    });
    if (editingWidget === widgetId) setEditingWidget(null);
  }

  async function saveName() {
    if (!nameValue.trim() || !dashboard) return;
    await fetch('/api/insights/dashboards/' + dashboardId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setDashboard(function(prev) { return prev ? Object.assign({}, prev, { name: nameValue.trim() }) : prev; });
    setEditingName(false);
  }

  async function togglePublish() {
    if (!dashboard) return;
    var newStatus = dashboard.status === 'published' ? 'draft' : 'published';
    await fetch('/api/insights/dashboards/' + dashboardId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setDashboard(function(prev) { return prev ? Object.assign({}, prev, { status: newStatus }) : prev; });
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading dashboard...</div>;
  if (!dashboard) return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Dashboard not found</div>;

  var editingWidgetObj = editingWidget ? dashboard.widgets.find(function(w) { return w.id === editingWidget; }) : null;
  var ROW_HEIGHT = 80;

  // Helper: tell if any filter currently has an active selection
  function anyFilterActive(): boolean {
    var keys = Object.keys(dashboardFilters);
    for (var i = 0; i < keys.length; i++) {
      var f = dashboardFilters[keys[i]];
      if (f.values && f.values.length > 0) return true;
    }
    return false;
  }

  function clearAllFilterSelections() {
    var cleared: Record<string, DashboardFilter> = {};
    Object.keys(dashboardFilters).forEach(function(k) {
      cleared[k] = Object.assign({}, dashboardFilters[k], { values: [] });
    });
    setDashboardFilters(cleared);
    setTimeout(function() { refreshAllWidgets(); }, 50);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f3f4f6' }}>
      {/* Toolbar */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>{dashboard.icon || '📊'}</span>
          {editingName && isEditing ? (
            <input type="text" value={nameValue} onChange={function(e) { setNameValue(e.target.value); }}
              onBlur={saveName} onKeyDown={function(e) { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameValue(dashboard?.name || ''); } }}
              style={Object.assign({}, inputStyle, { width: '300px', fontSize: '16px', fontWeight: 700 })} autoFocus />
          ) : (
            <h1 onClick={function() { setEditingName(true); }} style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0, cursor: 'pointer' }} title="Click to rename">{dashboard.name}</h1>
          )}
          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: dashboard.status === 'published' ? '#dcfce7' : '#f3f4f6', color: dashboard.status === 'published' ? '#166534' : '#6b7280' }}>
            {dashboard.status === 'published' ? 'Published' : 'Draft'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={function() { setIsEditing(!isEditing); }}
            style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'pointer', background: isEditing ? '#eff6ff' : '#fff', color: isEditing ? '#1d4ed8' : '#6b7280' }}>
            {isEditing ? '👁 View Mode' : '✏️ Edit Mode'}
          </button>
		  <button onClick={function() { setShowPermissions(true); fetchPermissions(); }}
            style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'pointer', background: '#fff', color: '#6b7280' }}>
            🔒 Share
          </button>
		  <select value={dashboard.visibility} onChange={function(e) {
            fetch('/api/insights/dashboards/' + dashboardId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility: e.target.value }) });
            setDashboard(function(prev) { return prev ? Object.assign({}, prev, { visibility: e.target.value }) : prev; });
          }} style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
            <option value="private">🔒 Private</option>
            <option value="workspace">🏢 Workspace</option>
            <option value="public">🌐 All Users</option>
          </select>
          {dashboard.status === 'published' && (
            <button onClick={async function() {
              var r = await fetch('/api/insights/dashboards/' + dashboardId + '/embed-token', { method: 'POST' });
              if (r.ok) {
                var d = await r.json();
                var fullUrl = window.location.origin + d.embedUrl;
                try { await navigator.clipboard.writeText(fullUrl); } catch { }
                alert('Embed URL copied to clipboard:\n\n' + fullUrl);
              }
            }} style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'pointer', background: '#fff', color: '#6b7280' }}>
              📋 Embed Link
            </button>
          )}
          <button onClick={togglePublish}
            style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: '1px solid', cursor: 'pointer',
              background: dashboard.status === 'published' ? '#fef2f2' : '#f0fdf4',
              borderColor: dashboard.status === 'published' ? '#fecaca' : '#bbf7d0',
              color: dashboard.status === 'published' ? '#991b1b' : '#166534' }}>
            {dashboard.status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Add Widget Bar — edit mode only */}
      {isEditing && <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginRight: '8px' }}>ADD:</span>
        {WIDGET_TYPES.map(function(wt) { return (
          <button key={wt.value} onClick={function() { addWidget(wt.value); }}
            style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#fff', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{wt.icon}</span> {wt.label}
          </button>
        ); })}
      </div>}

      {/* Dashboard Filters Bar */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' as const, minHeight: '40px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginRight: '4px' }}>FILTERS:</span>

        {/* Active filters — each is a multi-select slicer */}
        {Object.keys(dashboardFilters).map(function(key) {
          var filter = dashboardFilters[key];
          var tbl = tables.find(function(t) { return t.id === filter.tableId; });
          var col = tbl?.columns.find(function(c) { return c.id === filter.columnId; });
          var options = filterOptions[key] || [];
          return (
            <SlicerPopover
              key={key}
              label={col?.name || 'Column'}
              options={options}
              selected={filter.values}
              onChange={function(next) { setFilterValues(key, next); }}
              onRemove={function() { removeFilter(key); }}
            />
          );
        })}

        {/* Add filter button */}
        {showAddFilter ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
            <select value={newFilterTableId} onChange={function(e) { setNewFilterTableId(e.target.value); setNewFilterColumnId(''); }}
              style={{ padding: '2px 6px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '4px', outline: 'none' }}>
              <option value="">Table...</option>
              {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
            </select>
            {newFilterTableId && (
              <select value={newFilterColumnId} onChange={function(e) { if (e.target.value) addDashboardFilter(newFilterTableId, e.target.value); }}
                style={{ padding: '2px 6px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '4px', outline: 'none' }}>
                <option value="">Column...</option>
                {tables.find(function(t) { return t.id === newFilterTableId; })?.columns.map(function(c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
              </select>
            )}
            <button onClick={function() { setShowAddFilter(false); setNewFilterTableId(''); setNewFilterColumnId(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '12px' }}>✕</button>
          </div>
        ) : (
          <button onClick={function() { setShowAddFilter(true); }}
            style={{ padding: '3px 8px', fontSize: '10px', border: '1px dashed #d1d5db', borderRadius: '4px', background: 'none', color: '#9ca3af', cursor: 'pointer' }}>
            + Add Filter
          </button>
        )}

        {anyFilterActive() && (
          <button onClick={clearAllFilterSelections}
            style={{ padding: '3px 8px', fontSize: '10px', border: '1px solid #fecaca', borderRadius: '4px', background: '#fef2f2', color: '#991b1b', cursor: 'pointer' }}>
            Clear all
          </button>
        )}
      </div>

      {/* Widget Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {dashboard.widgets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: '#9ca3af' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
            <p style={{ fontSize: '16px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>Empty dashboard</p>
            <p style={{ fontSize: '13px', marginBottom: '20px' }}>Click the buttons above to add your first widget.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '12px', maxWidth: '1400px', margin: '0 auto' }}>
            {dashboard.widgets.map(function(widget) {
              var isWidgetEditing = editingWidget === widget.id;
              return (
                <div key={widget.id}
                  data-widget-id={widget.id}
                  style={{
                    gridColumn: 'span ' + widget.layoutW,
                    minHeight: (widget.layoutH * ROW_HEIGHT) + 'px',
                    background: '#ffffff',
                    border: isWidgetEditing ? '2px solid #3B82F6' : '1px solid #e5e7eb',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'border-color 0.15s',
                  }}>
                  <div style={{ padding: '8px 12px', borderBottom: isEditing ? '1px solid #f3f4f6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isEditing ? '#fafafa' : 'transparent', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px' }}>{WIDGET_TYPES.find(function(wt) { return wt.value === widget.type; })?.icon || '📊'}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{widget.name}</span>
                    </div>
                    {isEditing && <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={function() { updateWidget(widget.id, { layoutW: Math.max(3, widget.layoutW - 3) }); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '11px', padding: '2px' }} title="Narrower">◀</button>
                      <button onClick={function() { updateWidget(widget.id, { layoutW: Math.min(12, widget.layoutW + 3) }); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '11px', padding: '2px' }} title="Wider">▶</button>
                      <button onClick={function() { updateWidget(widget.id, { layoutH: Math.max(2, widget.layoutH - 1) }); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '11px', padding: '2px' }} title="Shorter">▲</button>
                      <button onClick={function() { updateWidget(widget.id, { layoutH: Math.min(8, widget.layoutH + 1) }); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '11px', padding: '2px' }} title="Taller">▼</button>
                      <span style={{ width: '1px', height: '12px', background: '#e5e7eb' }} />
                      <button onClick={function() { setEditingWidget(editingWidget === widget.id ? null : widget.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: editingWidget === widget.id ? '#2563eb' : '#9ca3af', fontSize: '12px', padding: '2px' }} title="Configure">⚙</button>
						<button onClick={function() { moveWidget(widget.id, -1); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '11px', padding: '2px' }} title="Move up">⬆</button>
                      <button onClick={function() { moveWidget(widget.id, 1); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '11px', padding: '2px' }} title="Move down">⬇</button>
                      <span style={{ width: '1px', height: '12px', background: '#e5e7eb' }} />
						<button onClick={function() { duplicateWidget(widget); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '12px', padding: '2px' }} title="Duplicate">⧉</button>
                      <button onClick={function() { exportWidgetAsPng(widget.id, widget.name); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '12px', padding: '2px' }} title="Export as PNG">⬇️</button>
                      <button onClick={function() { deleteWidget(widget.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '12px', padding: '2px' }} title="Delete">✕</button>
                    </div>}
                  </div>
                  <div style={{ flex: 1, minHeight: '0' }}>
                    <WidgetChart widget={widget} queryData={widgetData[widget.id]}
                      onCrossFilter={function(label) {
                        var dc = widget.dataConfig || {};
                        if (dc.groupBy && dc.tableId) {
                          var key = dc.tableId + ':' + dc.groupBy;
                          if (!dashboardFilters[key]) {
                            addDashboardFilter(dc.tableId, dc.groupBy);
                            setTimeout(function() { setFilterValues(key, [label]); }, 250);
                          } else {
                            setFilterValues(key, [label]);
                          }
                        }
                      }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Config Panel — edit mode only */}
      {isEditing && editingWidgetObj && (
        <WidgetConfigPanel
          widget={editingWidgetObj}
          tables={tables}
          onUpdate={function(updates) { updateWidget(editingWidgetObj!.id, updates); }}
          onClose={function() { setEditingWidget(null); }}
        />
      )}

      {/* Permissions Modal */}
      {showPermissions && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setShowPermissions(false); }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', margin: '16px' }} onClick={function(e) { e.stopPropagation(); }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Dashboard Permissions</h3>
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>Control who can view or edit this dashboard</p>
              </div>
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
                  {addPermType === 'user' ? allUsers.map(function(u: any) { return <option key={u.id} value={u.id}>{u.name || u.email}</option>; })
                    : allGroups.map(function(g: any) { return <option key={g.id} value={g.id}>{g.name}</option>; })}
                </select>
                <select value={addPermLevel} onChange={function(e) { setAddPermLevel(e.target.value); }} style={Object.assign({}, selectStyle, { width: '100px' })}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button onClick={addPermission} disabled={!addPermId} style={{ padding: '6px 12px', fontSize: '11px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: addPermId ? 1 : 0.5, fontWeight: 600 }}>Add</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
              {permLoading ? <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>Loading...</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {permUsers.length === 0 && permGroups.length === 0 && <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>No permissions set. Dashboard visibility is controlled by the publish status.</p>}
                  {permUsers.map(function(p: any) {
                    var user = allUsers.find(function(u: any) { return u.id === p.userId; });
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#f9fafb', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, color: '#1d4ed8' }}>{(user?.name || user?.email || '?')[0].toUpperCase()}</div>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: '#111827' }}>{user?.name || user?.email || 'Unknown'}</div>
                            {user?.email && user?.name && <div style={{ fontSize: '10px', color: '#9ca3af' }}>{user.email}</div>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <select value={p.permission} onChange={function(e) { updatePermissionLevel(p.id, e.target.value); }} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: 'none', background: p.permission === 'editor' ? '#dbeafe' : '#f3f4f6', color: p.permission === 'editor' ? '#1d4ed8' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}>
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                          </select>
                          <button onClick={function() { removePermission(p.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '14px' }}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                  {permGroups.map(function(p: any) {
                    var group = allGroups.find(function(g: any) { return g.id === p.groupId; });
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#f9fafb', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>👥</div>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: '#111827' }}>{group?.name || 'Unknown group'}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <select value={p.permission} onChange={function(e) { updatePermissionLevel(p.id, e.target.value); }} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: 'none', background: p.permission === 'editor' ? '#dbeafe' : '#f3f4f6', color: p.permission === 'editor' ? '#1d4ed8' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}>
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                          </select>
                          <button onClick={function() { removePermission(p.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '14px' }}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={function() { setShowPermissions(false); }} style={{ padding: '6px 14px', fontSize: '12px', background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#374151' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}