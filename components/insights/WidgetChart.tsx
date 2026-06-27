'use client';

// ============================================================
// components/insights/WidgetChart.tsx
// THE single renderer for every Insights widget type.
// Used by the editor, view mode, and the public embed — so all three
// look identical and gain new widget types for free.
//
// Supports: kpi_card (with sparkline + period comparison), bar / line / area
// (single-series AND pivot multi-series, stacked or grouped), combo (bar+line),
// pie / donut, scatter, gauge (value vs target), data_table (with data bars),
// and text. Theme-aware (light/dark) and interaction-gated.
// ============================================================

import React from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  ScatterChart, Scatter, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ZAxis,
} from 'recharts';
import { DashboardTheme, widgetColors, formatYAxisValue, formatKpiValue, makeTruncatedTick } from './theme';

export interface WidgetLike { id: string; name: string; type: string; dataConfig: any; vizConfig: any; layoutW?: number; layoutH?: number; }

// Which keys in each data row are real series values (everything except metadata).
function getSeriesKeys(queryData: any): string[] {
  if (queryData && queryData.meta && Array.isArray(queryData.meta.series) && queryData.meta.series.length) {
    return queryData.meta.series;
  }
  if (!queryData || !queryData.data || !queryData.data.length) return [];
  var k = Object.keys(queryData.data[0]).filter(function(key) { return key !== '_label' && key !== '_count'; });
  return k.length ? [k[0]] : [];
}

function emptyState(theme: DashboardTheme, msg: string, hint?: string) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.subtext, fontSize: '12px', padding: '20px', textAlign: 'center' as const, gap: '8px' }}>
      <div style={{ fontSize: '28px', opacity: 0.5 }}>🔍</div>
      <div style={{ fontWeight: 600 }}>{msg}</div>
      {hint && <div style={{ fontSize: '11px', opacity: 0.8 }}>{hint}</div>}
    </div>
  );
}

