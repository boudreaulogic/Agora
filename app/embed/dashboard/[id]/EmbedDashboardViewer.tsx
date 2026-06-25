'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts';

var COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];
var WIDGET_ICONS: Record<string, string> = { kpi_card: '🔢', bar: '📊', line: '📈', pie: '🥧', donut: '🍩', area: '📉', scatter: '⚬', data_table: '📋', text: '📝' };

interface WidgetData { id: string; name: string; type: string; dataConfig: any; vizConfig: any; layoutW: number; layoutH: number; }

function EmbedWidgetChart({ widget, queryData }: { widget: WidgetData; queryData: any }) {
  if (!queryData || !queryData.data) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '12px' }}>No data</div>;

  var data = queryData.data;
  var vizConfig = widget.vizConfig || {};

  if (widget.type === 'kpi_card') {
    var kpiValue = queryData.value !== undefined ? queryData.value : (data[0]?.value || 0);
    var format = vizConfig.format || 'number';
    var displayValue = format === 'currency' ? '$' + Number(kpiValue).toLocaleString() : format === 'percent' ? kpiValue + '%' : Number(kpiValue).toLocaleString();
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '16px' }}>
        <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{widget.name}</div>
        <div style={{ fontSize: '36px', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{displayValue}</div>
        {queryData.meta && <div style={{ fontSize: '10px', color: '#d1d5db', marginTop: '8px' }}>{queryData.meta.rowCount} records</div>}
      </div>
    );
  }

  if (widget.type === 'text') {
    return <div style={{ padding: '16px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: '14px', color: '#374151', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const }}>{vizConfig.text || ''}</div></div>;
  }

  if (data.length === 0) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '12px' }}>No data</div>;

  var dataKey = Object.keys(data[0]).find(function(k) { return k !== '_label' && k !== '_count'; }) || '_count';

  if (widget.type === 'bar') {
    return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="_label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} /><YAxis tick={{ fontSize: 10 }} /><Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} /><Bar dataKey={dataKey} fill="#3B82F6" radius={[4, 4, 0, 0]}>{data.map(function(_: any, i: number) { return <Cell key={i} fill={COLORS[i % COLORS.length]} />; })}</Bar></BarChart></ResponsiveContainer>;
  }
  if (widget.type === 'line') {
    return <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="_label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} /><YAxis tick={{ fontSize: 10 }} /><Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} /><Line type="monotone" dataKey={dataKey} stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} /></LineChart></ResponsiveContainer>;
  }
  if (widget.type === 'area') {
    return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="_label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} /><YAxis tick={{ fontSize: 10 }} /><Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} /><Area type="monotone" dataKey={dataKey} stroke="#3B82F6" fill="#93c5fd" fillOpacity={0.3} /></AreaChart></ResponsiveContainer>;
  }
  if (widget.type === 'pie' || widget.type === 'donut') {
    var innerRadius = widget.type === 'donut' ? '50%' : 0;
    return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey={dataKey} nameKey="_label" cx="50%" cy="50%" innerRadius={innerRadius} outerRadius="75%" label={function(e: any) { return e._label; }} labelLine={true} fontSize={10}>{data.map(function(_: any, i: number) { return <Cell key={i} fill={COLORS[i % COLORS.length]} />; })}</Pie><Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} /></PieChart></ResponsiveContainer>;
  }
  if (widget.type === 'scatter') {
    var scatterData = data.map(function(d: any) { return { name: d._label, value: d[dataKey] || 0, count: d._count || 1 }; });
    return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis dataKey="value" tick={{ fontSize: 10 }} /><ZAxis dataKey="count" range={[40, 400]} /><Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} /><Scatter data={scatterData} fill="#8B5CF6">{scatterData.map(function(_: any, i: number) { return <Cell key={i} fill={COLORS[i % COLORS.length]} />; })}</Scatter></ScatterChart></ResponsiveContainer>;
  }
  if (widget.type === 'data_table') {
    var columns = Object.keys(data[0] || {}).filter(function(k) { return k !== '_count'; });
    return (
      <div style={{ overflow: 'auto', height: '100%', padding: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead><tr>{columns.map(function(col) { return <th key={col} style={{ padding: '6px 10px', textAlign: 'left' as const, borderBottom: '2px solid #e5e7eb', fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, position: 'sticky' as const, top: 0, background: '#fff' }}>{col === '_label' ? 'Category' : col}</th>; })}</tr></thead>
          <tbody>{data.map(function(row: any, ri: number) { return <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6', background: ri % 2 === 0 ? '#fff' : '#fafafa' }}>{columns.map(function(col) { return <td key={col} style={{ padding: '6px 10px', color: '#374151' }}>{typeof row[col] === 'number' ? Number(row[col]).toLocaleString() : String(row[col] || '')}</td>; })}</tr>; })}</tbody>
        </table>
      </div>
    );
  }
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '12px' }}>Unsupported</div>;
}

export function EmbedDashboardViewer({ dashboard }: { dashboard: any }) {
  var [widgetData, setWidgetData] = useState<Record<string, any>>({});
  var ROW_HEIGHT = 80;

  useEffect(function() {
    for (var i = 0; i < (dashboard.widgets || []).length; i++) {
      fetchWidgetData(dashboard.widgets[i]);
    }
  }, [dashboard.id]);

  async function fetchWidgetData(widget: WidgetData) {
    var dc = widget.dataConfig || {};
    if (!dc.tableId) return;
    try {
      var body: any = {};
      if (widget.type === 'kpi_card') {
        body = { type: 'kpi', tableId: dc.tableId, columnId: dc.columnId || '*', function: dc.function || 'count', filters: dc.filters };
      } else {
        body = { tableId: dc.tableId, groupBy: dc.groupBy || undefined, aggregations: [{ columnId: dc.columnId || '*', function: dc.function || 'count', alias: 'value' }], filters: dc.filters, orderBy: dc.groupBy ? { field: 'value', direction: 'desc' } : undefined, limit: dc.limit || undefined };
      }
      var r = await fetch('/api/insights/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) {
        var result = await r.json();
        setWidgetData(function(prev) { var next = Object.assign({}, prev); next[widget.id] = result; return next; });
      }
    } catch (e) { console.error(e); }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '20px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <span style={{ fontSize: '24px' }}>{dashboard.icon || '📊'}</span>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: 0 }}>{dashboard.name}</h1>
          {dashboard.description && <span style={{ fontSize: '12px', color: '#9ca3af' }}>— {dashboard.description}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '12px' }}>
          {(dashboard.widgets || []).map(function(widget: any) {
            return (
              <div key={widget.id} style={{ gridColumn: 'span ' + widget.layoutW, minHeight: (widget.layoutH * ROW_HEIGHT) + 'px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px' }}>{WIDGET_ICONS[widget.type] || '📊'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{widget.name}</span>
                </div>
                <div style={{ flex: 1, minHeight: '0' }}>
                  <EmbedWidgetChart widget={widget} queryData={widgetData[widget.id]} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '10px', color: '#d1d5db' }}>Powered by Agora</div>
      </div>
    </div>
  );
}
