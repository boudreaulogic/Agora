'use client';

// Power Automate-style run history: filterable, paginated, auto-refreshing,
// with an expandable per-step timeline (inputs/outputs/error/retries) and
// one-click Resubmit. Self-contained Tailwind + dark mode.

import { useState, useEffect, useCallback, useRef } from 'react';

interface StepResult {
  actionId?: string;
  actionType?: string;
  name?: string;
  status: string;
  input?: any;
  output?: any;
  error?: string;
  durationMs?: number;
  attempts?: number;
}

interface Run {
  id: string;
  status: string;
  triggerSource?: string | null;
  triggeredByUserId?: string | null;
  durationMs?: number | null;
  rerunOfId?: string | null;
  errorMessage?: string | null;
  triggerData?: any;
  stepResults?: StepResult[] | null;
  startedAt: string;
  completedAt?: string | null;
}

var STATUS_FILTERS = ['all', 'success', 'failed', 'running', 'skipped'];

function statusClasses(status: string): string {
  switch (status) {
    case 'success': return 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300';
    case 'failed':  return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300';
    case 'running': return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300';
    case 'skipped': return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    default:        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  }
}

function fmtDuration(ms?: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return ms + 'ms';
  var s = ms / 1000;
  if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + 's';
  var m = Math.floor(s / 60);
  return m + 'm ' + Math.round(s - m * 60) + 's';
}

function fmtRelative(iso: string): string {
  var then = new Date(iso).getTime();
  var diff = Date.now() - then;
  var s = Math.round(diff / 1000);
  if (s < 60) return s + 's ago';
  var m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  var h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return new Date(iso).toLocaleString();
}

function JsonBlock({ value }: { value: any }) {
  if (value == null) return null;
  var text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 p-2 text-[11px] leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words font-mono">
      {text}
    </pre>
  );
}

