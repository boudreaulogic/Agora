'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export function ApprovalDetailClient({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/approvals/${token}/details`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAction(action: 'approved' | 'denied') {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/approvals/${token}/act`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason.trim() || null }),
      });
      const result = await res.json();
      if (result.success) {
        setResult(action);
        // Refresh data
        const updated = await fetch(`/api/approvals/${token}/details`).then(r => r.json());
        if (!updated.error) setData(updated);
      }
    } catch {} finally { setSubmitting(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  if (!data) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Approval not found</h2>
        <p className="text-sm text-gray-500 mt-1">This link may be invalid or expired.</p>
      </div>
    </div>
  );

  const { request, workflow, row, table, columns, requester, isApprover, hasActed, myAction } = data;
  const rowData = row?.data || {};
  const isPending = request.status === 'pending';

  function getStatusStyle(status: string) {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'denied': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto py-8 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <span className="text-2xl">{table?.icon || '📊'}</span>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{workflow.name}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${getStatusStyle(request.status)}`}>
                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {table?.name} • Requested by {requester?.name || requester?.email || 'Unknown'} • {new Date(request.createdAt).toLocaleString()}
            </p>
          </div>
          <Link href={`/tables/${table?.id}`} className="px-4 py-2 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
            View Table →
          </Link>
        </div>

        {/* Record Card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">📋 Record Details</h3>
          </div>
          <div className="p-6 space-y-3">
            {columns.map((col: any) => {
              const val = rowData[col.id];
              if (val === undefined || val === null || val === '') return null;
              return (
                <div key={col.id} className="flex items-start">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-40 flex-shrink-0 pt-0.5">{col.name}</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100 flex-1">{String(val)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action History */}
        {request.actions.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">📜 Approval History</h3>
            </div>
            <div className="p-6 space-y-4">
              {request.actions.map((act: any) => (
                <div key={act.id} className="flex items-start space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${
                    act.action === 'approved' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {act.action === 'approved' ? '✓' : '✗'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {act.user?.name || act.user?.email || 'Unknown'}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        act.action === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {act.action}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(act.createdAt).toLocaleString()}</span>
                    </div>
                    {act.reason && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">"{act.reason}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Panel */}
        {isPending && isApprover && !hasActed && !result && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-blue-200 dark:border-blue-800 shadow-sm">
            <div className="px-6 py-4 border-b border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
              <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200">🔔 Your Decision</h3>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Review the record above and approve or deny this request.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Comment (optional)</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Add a reason for your decision..."
                  rows={3}
                  className="w-full px-4 py-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleAction('approved')}
                  disabled={submitting}
                  className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {submitting ? 'Processing...' : '✓ Approve'}
                </button>
                <button
                  onClick={() => handleAction('denied')}
                  disabled={submitting}
                  className="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {submitting ? 'Processing...' : '✗ Deny'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Already acted */}
        {hasActed && !result && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center">
            <div className="text-3xl mb-2">{myAction?.action === 'approved' ? '✅' : '❌'}</div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">You already {myAction?.action} this request</p>
            {myAction?.reason && <p className="text-xs text-gray-500 mt-1">Your comment: "{myAction.reason}"</p>}
          </div>
        )}

        {/* Just acted */}
        {result && (
          <div className={`rounded-xl border-2 p-8 text-center ${
            result === 'approved' ? 'border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800' : 'border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
          }`}>
            <div className="text-5xl mb-3">{result === 'approved' ? '✅' : '❌'}</div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
              {result === 'approved' ? 'Approved!' : 'Denied'}
            </h3>
            <p className="text-sm text-gray-500">Your decision has been recorded and the requester has been notified.</p>
          </div>
        )}

        {/* Not resolved, not approver */}
        {isPending && !isApprover && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center">
            <div className="text-3xl mb-2">⏳</div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Waiting for approval</p>
            <p className="text-xs text-gray-500 mt-1">You are not an approver for this request.</p>
          </div>
        )}
      </div>
    </div>
  );
}
