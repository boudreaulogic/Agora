'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function TableSettingsMenu({ 
  table,
  onEdit 
}: { 
  table: any;
  onEdit: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowWorkspacePicker(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  async function fetchWorkspaces() {
    setIsLoadingWorkspaces(true);
    try {
      const res = await fetch('/api/workspaces');
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces || []);
      }
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }

  async function handleMoveToWorkspace(workspaceId: string | null) {
    setIsMoving(true);
    try {
      if (workspaceId) {
        // Move into workspace
        const res = await fetch(`/api/workspaces/${workspaceId}/tables`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId: table.id }),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || 'Failed to move table');
          return;
        }
      } else {
        // Remove from current workspace
        if (table.workspaceId) {
          const res = await fetch(`/api/workspaces/${table.workspaceId}/tables`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tableId: table.id }),
          });
          if (!res.ok) {
            const err = await res.json();
            alert(err.error || 'Failed to remove from workspace');
            return;
          }
        }
      }
      setIsOpen(false);
      setShowWorkspacePicker(false);
      router.refresh();
    } finally {
      setIsMoving(false);
    }
  }

  async function handleDelete() {
    const confirmation = prompt(
      `⚠️ DELETE TABLE "${table.name}"?\n\nThis will permanently delete:\n• All ${table.rows?.length || 0} rows of data\n• All ${table.columns?.length || 0} columns\n• This cannot be undone!\n\nType the table name to confirm: "${table.name}"`
    );

    if (confirmation !== table.name) {
      if (confirmation !== null) {
        alert('Table name did not match. Deletion cancelled.');
      }
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/tables/${table.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/');
        router.refresh();
      } else {
        alert('Failed to delete table');
        setIsDeleting(false);
      }
    } catch (error) {
      console.error('Error deleting table:', error);
      alert('Error deleting table');
      setIsDeleting(false);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        title="Table settings"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {isOpen && !showWorkspacePicker && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
          <button
            onClick={() => {
              setIsOpen(false);
              onEdit();
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>Edit Table Info</span>
          </button>

          <button
            onClick={() => {
              setShowWorkspacePicker(true);
              fetchWorkspaces();
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span>{table.workspaceId ? 'Move to Workspace...' : 'Add to Workspace...'}</span>
          </button>

          <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
          
          <button
            onClick={() => {
              setIsOpen(false);
              handleDelete();
            }}
            disabled={isDeleting}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>{isDeleting ? 'Deleting...' : 'Delete Table'}</span>
          </button>
        </div>
      )}

      {/* Workspace Picker Dropdown */}
      {isOpen && showWorkspacePicker && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
          {/* Header */}
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <button
              onClick={() => setShowWorkspacePicker(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Move to Workspace</span>
            <div className="w-4" />
          </div>

          {isLoadingWorkspaces ? (
            <div className="px-4 py-4 text-center text-sm text-gray-400 dark:text-gray-500">Loading...</div>
          ) : (
            <div className="max-h-60 overflow-y-auto py-1">
              {/* Remove from workspace option */}
              {table.workspaceId && (
                <>
                  <button
                    onClick={() => handleMoveToWorkspace(null)}
                    disabled={isMoving}
                    className="w-full px-4 py-2 text-left text-sm text-orange-600 hover:bg-orange-50 flex items-center space-x-2 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Remove from Workspace</span>
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                </>
              )}

              {/* Workspace list */}
              {workspaces.length === 0 ? (
                <div className="px-4 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                  No workspaces yet. Create one from the sidebar.
                </div>
              ) : (
                workspaces.map((ws: any) => {
                  const isCurrent = table.workspaceId === ws.id;
                  return (
                    <button
                      key={ws.id}
                      onClick={() => !isCurrent && handleMoveToWorkspace(ws.id)}
                      disabled={isCurrent || isMoving}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center space-x-2 disabled:opacity-50 ${
                        isCurrent
                          ? 'text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 cursor-default'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span>{ws.icon || '📁'}</span>
                      <span className="flex-1 truncate">{ws.name}</span>
                      {isCurrent && (
                        <span className="text-xs text-green-600 font-medium">Current</span>
                      )}
                    </button>
                  );
                })
              )}

              {isMoving && (
                <div className="px-4 py-2 text-center text-xs text-blue-600 dark:text-blue-400">
                  Moving table...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}