function StepRow({ step, index }: { step: StepResult; index: number }) {
  var [open, setOpen] = useState(false);
  var hasDetail = step.input != null || step.output != null || step.error != null;
  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-0">
      <button
        onClick={function() { if (hasDetail) setOpen(!open); }}
        className={'w-full flex items-center gap-2 py-1.5 text-left ' + (hasDetail ? 'cursor-pointer' : 'cursor-default')}
      >
        <span className="text-[10px] w-4 text-gray-400 dark:text-gray-500">{hasDetail ? (open ? '▼' : '▶') : ''}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{index + 1}.</span>
        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">
          {step.name || step.actionType}
        </span>
        {typeof step.attempts === 'number' && step.attempts > 1 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" title="Retried">
            ×{step.attempts}
          </span>
        )}
        <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{fmtDuration(step.durationMs)}</span>
        <span className={'text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ' + statusClasses(step.status)}>
          {step.status}
        </span>
      </button>
      {open && hasDetail && (
        <div className="pl-6 pb-2">
          {step.error && (
            <div className="mt-1 text-[11px] text-red-600 dark:text-red-400 font-medium">{step.error}</div>
          )}
          {step.input != null && (
            <div>
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Inputs</div>
              <JsonBlock value={step.input} />
            </div>
          )}
          {step.output != null && (
            <div>
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Outputs</div>
              <JsonBlock value={step.output} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RunHistoryPanel({ automationId, canRerun }: { automationId: string; canRerun?: boolean }) {
  var [runs, setRuns] = useState<Run[]>([]);
  var [status, setStatus] = useState('all');
  var [loading, setLoading] = useState(true);
  var [hasMore, setHasMore] = useState(false);
  var [total, setTotal] = useState(0);
  var [expandedId, setExpandedId] = useState<string | null>(null);
  var [rerunningId, setRerunningId] = useState<string | null>(null);
  var [notice, setNotice] = useState<string | null>(null);
  var pageRef = useRef(0);
  var PAGE = 25;

  var load = useCallback(async function(reset: boolean) {
    var offset = reset ? 0 : pageRef.current * PAGE;
    try {
      var r = await fetch('/api/automations/' + automationId + '/runs?limit=' + PAGE + '&offset=' + offset + '&status=' + status);
      if (!r.ok) { setLoading(false); return; }
      var d = await r.json();
      var incoming: Run[] = d.runs || [];
      setRuns(function(prev) { return reset ? incoming : prev.concat(incoming); });
      setHasMore(!!d.hasMore);
      setTotal(d.total || 0);
    } catch (e) {
      // swallow — transient
    } finally {
      setLoading(false);
    }
  }, [automationId, status]);

  // Reload from scratch whenever the filter changes.
  useEffect(function() {
    setLoading(true);
    pageRef.current = 0;
    load(true);
  }, [load]);

  // Auto-refresh the first page while anything is still running.
  useEffect(function() {
    var anyRunning = runs.some(function(r) { return r.status === 'running' || r.status === 'pending'; });
    if (!anyRunning) return;
    var t = setInterval(function() { pageRef.current = 0; load(true); }, 4000);
    return function() { clearInterval(t); };
  }, [runs, load]);

  function loadMore() {
    pageRef.current = pageRef.current + 1;
    load(false);
  }

  async function rerun(runId: string) {
    setRerunningId(runId);
    setNotice(null);
    try {
      var r = await fetch('/api/automations/' + automationId + '/runs/' + runId + '/rerun', { method: 'POST' });
      var d = await r.json();
      if (r.ok) {
        setNotice(d.status === 'success' ? 'Re-run completed successfully.' : 'Re-run finished with errors: ' + (d.errorMessage || 'failed'));
        pageRef.current = 0;
        load(true);
      } else {
        setNotice(d.error || 'Re-run failed');
      }
    } catch (e: any) {
      setNotice('Re-run failed');
    } finally {
      setRerunningId(null);
    }
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map(function(s) {
            var active = status === s;
            return (
              <button
                key={s}
                onClick={function() { setStatus(s); }}
                className={'px-2.5 py-1 text-xs rounded-md capitalize transition-colors ' + (active
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700')}
              >
                {s}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">{total} run{total === 1 ? '' : 's'}</span>
      </div>

      {notice && (
        <div className="mb-3 text-xs px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Loading runs…</div>
      ) : runs.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No runs yet.</div>
      ) : (
        <div className="space-y-2">
          {runs.map(function(run) {
            var expanded = expandedId === run.id;
            var steps = run.stepResults || [];
            return (
              <div key={run.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2">
                  <button
                    onClick={function() { setExpandedId(expanded ? null : run.id); }}
                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                  >
                    <span className="text-[10px] w-3 text-gray-400 dark:text-gray-500">{expanded ? '▼' : '▶'}</span>
                    <span className={'text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0 ' + statusClasses(run.status)}>
                      {run.status}
                    </span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 shrink-0">{fmtRelative(run.startedAt)}</span>
                    {run.triggerSource && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
                        {run.triggerSource === 'rerun' ? '↻ re-run' : run.triggerSource}
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{fmtDuration(run.durationMs)}</span>
                    {run.errorMessage && (
                      <span className="text-[11px] text-red-600 dark:text-red-400 truncate min-w-0">{run.errorMessage}</span>
                    )}
                  </button>
                  {canRerun && (
                    <button
                      onClick={function() { rerun(run.id); }}
                      disabled={rerunningId === run.id}
                      className="shrink-0 text-[11px] px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                      title="Resubmit this run with its original inputs"
                    >
                      {rerunningId === run.id ? 'Running…' : '↻ Re-run'}
                    </button>
                  )}
                </div>
                {expanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                    {steps.length === 0 ? (
                      <div className="text-xs text-gray-400 dark:text-gray-500 py-2">No step details recorded.</div>
                    ) : (
                      <div>
                        {steps.map(function(step, i) { return <StepRow key={i} step={step} index={i} />; })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {hasMore && (
            <button
              onClick={loadMore}
              className="w-full py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
