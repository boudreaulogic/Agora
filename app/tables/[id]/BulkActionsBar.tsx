'use client';
import { useState, useEffect } from 'react';

export function BulkActionsBar({ 
  selectedRows, 
  onClearSelection,
  tableId 
}: { 
  selectedRows: string[];
  onClearSelection: () => void;
  tableId: string;
}) {
  var [isDeleting, setIsDeleting] = useState(false);
  var [isExporting, setIsExporting] = useState(false);
  var [templates, setTemplates] = useState<any[]>([]);
  var [showTemplatePicker, setShowTemplatePicker] = useState(false);
  var [manualAutomations, setManualAutomations] = useState<any[]>([]);
  var [showActionPicker, setShowActionPicker] = useState(false);
  var [runningAction, setRunningAction] = useState<string | null>(null);
  var [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch templates and manual automations when rows are selected
  useEffect(function() {
    if (selectedRows.length > 0) {
      fetch('/api/tables/' + tableId + '/record-export')
        .then(function(r) { return r.json(); })
        .then(function(data) { setTemplates(data.templates || []); })
        .catch(function() { setTemplates([]); });

      // Fetch manual automations for this table
      fetch('/api/automations')
        .then(function(r) { return r.json(); })
        .then(function(automations) {
          var manual = automations.filter(function(a: any) {
            return a.triggerType === 'manual' && a.enabled && (a.triggerConfig as any)?.tableId === tableId;
          });
          setManualAutomations(manual);
        })
        .catch(function() { setManualAutomations([]); });
    }
  }, [selectedRows.length > 0, tableId]);

  // Clear action result after 5 seconds
  useEffect(function() {
    if (actionResult) {
      var timer = setTimeout(function() { setActionResult(null); }, 5000);
      return function() { clearTimeout(timer); };
    }
  }, [actionResult]);

  async function handleBulkDelete() {
    if (!confirm('Delete ' + selectedRows.length + ' row(s)? This cannot be undone.')) return;
    setIsDeleting(true);
    try {
      var response = await fetch('/api/tables/' + tableId + '/rows/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: selectedRows }),
      });
      if (response.ok) { window.location.reload(); }
      else { alert('Failed to delete rows'); }
    } catch (error) {
      console.error('Error deleting rows:', error);
      alert('Error deleting rows');
    } finally { setIsDeleting(false); }
  }

  async function handleExport(templateId: string) {
    setIsExporting(true);
    setShowTemplatePicker(false);
    try {
      var response = await fetch('/api/tables/' + tableId + '/record-export/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: templateId, rowIds: selectedRows }),
      });
      if (response.ok) {
        var blob = await response.blob();
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (response.headers.get('Content-Disposition') || '').split('filename="')[1]?.replace('"', '') || 'export.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        var err = await response.json();
        alert(err.error || 'Export failed');
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed');
    } finally { setIsExporting(false); }
  }

  async function handleRunAction(automationId: string, automationName: string) {
    setRunningAction(automationId);
    setShowActionPicker(false);
    setActionResult(null);
    try {
      var response = await fetch('/api/automations/' + automationId + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: selectedRows, tableId: tableId }),
      });
      var data = await response.json();
      if (response.ok) {
        setActionResult({
          success: !data.hasErrors,
          message: data.hasErrors
            ? automationName + ' completed with errors on ' + selectedRows.length + ' row(s): ' + data.errors.join('; ')
            : automationName + ' executed on ' + selectedRows.length + ' row(s)',
        });
        // Reload to show updated data
        setTimeout(function() { window.location.reload(); }, 2000);
      } else {
        setActionResult({ success: false, message: data.error || 'Action failed' });
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to run action' });
    } finally { setRunningAction(null); }
  }

  if (selectedRows.length === 0) return null;

  return (
    <div className="bg-blue-600 text-white px-6 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center space-x-4">
        <span className="font-medium">{selectedRows.length} row(s) selected</span>
        <button onClick={onClearSelection} className="text-blue-100 hover:text-white text-sm">Clear selection</button>
        {actionResult && (
          <span className={'text-xs px-3 py-1 rounded-full ' + (actionResult.success ? 'bg-green-500/30 text-green-100' : 'bg-red-500/30 text-red-100')}>
            {actionResult.message}
          </span>
        )}
      </div>
      <div className="flex items-center space-x-3">
        {/* Run Action Button */}
        {manualAutomations.length > 0 && (
          <div className="relative">
            <button
              onClick={function() { setShowActionPicker(!showActionPicker); setShowTemplatePicker(false); }}
              disabled={!!runningAction}
              className="flex items-center space-x-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="text-sm">⚡</span>
              <span>{runningAction ? 'Running...' : 'Run Action'}</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showActionPicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={function() { setShowActionPicker(false); }} />
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Run Automation</span>
                  </div>
                  {manualAutomations.map(function(auto: any) {
                    return (
                      <button key={auto.id}
                        onClick={function() { handleRunAction(auto.id, auto.name); }}
                        className="w-full px-3 py-2.5 text-left hover:bg-gray-50 flex items-start space-x-2.5 transition-colors"
                      >
                        <span className="text-yellow-500 mt-0.5">⚡</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{auto.name}</p>
                          {auto.description && (<p className="text-[10px] text-gray-400 truncate mt-0.5">{auto.description}</p>)}
                          <p className="text-[10px] text-gray-400 mt-0.5">{auto.actions?.length || 0} action{(auto.actions?.length || 0) !== 1 ? 's' : ''}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Export Button */}
        {templates.length > 0 && (
          <div className="relative">
            <button
              onClick={function() {
                if (templates.length === 1) { handleExport(templates[0].id); }
                else { setShowTemplatePicker(!showTemplatePicker); setShowActionPicker(false); }
              }}
              disabled={isExporting}
              className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>{isExporting ? 'Exporting...' : 'Export PDF'}</span>
            </button>

            {showTemplatePicker && templates.length > 1 && (
              <>
                <div className="fixed inset-0 z-10" onClick={function() { setShowTemplatePicker(false); }} />
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Choose Template</span>
                  </div>
                  {templates.map(function(t: any) {
                    return (
                      <button key={t.id} onClick={function() { handleExport(t.id); }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2">
                        <span>📄</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{t.name}</p>
                          <p className="text-[10px] text-gray-400">{t.originalFilename}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Delete Button */}
        <button onClick={handleBulkDelete} disabled={isDeleting}
          className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
        </button>
      </div>
    </div>
  );
}