export function WidgetChart({ widget, queryData, theme, interactive, onCrossFilter }: {
  widget: WidgetLike;
  queryData: any;
  theme: DashboardTheme;
  interactive?: boolean;
  onCrossFilter?: (label: string) => void;
}) {
  var vizConfig = widget.vizConfig || {};
  var colors = widgetColors(vizConfig.colorTheme, theme);
  var valueFormat = vizConfig.valueFormat || 'number';
  var truncatedTick = makeTruncatedTick(theme.axisColor);
  var clickable = !!(interactive && onCrossFilter);
  var tooltipStyle = { fontSize: '12px', borderRadius: '8px', background: theme.tooltipBg, border: '1px solid ' + theme.border, color: theme.text };

  // ---- Text block ----
  if (widget.type === 'text') {
    return (
      <div style={{ padding: '16px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: theme.text, textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const }}>{vizConfig.text || (interactive ? '' : 'Double-click to edit text')}</div>
      </div>
    );
  }

  if (!queryData || (!queryData.data && queryData.value === undefined)) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.subtext, fontSize: '12px' }}>{interactive ? 'Loading…' : 'Configure data source →'}</div>;
  }

  var data: any[] = queryData.data || [];

  // ---- KPI card (value + trend + sparkline) ----
  if (widget.type === 'kpi_card') {
    var kpiValue = queryData.value !== undefined ? queryData.value : (data[0]?.value || 0);
    var trend = queryData.trend;
    var format = vizConfig.format || 'number';
    var displayValue = formatKpiValue(kpiValue, format);
    var spark = queryData.sparkline || [];
    var target = vizConfig.target != null && vizConfig.target !== '' ? Number(vizConfig.target) : null;
    var pctOfTarget = target ? Math.round((Number(kpiValue) / target) * 100) : null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '14px 16px', gap: '2px' }}>
        <div style={{ fontSize: '11px', color: theme.subtext, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{widget.name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' as const }}>
          <div style={{ fontSize: '34px', fontWeight: 700, color: theme.text, lineHeight: 1.1 }}>{displayValue}</div>
          {trend !== undefined && trend !== null && (
            <div style={{ fontSize: '13px', fontWeight: 700, color: trend > 0 ? '#16a34a' : trend < 0 ? '#dc2626' : theme.subtext }}>
              {trend > 0 ? '▲' : trend < 0 ? '▼' : '—'} {Math.abs(trend)}%
            </div>
          )}
        </div>
        {pctOfTarget != null && (
          <div style={{ marginTop: '6px' }}>
            <div style={{ height: '6px', borderRadius: '3px', background: theme.gridStroke, overflow: 'hidden' }}>
              <div style={{ width: Math.min(100, pctOfTarget) + '%', height: '100%', background: pctOfTarget >= 100 ? '#16a34a' : theme.accent, borderRadius: '3px', transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: '10px', color: theme.subtext, marginTop: '3px' }}>{pctOfTarget}% of target ({formatKpiValue(target, format)})</div>
          </div>
        )}
        {spark.length > 1 && (
          <div style={{ height: '38px', marginTop: '8px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={'spark-' + widget.id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={theme.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: theme.subtext }} formatter={function(v: any) { return [formatYAxisValue(v, format), '']; }} />
                <Area type="monotone" dataKey="value" stroke={theme.accent} strokeWidth={2} fill={'url(#spark-' + widget.id + ')'} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {queryData.meta && spark.length <= 1 && <div style={{ fontSize: '10px', color: theme.subtext, opacity: 0.7, marginTop: '6px' }}>{queryData.meta.rowCount} records</div>}
      </div>
    );
  }

  // ---- Gauge (value vs target) ----
  if (widget.type === 'gauge') {
    var gVal = queryData.value !== undefined ? queryData.value : (data[0]?.value || 0);
    var gTarget = vizConfig.target != null && vizConfig.target !== '' ? Number(vizConfig.target) : 100;
    var frac = gTarget > 0 ? Math.max(0, Math.min(1, Number(gVal) / gTarget)) : 0;
    var gFormat = vizConfig.format || valueFormat;
    // Semicircular SVG arc gauge.
    var R = 70, CX = 90, CY = 90, START = Math.PI, END = 0;
    function arcPath(fraction: number) {
      var ang = START + (END - START) * fraction;
      var x = CX + R * Math.cos(ang);
      var y = CY - R * Math.sin(ang);
      var large = fraction > 0.5 ? 1 : 0;
      return 'M ' + (CX - R) + ' ' + CY + ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x + ' ' + y;
    }
    var gaugeColor = frac >= 1 ? '#16a34a' : frac >= 0.66 ? theme.accent : frac >= 0.33 ? '#f59e0b' : '#ef4444';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '10px' }}>
        <svg width="180" height="108" viewBox="0 0 180 108">
          <path d={arcPath(1)} fill="none" stroke={theme.gridStroke} strokeWidth={14} strokeLinecap="round" />
          <path d={arcPath(frac)} fill="none" stroke={gaugeColor} strokeWidth={14} strokeLinecap="round" />
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize={26} fontWeight={700} fill={theme.text}>{formatYAxisValue(gVal, gFormat)}</text>
          <text x={CX} y={CY + 14} textAnchor="middle" fontSize={11} fill={theme.subtext}>of {formatYAxisValue(gTarget, gFormat)}</text>
        </svg>
        <div style={{ fontSize: '13px', fontWeight: 700, color: gaugeColor, marginTop: '2px' }}>{Math.round(frac * 100)}%</div>
      </div>
    );
  }

  if (data.length === 0) {
    return emptyState(theme, 'No data matches your filters', 'Try adjusting the filters at the top of the dashboard.');
  }

  var seriesKeys = getSeriesKeys(queryData);
  var isPivot = !!(queryData.meta && Array.isArray(queryData.meta.series) && queryData.meta.series.length > 1);
  var primaryKey = seriesKeys[0] || 'value';

  // ---- Bar (single-series rainbow OR pivot stacked/grouped) ----
  if (widget.type === 'bar') {
    var isHorizontal = vizConfig.horizontal;
    var barThreshold = 35;
    var needsScroll = data.length > barThreshold;
    var scrollMinWidth = (!isHorizontal && needsScroll) ? (data.length * 36) + 'px' : undefined;
    var scrollMinHeight = (isHorizontal && needsScroll) ? (data.length * 32 + 60) + 'px' : undefined;
    return (
      <div style={{ width: '100%', height: '100%', overflowX: (!isHorizontal && needsScroll) ? 'auto' : 'hidden', overflowY: (isHorizontal && needsScroll) ? 'auto' : 'hidden' }}>
        <div style={{ width: scrollMinWidth || '100%', height: scrollMinHeight || '100%', minWidth: scrollMinWidth, minHeight: scrollMinHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout={isHorizontal ? 'vertical' : 'horizontal'} margin={{ top: 10, right: 20, left: isHorizontal ? 80 : 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
              {isHorizontal ? (<>
                <XAxis type="number" tick={{ fontSize: 10, fill: theme.axisColor }} tickFormatter={function(v) { return formatYAxisValue(v, valueFormat); }} />
                <YAxis dataKey="_label" type="category" tick={truncatedTick} width={140} />
              </>) : (<>
                <XAxis dataKey="_label" tick={truncatedTick} angle={-45} textAnchor="end" height={120} interval={0} />
                <YAxis tick={{ fontSize: 10, fill: theme.axisColor }} tickFormatter={function(v) { return formatYAxisValue(v, valueFormat); }} />
              </>)}
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: theme.subtext }} cursor={{ fill: theme.gridStroke, opacity: 0.4 }} />
              {(vizConfig.showLegend || isPivot) && <Legend wrapperStyle={{ fontSize: 10, color: theme.subtext }} />}
              {seriesKeys.map(function(sk, si) {
                return (
                  <Bar key={sk} dataKey={sk} stackId={vizConfig.stacked ? 'a' : undefined} radius={vizConfig.stacked ? 0 : (isHorizontal ? [0, 3, 3, 0] : [3, 3, 0, 0])}
                    fill={colors[si % colors.length]} cursor={clickable ? 'pointer' : 'default'}
                    onClick={function(entry: any) { if (clickable && entry && entry._label) onCrossFilter!(entry._label); }}
                    label={vizConfig.showLabels && !isPivot ? { position: isHorizontal ? 'right' : 'top', fontSize: 9, fill: theme.subtext } : false}>
                    {!isPivot && data.map(function(_: any, i: number) { return <Cell key={i} fill={colors[i % colors.length]} />; })}
                  </Bar>
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // ---- Combo (bars + designated line series) ----
  if (widget.type === 'combo') {
    var lineSet = new Set<string>(Array.isArray(vizConfig.comboLineSeries) ? vizConfig.comboLineSeries : (seriesKeys.length > 1 ? [seriesKeys[seriesKeys.length - 1]] : []));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis dataKey="_label" tick={truncatedTick} angle={-45} textAnchor="end" height={120} interval={0} />
          <YAxis tick={{ fontSize: 10, fill: theme.axisColor }} tickFormatter={function(v) { return formatYAxisValue(v, valueFormat); }} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: theme.subtext }} />
          <Legend wrapperStyle={{ fontSize: 10, color: theme.subtext }} />
          {seriesKeys.filter(function(sk) { return !lineSet.has(sk); }).map(function(sk, si) {
            return <Bar key={sk} dataKey={sk} stackId={vizConfig.stacked ? 'a' : undefined} fill={colors[si % colors.length]} radius={[3, 3, 0, 0]}
              cursor={clickable ? 'pointer' : 'default'} onClick={function(entry: any) { if (clickable && entry && entry._label) onCrossFilter!(entry._label); }} />;
          })}
          {seriesKeys.filter(function(sk) { return lineSet.has(sk); }).map(function(sk, si) {
            return <Line key={sk} type="monotone" dataKey={sk} stroke={colors[(seriesKeys.length - 1 - si) % colors.length]} strokeWidth={2.5} dot={{ r: 3 }} />;
          })}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // ---- Line ----
  if (widget.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis dataKey="_label" tick={truncatedTick} angle={-45} textAnchor="end" height={120} interval={0} />
          <YAxis tick={{ fontSize: 10, fill: theme.axisColor }} tickFormatter={function(v) { return formatYAxisValue(v, valueFormat); }} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: theme.subtext }} />
          {(vizConfig.showLegend || isPivot) && <Legend wrapperStyle={{ fontSize: 10, color: theme.subtext }} />}
          {seriesKeys.map(function(sk, si) {
            return <Line key={sk} type="monotone" dataKey={sk} stroke={colors[si % colors.length]} strokeWidth={2} dot={{ r: 3 }}
              label={vizConfig.showLabels && !isPivot ? { position: 'top', fontSize: 9, fill: theme.subtext } : false} />;
          })}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // ---- Area ----
  if (widget.type === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <defs>
            {seriesKeys.map(function(sk, si) {
              var c = colors[si % colors.length];
              return (
                <linearGradient key={sk} id={'area-' + widget.id + '-' + si} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={c} stopOpacity={0.05} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis dataKey="_label" tick={truncatedTick} angle={-45} textAnchor="end" height={120} interval={0} />
          <YAxis tick={{ fontSize: 10, fill: theme.axisColor }} tickFormatter={function(v) { return formatYAxisValue(v, valueFormat); }} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: theme.subtext }} />
          {(vizConfig.showLegend || isPivot) && <Legend wrapperStyle={{ fontSize: 10, color: theme.subtext }} />}
          {seriesKeys.map(function(sk, si) {
            return <Area key={sk} type="monotone" dataKey={sk} stackId={vizConfig.stacked ? 'a' : undefined} stroke={colors[si % colors.length]} strokeWidth={2} fill={'url(#area-' + widget.id + '-' + si + ')'} />;
          })}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // ---- Pie / Donut ----
  if (widget.type === 'pie' || widget.type === 'donut') {
    var innerRadius = widget.type === 'donut' ? '55%' : 0;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey={primaryKey} nameKey="_label" cx="50%" cy="50%" innerRadius={innerRadius} outerRadius="75%" paddingAngle={1} label={function(entry: any) { return entry._label; }} labelLine={true} fontSize={10}
            onClick={function(entry: any) { if (clickable && entry && entry._label) onCrossFilter!(entry._label); }} cursor={clickable ? 'pointer' : 'default'}>
            {data.map(function(_: any, i: number) { return <Cell key={i} fill={colors[i % colors.length]} stroke={theme.cardBg} strokeWidth={2} />; })}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: theme.subtext }} />
          {vizConfig.showLegend && <Legend wrapperStyle={{ fontSize: 10, color: theme.subtext }} />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // ---- Scatter ----
  if (widget.type === 'scatter') {
    var scatterData = data.map(function(d: any) { return { name: d._label, value: d[primaryKey] || 0, count: d._count || 1 }; });
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis dataKey="name" tick={truncatedTick} angle={-45} textAnchor="end" height={120} interval={0} />
          <YAxis dataKey="value" tick={{ fontSize: 10, fill: theme.axisColor }} tickFormatter={function(v) { return formatYAxisValue(v, valueFormat); }} />
          <ZAxis dataKey="count" range={[40, 400]} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: theme.subtext }} />
          <Scatter data={scatterData}>
            {scatterData.map(function(_: any, i: number) { return <Cell key={i} fill={colors[i % colors.length]} />; })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // ---- Data table (with optional data bars) ----
  if (widget.type === 'data_table') {
    var columns = Object.keys(data[0] || {}).filter(function(k) { return k !== '_count'; });
    var showBars = vizConfig.dataBars !== false; // default on
    // Per-column max for data-bar scaling.
    var colMax: Record<string, number> = {};
    columns.forEach(function(col) {
      var mx = 0;
      data.forEach(function(r: any) { var n = Number(r[col]); if (!isNaN(n) && n > mx) mx = n; });
      colMax[col] = mx;
    });
    return (
      <div style={{ overflow: 'auto', height: '100%', padding: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr>
              {columns.map(function(col) { return (
                <th key={col} style={{ padding: '6px 10px', textAlign: 'left' as const, borderBottom: '2px solid ' + theme.border, fontSize: '10px', fontWeight: 600, color: theme.subtext, textTransform: 'uppercase' as const, letterSpacing: '0.5px', position: 'sticky' as const, top: 0, background: theme.cardBg }}>
                  {col === '_label' ? 'Category' : col}
                </th>
              ); })}
            </tr>
          </thead>
          <tbody>
            {data.map(function(row: any, ri: number) { return (
              <tr key={ri} style={{ borderBottom: '1px solid ' + theme.gridStroke }}>
                {columns.map(function(col) {
                  var isNum = typeof row[col] === 'number';
                  var pct = (showBars && isNum && colMax[col] > 0) ? Math.round((Number(row[col]) / colMax[col]) * 100) : 0;
                  return (
                    <td key={col} style={{ padding: '6px 10px', color: theme.text, position: 'relative' as const }}>
                      {pct > 0 && <div style={{ position: 'absolute' as const, left: 0, top: 3, bottom: 3, width: pct + '%', background: theme.accent, opacity: 0.14, borderRadius: '3px' }} />}
                      <span style={{ position: 'relative' as const }}>{isNum ? Number(row[col]).toLocaleString() : String(row[col] || '')}</span>
                    </td>
                  );
                })}
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    );
  }

  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.subtext, fontSize: '12px' }}>Unsupported type: {widget.type}</div>;
}
