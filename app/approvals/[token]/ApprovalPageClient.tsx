'use client';

import { useState } from 'react';

function formatValue(value: any, type: string, settings?: any): string {
  if (value === null || value === undefined || value === '') return '--';
  if (type === 'currency') return '$' + parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2 });
  if (type === 'percent') return value + '%';
  if (type === 'checkbox') return value === 'true' || value === true ? 'Yes' : 'No';
  if (type === 'select' && settings?.options) {
    var opt = settings.options.find(function(o: any) { return o.value === value; });
    return opt?.label || value;
  }
  if (type === 'date' || type === 'datetime') {
    try { return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return value; }
  }
  return String(value);
}

export function ApprovalPageClient({ data }: { data: any }) {
  var [reason, setReason] = useState('');
  var [showReason, setShowReason] = useState<'approve' | 'deny' | null>(null);
  var [isSubmitting, setIsSubmitting] = useState(false);
  var [result, setResult] = useState<{ action: string; success: boolean; error?: string } | null>(null);

  async function handleAction(action: 'approve' | 'deny') {
    setIsSubmitting(true);
    try {
      var res = await fetch('/api/approvals/' + data.token + '/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason.trim() || null }),
      });
      var responseData = await res.json();
      if (res.ok) {
        setResult({ action, success: true });
      } else {
        setResult({ action, success: false, error: responseData.error || 'Failed to process' });
      }
    } catch {
      setResult({ action, success: false, error: 'Network error. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-12 text-center max-w-md w-full">
          <div className="text-5xl mb-4">
            {result.success ? (result.action === 'approve' ? '✅' : '❌') : '⚠️'}
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {result.success
              ? (result.action === 'approve' ? 'Approved!' : 'Denied')
              : 'Error'
            }
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {result.success
              ? ('You have ' + (result.action === 'approve' ? 'approved' : 'denied') + ' this request.')
              : result.error
            }
          </p>
          {result.success && (
            <a href={'/tables/' + data.tableId} className="inline-flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              <span>Open in Agora</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg w-full max-w-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white">
          <div className="flex items-center space-x-3 mb-3">
            <svg className="w-8 h-8" viewBox="0 0 512 512">
              <circle cx="256" cy="256" r="220" fill="white" fillOpacity="0.2"/>
              <polygon points="256,100 360,380 300,380 276,310 236,310 212,380 152,380" fill="white"/>
            </svg>
            <span className="text-lg font-bold">Agora</span>
          </div>
          <h1 className="text-xl font-bold mb-1">Approval Request</h1>
          <p className="text-blue-100 text-sm">{data.workflowName}</p>
        </div>

        <div className="px-8 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Table</span>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{data.tableIcon} {data.tableName}</p>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Stage</span>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{data.stageName} ({data.currentStage} of {data.totalStages})</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Submitted</span>
            <p className="text-xs text-gray-600 dark:text-gray-400">{data.createdAt}</p>
          </div>
        </div>

        <div className="px-8 py-6">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Record Details</h2>
          <div className="space-y-3">
            {data.columns.map(function(col: any) {
              var value = data.rowData[col.id];
              if (value === null || value === undefined || value === '') return null;
              return (
                <div key={col.id} className="flex items-start">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-36 flex-shrink-0 pt-0.5">{col.name}</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">{formatValue(value, col.type, col.settings)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-8 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Approving as <span className="font-medium text-gray-700 dark:text-gray-300">{data.currentUserName}</span>
          </p>
        </div>

        <div className="px-8 py-6 border-t border-gray-200 dark:border-gray-700">
          {showReason !== null ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {showReason === 'approve' ? 'Reason for Approval' : 'Reason for Denial'}
                  <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={function(e) { setReason(e.target.value); }}
                  placeholder={showReason === 'approve' ? 'Add a note about your approval...' : 'Explain why this is being denied...'}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={function() { if (showReason) handleAction(showReason); }}
                  disabled={isSubmitting}
                  className={'px-6 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors ' + (showReason === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')}
                >
                  {isSubmitting ? 'Processing...' : showReason === 'approve' ? 'Confirm Approval' : 'Confirm Denial'}
                </button>
                <button
                  onClick={function() { setShowReason(null); setReason(''); }}
                  className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-4">
              <button
                onClick={function() { setShowReason('approve'); }}
                className="flex-1 px-6 py-3 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={function() { setShowReason('deny'); }}
                className="flex-1 px-6 py-3 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Deny
              </button>
            </div>
          )}
        </div>

        <div className="px-8 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
            Powered by Agora
          </p>
        </div>
      </div>
    </div>
  );
}
