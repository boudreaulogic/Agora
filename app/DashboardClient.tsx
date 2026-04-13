'use client';

import { useState } from 'react';
import Link from 'next/link';

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(diff / 86400000);
  if (days < 7) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MiniChart({ chart }: { chart: any }) {
  const config = chart.config || {};
  const xCol = chart.columns.find((c: any) => c.id === config.xColumn);
  if (!xCol) return <div className="text-xs text-gray-400 text-center">No data configured</div>;

  const groups: Record<string, number[]> = {};
  chart.rows.forEach((row: any) => {
    let cat = row.data[config.xColumn] || '(empty)';
    const cats = typeof cat === 'string' && cat.includes(',') ? cat.split(',') : [cat];
    cats.forEach((c: string) => {
      c = c.trim();
      if (!groups[c]) groups[c] = [];
      if (config.yColumn) {
        const val = parseFloat(row.data[config.yColumn]);
        if (!isNaN(val)) groups[c].push(val);
      } else {
        groups[c].push(1);
      }
    });
  });

  const data = Object.entries(groups).map(([label, values], i) => {
    const agg = config.yAggregation || (config.yColumn ? 'sum' : 'count');
    let value = 0;
    if (agg === 'count') value = values.length;
    else if (agg === 'sum') value = values.reduce((a, b) => a + b, 0);
    else if (agg === 'avg') value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    else if (agg === 'min') value = values.length > 0 ? Math.min(...values) : 0;
    else if (agg === 'max') value = values.length > 0 ? Math.max(...values) : 0;

    let color = CHART_COLORS[i % CHART_COLORS.length];
    if (xCol.settings?.options) {
      const opt = xCol.settings.options.find((o: any) => o.value === label || o.label === label);
      if (opt?.color) color = opt.color;
    }
    return { label, value: Math.round(value * 100) / 100, color };
  }).sort((a, b) => b.value - a.value).slice(0, 10);

  if (data.length === 0) return <div className="text-xs text-gray-400 text-center">No data</div>;
  const maxVal = Math.max(...data.map(d => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);

  // Pie / Donut
  if (chart.type === 'pie' || chart.type === 'donut') {
    const size = 140;
    const cx = size / 2, cy = size / 2;
    const radius = size / 2 - 8;
    const inner = chart.type === 'donut' ? radius * 0.55 : 0;
    let startAngle = -90;
    const slices = data.map(d => {
      const angle = total > 0 ? (d.value / total) * 360 : 0;
      const s = { ...d, startAngle, angle };
      startAngle += angle;
      return s;
    });
    function polar(cx: number, cy: number, r: number, a: number) {
      const rad = (a * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }
    return (
      <div className="flex items-center justify-center h-full">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((s: any, i: number) => {
            if (s.angle <= 0) return null;
            const s1 = polar(cx, cy, radius, s.startAngle);
            const e1 = polar(cx, cy, radius, s.startAngle + s.angle);
            const s2 = polar(cx, cy, inner, s.startAngle + s.angle);
            const e2 = polar(cx, cy, inner, s.startAngle);
            const la = s.angle > 180 ? 1 : 0;
            const d = inner > 0
              ? `M ${s1.x} ${s1.y} A ${radius} ${radius} 0 ${la} 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${inner} ${inner} 0 ${la} 0 ${e2.x} ${e2.y} Z`
              : `M ${cx} ${cy} L ${s1.x} ${s1.y} A ${radius} ${radius} 0 ${la} 1 ${e1.x} ${e1.y} Z`;
            return <path key={i} d={d} fill={s.color} stroke="white" strokeWidth="1.5" />;
          })}
        </svg>
      </div>
    );
  }

  // Horizontal Bar
  if (chart.type === 'horizontal_bar') {
    return (
      <div className="w-full h-full flex flex-col justify-center space-y-1.5 overflow-hidden">
        {data.slice(0, 6).map((d, i) => {
          const w = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
          return (
            <div key={i} className="flex items-center space-x-2">
              <span className="text-[9px] text-gray-500 w-14 text-right truncate flex-shrink-0">{d.label.slice(0, 8)}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-4">
                <div className="h-full rounded-full flex items-center justify-end pr-1.5" style={{ width: Math.max(8, w) + '%', backgroundColor: d.color }}>
                  {w > 25 && <span className="text-[8px] text-white font-medium">{d.value}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Line / Area
  if (chart.type === 'line' || chart.type === 'area') {
    const svgW = 280, svgH = 120, pad = 8;
    const cW = svgW - pad * 2, cH = svgH - pad * 2;
    const points = data.map((d, i) => ({
      x: pad + (i / Math.max(1, data.length - 1)) * cW,
      y: pad + cH - (maxVal > 0 ? (d.value / maxVal) * cH : 0),
    }));
    const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
    const areaD = pathD + ` L${points[points.length - 1].x},${pad + cH} L${points[0].x},${pad + cH} Z`;
    return (
      <div className="w-full h-full flex items-center justify-center">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full">
          {chart.type === 'area' && <path d={areaD} fill="#3B82F6" fillOpacity="0.12" />}
          <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
          {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" stroke="#3B82F6" strokeWidth="1.5" />)}
        </svg>
      </div>
    );
  }

  // Bar chart (default)
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-end justify-center space-x-1.5 flex-1">
        {data.map((d, i) => {
          const h = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
          return (
            <div key={i} className="flex flex-col items-center flex-1 max-w-[28px]">
              <div className="w-full rounded-t" style={{ height: Math.max(4, h) + '%', backgroundColor: d.color, minHeight: '4px' }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-center space-x-1 mt-1.5 overflow-hidden">
        {data.map((d, i) => (
          <span key={i} className="text-[8px] text-gray-400 truncate max-w-[28px] text-center">{d.label.slice(0, 4)}</span>
        ))}
      </div>
    </div>
  );
}

function ExpandedChart({ chart }: { chart: any }) {
  const config = chart.config || {};
  const xCol = chart.columns.find((c: any) => c.id === config.xColumn);
  const yCol = chart.columns.find((c: any) => c.id === config.yColumn);
  if (!xCol) return <div className="text-center text-gray-400">No data configured</div>;

  const groups: Record<string, number[]> = {};
  chart.rows.forEach((row: any) => {
    let cat = row.data[config.xColumn] || '(empty)';
    const cats = typeof cat === 'string' && cat.includes(',') ? cat.split(',') : [cat];
    cats.forEach((c: string) => {
      c = c.trim();
      if (!groups[c]) groups[c] = [];
      if (config.yColumn) {
        const val = parseFloat(row.data[config.yColumn]);
        if (!isNaN(val)) groups[c].push(val);
      } else {
        groups[c].push(1);
      }
    });
  });

  const data = Object.entries(groups).map(([label, values], i) => {
    const agg = config.yAggregation || (config.yColumn ? 'sum' : 'count');
    let value = 0;
    if (agg === 'count') value = values.length;
    else if (agg === 'sum') value = values.reduce((a, b) => a + b, 0);
    else if (agg === 'avg') value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    else if (agg === 'min') value = values.length > 0 ? Math.min(...values) : 0;
    else if (agg === 'max') value = values.length > 0 ? Math.max(...values) : 0;
    let color = CHART_COLORS[i % CHART_COLORS.length];
    if (xCol.settings?.options) {
      const opt = xCol.settings.options.find((o: any) => o.value === label || o.label === label);
      if (opt?.color) color = opt.color;
    }
    return { label, value: Math.round(value * 100) / 100, color };
  }).sort((a, b) => b.value - a.value);

  if (data.length === 0) return <div className="text-center text-gray-400">No data</div>;
  const maxVal = Math.max(...data.map(d => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);

  // Horizontal Bar (full size)
  if (chart.type === 'horizontal_bar') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-400 text-center mb-4">{xCol.name} vs {yCol?.name || 'Count'}</p>
        {data.map((d, i) => {
          const w = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
          return (
            <div key={i} className="flex items-center space-x-3">
              <span className="text-xs text-gray-600 w-28 text-right truncate flex-shrink-0">{d.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-7">
                <div className="h-full rounded-full flex items-center justify-end pr-3 transition-all duration-500" style={{ width: Math.max(4, w) + '%', backgroundColor: d.color }}>
                  {w > 15 && <span className="text-xs text-white font-medium">{d.value.toLocaleString()}</span>}
                </div>
              </div>
              {w <= 15 && <span className="text-xs text-gray-600 flex-shrink-0">{d.value.toLocaleString()}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  // Pie / Donut (full size)
  if (chart.type === 'pie' || chart.type === 'donut') {
    const size = 280;
    const cx = size / 2, cy = size / 2, radius = size / 2 - 12;
    const inner = chart.type === 'donut' ? radius * 0.55 : 0;
    let startAngle = -90;
    const slices = data.map(d => {
      const angle = total > 0 ? (d.value / total) * 360 : 0;
      const s = { ...d, startAngle, angle, pct: total > 0 ? ((d.value / total) * 100).toFixed(1) : '0' };
      startAngle += angle;
      return s;
    });
    function polar(cx: number, cy: number, r: number, a: number) {
      const rad = (a * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }
    return (
      <div className="flex flex-col items-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((s: any, i: number) => {
            if (s.angle <= 0) return null;
            const s1 = polar(cx, cy, radius, s.startAngle);
            const e1 = polar(cx, cy, radius, s.startAngle + s.angle);
            const s2 = polar(cx, cy, inner, s.startAngle + s.angle);
            const e2 = polar(cx, cy, inner, s.startAngle);
            const la = s.angle > 180 ? 1 : 0;
            const d = inner > 0
              ? `M ${s1.x} ${s1.y} A ${radius} ${radius} 0 ${la} 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${inner} ${inner} 0 ${la} 0 ${e2.x} ${e2.y} Z`
              : `M ${cx} ${cy} L ${s1.x} ${s1.y} A ${radius} ${radius} 0 ${la} 1 ${e1.x} ${e1.y} Z`;
            return <path key={i} d={d} fill={s.color} stroke="white" strokeWidth="2" className="hover:opacity-80 transition-opacity" />;
          })}
          {chart.type === 'donut' && (
            <>
              <text x={cx} y={cy - 4} textAnchor="middle" fill="#374151" fontSize="22" fontWeight="700">{total.toLocaleString()}</text>
              <text x={cx} y={cy + 16} textAnchor="middle" fill="#9CA3AF" fontSize="12">Total</text>
            </>
          )}
        </svg>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
          {slices.map((d: any, i: number) => (
            <div key={i} className="flex items-center space-x-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: d.color }} />
              <span className="text-sm text-gray-700">{d.label}</span>
              <span className="text-xs text-gray-400">({d.pct}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Line / Area (full size)
  if (chart.type === 'line' || chart.type === 'area') {
    const svgW = 600, svgH = 300, pad = 50, padB = 30;
    const cW = svgW - pad - 20, cH = svgH - pad - padB;
    const points = data.map((d, i) => ({
      x: pad + (i / Math.max(1, data.length - 1)) * cW,
      y: pad + cH - (maxVal > 0 ? (d.value / maxVal) * cH : 0),
      label: d.label, value: d.value,
    }));
    const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
    const areaD = pathD + ` L${points[points.length - 1].x},${pad + cH} L${points[0].x},${pad + cH} Z`;
    return (
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full">
        {chart.type === 'area' && <path d={areaD} fill="#3B82F6" fillOpacity="0.1" />}
        <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="5" fill="white" stroke="#3B82F6" strokeWidth="2" />
            <text x={p.x} y={p.y - 14} textAnchor="middle" fill="#374151" fontSize="11" fontWeight="500">{p.value.toLocaleString()}</text>
            <text x={p.x} y={svgH - 5} textAnchor="middle" fill="#9CA3AF" fontSize="10">{p.label.length > 12 ? p.label.slice(0, 11) + '…' : p.label}</text>
          </g>
        ))}
      </svg>
    );
  }

  // Bar chart (full size, default)
  return (
    <div>
      <p className="text-xs text-gray-400 text-center mb-4">{xCol.name} vs {yCol?.name || 'Count'}</p>
      <div className="flex items-end justify-center space-x-3 h-72">
        {data.map((d, i) => {
          const h = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
          return (
            <div key={i} className="flex flex-col items-center" style={{ width: Math.max(36, 400 / data.length) + 'px' }}>
              <span className="text-xs text-gray-600 mb-1 font-medium">{d.value.toLocaleString()}</span>
              <div className="w-full rounded-t hover:opacity-80 transition-all" style={{ height: Math.max(4, h) + '%', backgroundColor: d.color, minHeight: '4px' }} />
              <span className="text-[10px] text-gray-500 mt-2 text-center truncate w-full">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardClient({ data }: { data: any }) {
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [showAllTables, setShowAllTables] = useState(false);
  const [expandedChart, setExpandedChart] = useState<any>(null);

  const hasQuickActions = data.quickActions.length > 0;
  const hasApprovals = data.pendingApprovals.length > 0;
  const hasNotifications = data.notifications.length > 0;
  const hasCharts = data.pinnedCharts.length > 0;
  const hasTables = data.tables.length > 0;
  const hasShared = data.sharedTables.length > 0;
  const unreadCount = data.notifications.filter((n: any) => !n.isRead).length;

  const visibleNotifications = showAllNotifications ? data.notifications : data.notifications.slice(0, 4);
  const visibleTables = showAllTables ? data.tables : data.tables.slice(0, 6);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{data.greeting}, {data.userName}</h1>
        <p className="text-sm text-gray-500 mt-1">Here's what's happening in your workspace</p>
      </div>

      {/* Quick Actions */}
      {hasQuickActions && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            {data.quickActions.map((form: any) => (
              <Link key={form.id} href={`/forms/${form.slug}`} target="_blank"
                className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group">
                <span className="text-lg">{form.tableIcon || '📋'}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">{form.name}</p>
                  {form.description && <p className="text-[10px] text-gray-400 truncate max-w-[200px]">{form.description}</p>}
                </div>
                <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Attention Needed Row */}
      {(hasApprovals || hasNotifications) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Pending Approvals */}
          {hasApprovals && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-base">⏳</span>
                  <h3 className="text-sm font-semibold text-gray-900">Pending Approvals</h3>
                  <span className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-semibold">{data.pendingApprovals.length}</span>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {data.pendingApprovals.slice(0, 5).map((approval: any) => (
                  <Link key={approval.id} href={`/tables/${approval.tableId}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-3 min-w-0">
                      <span className="text-lg flex-shrink-0">{approval.tableIcon || '📊'}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{approval.workflowName}</p>
                        <p className="text-[10px] text-gray-400">{approval.tableName} — {approval.stageName}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span className="text-[10px] text-gray-400">{timeAgo(approval.createdAt)}</span>
                      <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Notifications */}
          {hasNotifications && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-base">🔔</span>
                  <h3 className="text-sm font-semibold text-gray-900">Recent Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold">{unreadCount} new</span>
                  )}
                </div>
                <Link href="/notifications" className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">View all</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {visibleNotifications.map((notif: any) => (
                  <div key={notif.id} className={`px-5 py-3 ${notif.isRead ? '' : 'bg-blue-50/30'}`}>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className={`text-sm ${notif.isRead ? 'text-gray-700' : 'text-gray-900 font-medium'} truncate`}>{notif.title}</p>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{notif.message}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 ml-3">{timeAgo(notif.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {data.notifications.length > 4 && (
                <button onClick={() => setShowAllNotifications(!showAllNotifications)}
                  className="w-full px-5 py-2 text-[10px] text-gray-500 hover:bg-gray-50 border-t border-gray-100">
                  {showAllNotifications ? 'Show less' : `Show ${data.notifications.length - 4} more`}
                </button>
              )}
            </div>
          )}

          {!hasApprovals && hasNotifications && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex items-center justify-center p-8">
              <div className="text-center">
                <span className="text-3xl">✅</span>
                <p className="text-sm font-medium text-gray-900 mt-2">All caught up!</p>
                <p className="text-xs text-gray-400">No pending approvals</p>
              </div>
            </div>
          )}
          {hasApprovals && !hasNotifications && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex items-center justify-center p-8">
              <div className="text-center">
                <span className="text-3xl">🔕</span>
                <p className="text-sm font-medium text-gray-900 mt-2">No notifications</p>
                <p className="text-xs text-gray-400">You're all clear</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pinned Charts */}
      {hasCharts && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dashboard Charts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.pinnedCharts.map((chart: any) => (
              <div key={chart.id} onClick={() => setExpandedChart(chart)}
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden group cursor-pointer">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">{chart.tableIcon || '📊'}</span>
                      <h4 className="text-sm font-semibold text-gray-900">{chart.name}</h4>
                    </div>
                    <span className="text-[10px] text-gray-400">{chart.tableName}</span>
                  </div>
                </div>
                <div className="p-4 h-44">
                  <MiniChart chart={chart} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tables */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Tables</h2>
          <Link href="/tables/new" className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            <span>New Table</span>
          </Link>
        </div>

        {!hasTables ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <div className="text-4xl mb-3">📊</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Create your first table</h3>
            <p className="text-sm text-gray-500 mb-4">Start organizing your data with a powerful database.</p>
            <Link href="/tables/new"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Create Table
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleTables.map((table: any) => (
                <Link key={table.id} href={`/tables/${table.id}`}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all p-5 group">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-2xl">{table.icon || '📊'}</span>
                    <span className="text-[10px] text-gray-400">{table.rowCount} rows</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 mb-1">{table.name}</h3>
                  {table.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2">{table.description}</p>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>{table.columnCount} columns</span>
                    {table.workspace && (
                      <span className="flex items-center space-x-1">
                        <span>{table.workspace.icon || '📁'}</span>
                        <span>{table.workspace.name}</span>
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            {data.tables.length > 6 && (
              <button onClick={() => setShowAllTables(!showAllTables)}
                className="w-full mt-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                {showAllTables ? 'Show less' : `Show all ${data.tables.length} tables`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Shared Tables */}
      {hasShared && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Shared with You</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.sharedTables.map((table: any) => (
              <Link key={table.id} href={`/tables/${table.id}`}
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-5 group">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{table.icon || '📊'}</span>
                  <span className="text-[10px] text-gray-400">{table.rowCount} rows</span>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 mb-1">{table.name}</h3>
                {table.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{table.description}</p>}
                {table.sharedBy && <p className="text-[10px] text-gray-400">Shared by {table.sharedBy}</p>}
              </Link>
            ))}
          </div>
        </div>
      )}
	  
	  {/* Expanded Chart Overlay */}
      {expandedChart && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-8" onClick={() => setExpandedChart(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-lg">{expandedChart.tableIcon || '📊'}</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{expandedChart.name}</h3>
                  <p className="text-xs text-gray-400">{expandedChart.tableName}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Link href={`/tables/${expandedChart.tableId}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  Open Table →
                </Link>
                <button onClick={() => setExpandedChart(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-8">
              <ExpandedChart chart={expandedChart} />
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasQuickActions && !hasApprovals && !hasNotifications && !hasCharts && !hasTables && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-md">
            <svg className="w-16 h-16 mx-auto mb-4" viewBox="0 0 512 512">
              <circle cx="256" cy="256" r="220" fill="#1E3A5F"/>
              <polygon points="256,100 360,380 300,380 276,310 236,310 212,380 152,380" fill="white"/>
            </svg>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome to Agora</h2>
            <p className="text-sm text-gray-500 mb-6">Your data management platform is ready. Create your first table to get started.</p>
            <Link href="/tables/new"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Your First Table
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}