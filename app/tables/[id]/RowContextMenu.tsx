'use client';

import { useState, useRef, useEffect } from 'react';

export function RowContextMenu({
  row,
  tableId,
  position,
  onClose,
  onInsertRow,
  canEdit = true,
}: {
  row: any;
  tableId: string;
  position: { x: number; y: number };
  onClose: () => void;
  onInsertRow?: (position: 'above' | 'below', referenceRowId: string) => void;
  canEdit?: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  async function handleDuplicate() {
    setIsDuplicating(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/rows/${row.id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        window.location.reload();
        onClose();
      } else alert('Failed to duplicate row');
    } catch (err) {
      console.error('Error duplicating row:', err);
      alert('Error duplicating row');
    } finally {
      setIsDuplicating(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this row?')) return;
    try {
      const res = await fetch(`/api/tables/${tableId}/rows/${row.id}`, { method: 'DELETE' });
      if (res.ok) {
        window.location.reload();
        onClose();
      } else alert('Failed to delete row');
    } catch (err) {
      console.error('Error deleting row:', err);
      alert('Error deleting row');
    }
  }

  // Adjust position to keep menu on screen
  const style: React.CSSProperties = { top: position.y, left: position.x };

  return (
    <div ref={menuRef} className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-1 z-50 min-w-[180px]" style={style}>
      {canEdit && onInsertRow && (
        <>
          <button onClick={() => { onInsertRow('above', row.id); onClose(); }}
            className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <span>Insert Row Above</span>
          </button>
          <button onClick={() => { onInsertRow('below', row.id); onClose(); }}
            className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span>Insert Row Below</span>
          </button>
          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
        </>
      )}

      {canEdit && (
        <button onClick={handleDuplicate} disabled={isDuplicating}
          className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2 disabled:opacity-50">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>{isDuplicating ? 'Duplicating...' : 'Duplicate Row'}</span>
        </button>
      )}

      {canEdit && (
        <>
          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
          <button onClick={handleDelete}
            className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete Row</span>
          </button>
        </>
      )}
    </div>
  );
}