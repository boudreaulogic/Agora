'use client';

// Run analytics — success rate, durations, runs-over-time, top failing flows.
// Global across the user's automations, or scoped to one. Tailwind + dark mode.

import { useState, useEffect } from 'react';

interface PerDay { date: string; success: number; failed: number; other: number; }
interface Analytics {
  days: number;
  totalRuns: number;
  byStatus: Record<string, number>;
  successRate: number | null;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  perDay: PerDay[];
  topFailing: { automationId: string; name: string; failures: number }[];
  automationCount?: number;
}

function fmtDuration(ms?: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return ms + 'ms';
  var s = ms / 1000;
  if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + 's';
  var m = Math.floor(s / 60);
  return m + 'm ' + Math.round(s - m * 60) + 's';
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export function AutomationAnalytics({ automationId }: { automationId?: string }) {
  var [data, setData] = useState<Analytics | null>(null);
  var [days, setDays] = useState(14);
  var [loading, setLoading] = useState(true);

  useEffect(function() {
    setLoading(true);
    var qs = 'days=' + days + (automationId ? '&automationId=' + automationId : '');
    fetch('/api/automations/analytics?' + qs)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) { setData(d); })
      .catch(function() { setData(null); })
      .finally(function() { setLoading(false); });
  }, [days, automationId]);

  if (loading) {
    return <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Loading analytics…</div>;
  }
  if (!data) {
    return <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No analytics available.</div>;
  }

  var maxDay = Math.max(1, ...data.perDay.map(function(d) { return d.success + d.failed + d.other; }));

  return (
    <div className="space-y-5">
      {/* Range selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {automationId ? 'This automation' : 'All automations'}
          <span className="text-gray-400 dark:text-gray-500 font-normal"> · last {data.days} days</span>
        </h3>
        <div className="flex items-center gap-1">
          {[7, 14, 30].map(function(d) {
            var active = days === d;
            return (
              <button
                key={d}
                onClick={function() { setDays(d); }}
                className={'px-2.5 py-1 text-xs rounded-md transition-colors ' + (active
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700')}
              >
                {d}d
              </button>
            );
          })}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total runs" value={String(data.totalRuns)} sub={(data.byStatus.failed || 0) + ' failed'} />
        <StatCard label="Success rate" value={data.successRate == null ? '—' : data.successRate + '%'} />
        <StatCard label="Avg duration" value={fmtDuration(data.avgDurationMs)} />
        <StatCard label="P95 duration" value={fmtDuration(data.p95DurationMs)} />
      </div>

      {/* Runs over time */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Runs over time</div>
          <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />Success</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />Failed</span>
          </div>
        </div>
        <div className="flex items-end gap-1 h-32">
          {data.perDay.map(function(d) {
            var totalH = d.success + d.failed + d.other;
            var sH = (d.success / maxDay) * 100;
            var fH = (d.failed / maxDay) * 100;
            var oH = (d.other / maxDay) * 100;
            return (
              <div key={d.date} className="flex-1 flex flex-col justify-end items-stretch group relative" title={d.date + ': ' + totalH + ' runs'}>
                <div className="flex flex-col-reverse" style={{ height: '100%' }}>
                  {d.success > 0 && <div className="bg-green-500 dark:bg-green-500/80 rounded-t-sm" style={{ height: sH + '%' }} />}
                  {d.failed > 0 && <div className="bg-red-500 dark:bg-red-500/80" style={{ height: fH + '%' }} />}
                  {d.other > 0 && <div className="bg-gray-300 dark:bg-gray-600" style={{ height: oH + '%' }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-gray-400 dark:text-gray-500">
          <span>{data.perDay.length > 0 ? data.perDay[0].date.slice(5) : ''}</span>
          <span>{data.perDay.length > 0 ? data.perDay[data.perDay.length - 1].date.slice(5) : ''}</span>
        </div>
      </div>

      {/* Top failing */}
      {!automationId && data.topFailing.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Most failures</div>
          <div className="space-y-1.5">
            {data.topFailing.map(function(t) {
              return (
                <div key={t.automationId} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{t.name}</span>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 shrink-0 ml-2">{t.failures} failed</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
