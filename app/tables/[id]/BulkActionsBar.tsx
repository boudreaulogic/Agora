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
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Fetch templates when rows are selected
  useEffect(() => {
    if (selectedRows.length > 0) {
      fetch(`/api/tables/${tableId}/record-export`)
        .then(r => r.json())
        .then(data => setTemplates(data.templates || []))
        .catch(() => setTemplates([]));
    }
  }, [selectedRows.length > 0, tableId]);

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selectedRows.length} row(s)? This cannot be undone.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/tables/${tableId}/rows/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: selectedRows }),
      });
      if (response.ok) {
        window.location.reload();
      } else {
        alert('Failed to delete rows');
      }
    } catch (error) {
      console.error('Error deleting rows:', error);
      alert('Error deleting rows');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleExport(templateId: string) {
    setIsExporting(true);
    setShowTemplatePicker(false);
    try {
      const response = await fetch(`/api/tables/${tableId}/record-export/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, rowIds: selectedRows }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"', '') || 'export.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const err = await response.json();
        alert(err.error || 'Export failed');
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  if (selectedRows.length === 0) return null;

  return (
    <div className="bg-blue-600 text-white px-6 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center space-x-4">
        <span className="font-medium">{selectedRows.length} row(s) selected</span>
        <button
          onClick={onClearSelection}
          className="text-blue-100 hover:text-white text-sm"
        >
          Clear selection
        </button>
      </div>
      <div className="flex items-center space-x-3">
        {/* Export Button */}
        {templates.length > 0 && (
          <div className="relative">
            <button
              onClick={() => {
                if (templates.length === 1) {
                  handleExport(templates[0].id);
                } else {
                  setShowTemplatePicker(!showTemplatePicker);
                }
              }}
              disabled={isExporting}
              className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>{isExporting ? 'Exporting...' : '📄 Export PDF'}</span>
            </button>

            {/* Template picker dropdown */}
            {showTemplatePicker && templates.length > 1 && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTemplatePicker(false)} />
                <div className="absolute right-0 bottom-full mb-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Choose Template</span>
                  </div>
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleExport(t.id)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                    >
                      <span>📄</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{t.name}</p>
                        <p className="text-[10px] text-gray-400">{t.originalFilename}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Delete Button */}
        <button
          onClick={handleBulkDelete}
          disabled={isDeleting}
          className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
        </button>
      </div>
    </div>
  );
}