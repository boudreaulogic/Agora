'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const VIEW_TYPES = [
  { value: 'grid', label: 'Grid', icon: '⊞', description: 'Spreadsheet view' },
  { value: 'kanban', label: 'Kanban', icon: '◫', description: 'Board view by status' },
  { value: 'calendar', label: 'Calendar', icon: '📅', description: 'Date-based view' },
  { value: 'gallery', label: 'Gallery', icon: '▦', description: 'Card layout' },
  { value: 'gantt', label: 'Gantt', icon: '═', description: 'Timeline view' },
];

export function ViewSwitcher({ 
  tableId, 
  views, 
  currentViewId,
  hasUnsavedChanges,
  onSaveView,
  columns = [],
}: { 
  tableId: string;
  views: any[];
  currentViewId: string | null;
  hasUnsavedChanges?: boolean;
  onSaveView?: () => Promise<void>;
  columns?: any[];
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewType, setNewViewType] = useState('grid');
  const [kanbanColumnId, setKanbanColumnId] = useState('');
  const [ganttEndColumnId, setGanttEndColumnId] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [hoveredViewId, setHoveredViewId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const currentView = views.find(v => v.id === currentViewId) 
    || views.find(v => v.isDefault) 
    || views[0];

  const groupableColumns = columns.filter(
    (c: any) => c.type === 'select' || c.type === 'multi_select'
  );

  const dateColumns = columns.filter(
    (c: any) => c.type === 'date' || c.type === 'datetime'
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function createView() {
    if (!newViewName.trim()) return;
    if (newViewType === 'kanban' && !kanbanColumnId) {
      alert('Please select a column to group by for kanban view');
      return;
    }
    if (newViewType === 'calendar' && !kanbanColumnId) {
      alert('Please select a date column for calendar view');
      return;
    }
    if (newViewType === 'gantt' && !kanbanColumnId) {
      alert('Please select a start date column for gantt view');
      return;
    }

    try {
      const config: any = {
        filters: [],
        sorts: [],
        hiddenColumns: [],
      };

      if (newViewType === 'kanban') {
        config.kanbanColumnId = kanbanColumnId;
      }
      if (newViewType === 'calendar') {
        config.calendarDateColumnId = kanbanColumnId;
      }
      if (newViewType === 'gantt') {
        config.ganttStartColumnId = kanbanColumnId;
        config.ganttEndColumnId = ganttEndColumnId || '';
        config.ganttLabelColumnId = '';
      }

      const response = await fetch(`/api/tables/${tableId}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newViewName,
          type: newViewType,
          config,
          isDefault: false,
        }),
      });

      if (response.ok) {
        const view = await response.json();
        router.refresh();
        setNewViewName('');
        setNewViewType('grid');
        setKanbanColumnId('');
        setIsCreating(false);
        setShowDropdown(false);
        router.push(`/tables/${tableId}?view=${view.id}`);
      }
    } catch (error) {
      console.error('Error creating view:', error);
    }
  }

  async function setAsDefault(viewId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch(`/api/tables/${tableId}/views/${viewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      router.refresh();
    } catch (error) {
      console.error('Error setting default view:', error);
    }
  }

  async function deleteView(viewId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (views.length === 1) {
      alert('Cannot delete the last view!');
      return;
    }
    if (!confirm('Delete this view?')) return;
    try {
      await fetch(`/api/tables/${tableId}/views/${viewId}`, {
        method: 'DELETE',
      });
      if (viewId === currentViewId) {
        const nextView = views.find(v => v.id !== viewId);
        router.push(`/tables/${tableId}?view=${nextView?.id || ''}`);
      }
      router.refresh();
      setShowDropdown(false);
    } catch (error) {
      console.error('Error deleting view:', error);
    }
  }

  async function handleSaveView(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onSaveView) return;
    setIsSaving(true);
    try {
      await onSaveView();
    } finally {
      setIsSaving(false);
      setShowDropdown(false);
    }
  }

  function switchView(viewId: string) {
    router.push(`/tables/${tableId}?view=${viewId}`);
    setShowDropdown(false);
  }

  function getViewIcon(type: string) {
    if (type === 'kanban') return '◫';
    if (type === 'calendar') return '📅';
    if (type === 'gallery') return '▦';
    if (type === 'gantt') return '═';
    return '⊞';
  }

  function resetCreateForm() {
    setIsCreating(false);
    setNewViewName('');
    setNewViewType('grid');
    setKanbanColumnId('');
    setGanttEndColumnId('');
  }

  return (
    <div className="flex items-center space-x-2" ref={dropdownRef}>
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={`flex items-center space-x-2 px-3 py-1.5 border rounded-lg text-sm bg-white dark:bg-gray-800 transition-colors ${
            hasUnsavedChanges ? 'border-amber-300 hover:bg-amber-50' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <span className="text-gray-500 dark:text-gray-400">{getViewIcon(currentView?.type)}</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{currentView?.name || 'All Items'}</span>
          {currentView?.type === 'kanban' && (<span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">Board</span>)}
          {currentView?.type === 'calendar' && (<span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">Calendar</span>)}
          {currentView?.type === 'gallery' && (<span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Gallery</span>)}
          {currentView?.type === 'gantt' && (<span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Gantt</span>)}
          {hasUnsavedChanges && (<span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />)}
          {!hasUnsavedChanges && currentView?.isDefault && (<span className="text-yellow-500 text-xs">★</span>)}
          <svg className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDropdown && (
          <div className="absolute left-0 top-10 z-20 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 w-72">
            {hasUnsavedChanges && onSaveView && (
              <div className="px-3 py-2 border-b border-amber-100 bg-amber-50">
                <button onClick={handleSaveView} disabled={isSaving}
                  className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors disabled:opacity-50">
                  {isSaving ? (
                    <><svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg><span>Saving...</span></>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg><span>Save current state to view</span></>
                  )}
                </button>
              </div>
            )}

            <div className="py-2 max-h-64 overflow-y-auto">
              {views.map((view) => (
                <div key={view.id}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer group ${view.id === currentView?.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  onMouseEnter={() => setHoveredViewId(view.id)}
                  onMouseLeave={() => setHoveredViewId(null)}
                  onClick={() => switchView(view.id)}>
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">{getViewIcon(view.type)}</span>
                    <span className={`text-sm truncate ${view.id === currentView?.id ? 'text-blue-700 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{view.name}</span>
                    {view.type === 'kanban' && (<span className="text-xs text-purple-600 bg-purple-50 px-1 py-0.5 rounded flex-shrink-0">Board</span>)}
                    {view.type === 'calendar' && (<span className="text-xs text-orange-600 bg-orange-50 px-1 py-0.5 rounded flex-shrink-0">Calendar</span>)}
                    {view.type === 'gallery' && (<span className="text-xs text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded flex-shrink-0">Gallery</span>)}
                    {view.type === 'gantt' && (<span className="text-xs text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded flex-shrink-0">Gantt</span>)}
                    {view.isDefault && (<span className="text-yellow-500 text-xs flex-shrink-0">★</span>)}
                  </div>
                  {hoveredViewId === view.id && (
                    <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                      {!view.isDefault && (
                        <button onClick={(e) => setAsDefault(view.id, e)} className="p-1 text-gray-400 hover:text-yellow-500 rounded" title="Set as default">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                        </button>
                      )}
                      {views.length > 1 && (
                        <button onClick={(e) => deleteView(view.id, e)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Delete view">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 p-2">
              {!isCreating ? (
                <button onClick={() => setIsCreating(true)}
                  className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  <span>Create new view</span>
                </button>
              ) : (
                <div className="space-y-3 px-1 py-1">
                  <input type="text" value={newViewName} onChange={(e) => setNewViewName(e.target.value)}
                    placeholder="View name..."
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (newViewType === 'grid' || newViewType === 'gallery')) createView();
                      if (e.key === 'Escape') resetCreateForm();
                    }}
                  />

                  <div className="flex flex-wrap gap-2">
                    {VIEW_TYPES.map((vt) => (
                      <button key={vt.value} type="button"
                        onClick={function() {
                          setNewViewType(vt.value);
                          setKanbanColumnId('');
                          // Auto-select booking start column for calendar views
                          if (vt.value === 'calendar') {
                            var startCol = columns.find(function(c: any) { return (c.settings as any)?.bookingRole === 'start'; });
                            if (startCol) setKanbanColumnId(startCol.id);
                          }
                        }}
                        className={`flex items-center justify-center space-x-1.5 px-3 py-2 border-2 rounded-lg text-xs transition-all ${
                          newViewType === vt.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-600 dark:text-gray-400'
                        }`}>
                        <span>{vt.icon}</span>
                        <span className="font-medium">{vt.label}</span>
                      </button>
                    ))}
                  </div>

                  {newViewType === 'kanban' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Group by column</label>
                      {groupableColumns.length === 0 ? (
                        <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-xs text-yellow-800">No select columns found. Create a Single Select column first to use kanban view.</p>
                        </div>
                      ) : (
                        <select value={kanbanColumnId} onChange={(e) => setKanbanColumnId(e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100">
                          <option value="">Select a column...</option>
                          {groupableColumns.map((col: any) => (<option key={col.id} value={col.id}>{col.name}</option>))}
                        </select>
                      )}
                    </div>
                  )}

                  {newViewType === 'calendar' && (
                    <div>
                      {columns.some(function(c: any) { return (c.settings as any)?.bookingRole === 'start'; }) ? (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm">📅</span>
                            <span className="text-xs font-bold text-blue-800">Booking Calendar</span>
                          </div>
                          <p className="text-[10px] text-blue-700">Start/end columns auto-detected. Calendar will show date ranges with conflict detection.</p>
                          <p className="text-[10px] text-blue-600 font-medium">Using: {columns.find(function(c: any) { return (c.settings as any)?.bookingRole === 'start'; })?.name}</p>
                        </div>
                      ) : (
                        <>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date column</label>
                          {dateColumns.length === 0 ? (
                            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <p className="text-xs text-yellow-800">No date columns found. Create a Date column first to use calendar view.</p>
                            </div>
                          ) : (
                            <select value={kanbanColumnId} onChange={function(e) { setKanbanColumnId(e.target.value); }}
                              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100">
                              <option value="">Select a date column...</option>
                              {dateColumns.map(function(col: any) { return (<option key={col.id} value={col.id}>{col.name}</option>); })}
                            </select>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {newViewType === 'gantt' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Start date column</label>
                        {dateColumns.length === 0 ? (
                          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-xs text-yellow-800">No date columns found. Create a Date column first.</p>
                          </div>
                        ) : (
                          <select value={kanbanColumnId} onChange={(e) => setKanbanColumnId(e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100">
                            <option value="">Select start date...</option>
                            {dateColumns.map((col: any) => (<option key={col.id} value={col.id}>{col.name}</option>))}
                          </select>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">End date column (optional)</label>
                        <select value={ganttEndColumnId} onChange={(e) => setGanttEndColumnId(e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100">
                          <option value="">No end date (1-day bars)</option>
                          {dateColumns.filter((c: any) => c.id !== kanbanColumnId).map((col: any) => (<option key={col.id} value={col.id}>{col.name}</option>))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <button onClick={createView}
                      disabled={!newViewName.trim() || ((newViewType === 'kanban' || newViewType === 'calendar' || newViewType === 'gantt') && !kanbanColumnId)}
                      className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
                      Create
                    </button>
                    <button onClick={resetCreateForm}
                      className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}