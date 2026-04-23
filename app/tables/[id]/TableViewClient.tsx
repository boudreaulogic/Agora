'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { TableWithSelection } from './TableWithSelection';
import { AddColumnModal } from './AddColumnModal';
import { TableSettingsMenu } from './TableSettingsMenu';
import { EditTableModal } from './EditTableModal';
import { ImportCSVButton } from './ImportCSVButton';
import { ViewSwitcher } from './ViewSwitcher';
import { ShareTableModal } from './ShareTableModal';
import { FindReplaceModal } from './FindReplaceModal';
import { ActivityPanel } from './ActivityPanel';
import { KanbanBoard } from './KanbanBoard';
import { CalendarBoard } from './CalendarBoard';
import { GalleryBoard } from './GalleryBoard';
import { GanttChart } from './GanttChart';
import { RowExpandPanel } from './RowExpandPanel';
import { ColumnPermissionsModal } from './ColumnPermissionsModal';
import { FormsManager } from './FormsManager';
import { ChartsManager } from './ChartsManager';
import { ApprovalsManager } from './ApprovalsManager';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import { ConditionalFormattingModal } from './ConditionalFormattingModal';
import { ApiAccessPanel } from './ApiAccessPanel';
import { NewRowPanel } from './NewRowPanel';
import { RecordExportManager } from './RecordExportManager';
import { DataConnectorPanel } from './DataConnectorPanel';
import { useUndo } from '@/lib/useUndo';

interface Match {
  rowId: string;
  columnId: string;
  value: string;
  rowIndex: number;
  columnName: string;
}

export function TableViewClient({ 
  table, 
  addBlankRow,
  session,
  permissionLevel,
  columnPermissions = {},
}: { 
  table: any; 
  addBlankRow: () => Promise<void>;
  session: any;
  permissionLevel?: string | null;
  columnPermissions?: Record<string, { canView: boolean; canEdit: boolean }>;
}) {
  const isOwner = permissionLevel === 'owner';
  const isAdminUser = permissionLevel === 'admin' || isOwner;
  const canEdit = permissionLevel === 'editor' || isAdminUser;
  const isViewer = permissionLevel === 'viewer';

  const [permissionsColumn, setPermissionsColumn] = useState<any>(null);
  const [colPerms, setColPerms] = useState(columnPermissions);

  // System columns — virtual columns from row metadata
  const systemColumns = [
    { id: '__sys_row_number', name: 'Row #', type: 'system_row_number', isSystem: true, position: -5, width: 80 },
    { id: '__sys_created_at', name: 'Created At', type: 'system_datetime', isSystem: true, position: -4, width: 170 },
    { id: '__sys_updated_at', name: 'Updated At', type: 'system_datetime', isSystem: true, position: -3, width: 170 },
    { id: '__sys_created_by', name: 'Created By', type: 'system_user', isSystem: true, position: -2, width: 150 },
    { id: '__sys_row_id', name: 'Row ID', type: 'system_id', isSystem: true, position: -1, width: 220 },
  ];

  async function refreshColumnPermissions() {
    window.location.reload();
  }

  const [isEditingTable, setIsEditingTable] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isFormsOpen, setIsFormsOpen] = useState(false);
  const [isChartsOpen, setIsChartsOpen] = useState(false);
  const [isApprovalsOpen, setIsApprovalsOpen] = useState(false);
  const [isNotifSettingsOpen, setIsNotifSettingsOpen] = useState(false);
  const [isFormattingOpen, setIsFormattingOpen] = useState(false);
  const [isApiAccessOpen, setIsApiAccessOpen] = useState(false);
  const [isRecordExportOpen, setIsRecordExportOpen] = useState(false);
  const [isConnectorsOpen, setIsConnectorsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [isNewRowOpen, setIsNewRowOpen] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showAddRowMenu, setShowAddRowMenu] = useState(false);
  const addRowMenuRef = useRef<HTMLDivElement>(null);
  const [expandedRow, setExpandedRow] = useState<any>(null);
  const [showFieldsMenu, setShowFieldsMenu] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const currentViewId = searchParams.get('view');

  const { recordAction, undo, redo, canUndo, canRedo } = useUndo();
  const wsSendRef = useRef<((message: any) => void) | null>(null);

  const [lookupData, setLookupData] = useState<Record<string, Record<string, any[]>>>({});
  const [lookupRefreshCounter, setLookupRefreshCounter] = useState(0);
  const [rollupData, setRollupData] = useState<Record<string, Record<string, any>>>({});
  const [rollupRefreshCounter, setRollupRefreshCounter] = useState(0);

  const currentView = table.views?.find((v: any) => v.id === currentViewId) 
    || table.views?.find((v: any) => v.isDefault) 
    || table.views?.[0];

  const baseColumnOrder = [...table.columns].sort((a: any, b: any) => a.position - b.position);

  function buildColumnOrder(viewConfig: any) {
    const savedOrder = viewConfig?.columnOrder as string[] | undefined;
    const allColumns = [...systemColumns, ...baseColumnOrder];
    if (savedOrder?.length) {
      const ordered = savedOrder
        .map((id: string) => allColumns.find((c: any) => c.id === id))
        .filter(Boolean);
      const missing = allColumns.filter((c: any) => !savedOrder.includes(c.id));
      return [...ordered, ...missing];
    }
    return allColumns;
  }

  const [columnOrder, setColumnOrder] = useState<any[]>(() => buildColumnOrder(currentView?.config));
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    const saved = currentView?.config?.hiddenColumns || [];
    // System columns hidden by default unless explicitly shown
    const defaults = new Set<string>(saved);
    systemColumns.forEach(sc => {
      if (!saved.includes(sc.id) && !currentView?.config?.shownSystemColumns?.includes(sc.id)) {
        defaults.add(sc.id);
      }
    });
    return defaults;
  });
  const [filters, setFilters] = useState<{ [columnId: string]: any }>(
    currentView?.config?.filters
      ? Object.fromEntries(currentView.config.filters.map((f: any) => [f.columnId, f]))
      : {}
  );
  const [sortConfig, setSortConfig] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(
    currentView?.config?.sorts?.[0] || null
  );
  const [summaryConfig, setSummaryConfig] = useState<{ [columnId: string]: any }>(
    currentView?.config?.summaryConfig || {}
  );
  const [formattingRules, setFormattingRules] = useState<any[]>(
    currentView?.config?.formattingRules || []
  );
  const [rowOrder, setRowOrder] = useState<any[]>(
    [...table.rows].sort((a: any, b: any) => a.position - b.position)
  );
  const [highlightedCell, setHighlightedCell] = useState<{ rowId: string; columnId: string } | null>(null);

  useEffect(() => {
    setColumnOrder(buildColumnOrder(currentView?.config));
    setHiddenColumns(new Set(currentView?.config?.hiddenColumns || []));
    setFilters(
      currentView?.config?.filters
        ? Object.fromEntries(currentView.config.filters.map((f: any) => [f.columnId, f]))
        : {}
    );
    setSortConfig(currentView?.config?.sorts?.[0] || null);
    setSummaryConfig(currentView?.config?.summaryConfig || {});
    setFormattingRules(currentView?.config?.formattingRules || []);
  }, [currentView?.id]);

  useEffect(() => {
    async function fetchLookups() {
      try {
        const response = await fetch(`/api/tables/${table.id}/lookups`);
        if (response.ok) {
          const data = await response.json();
          setLookupData(data);
        }
      } catch (error) {
        console.error('Error fetching lookups:', error);
      }
    }
    const hasLookups = table.columns.some((c: any) => c.type === 'lookup');
    if (hasLookups) fetchLookups();
  }, [table.id, table.columns, lookupRefreshCounter]);

  useEffect(() => {
    async function fetchRollups() {
      try {
        const response = await fetch(`/api/tables/${table.id}/rollups`);
        if (response.ok) {
          const data = await response.json();
          setRollupData(data);
        }
      } catch (error) {
        console.error('Error fetching rollups:', error);
      }
    }
    const hasRollups = table.columns.some((c: any) => c.type === 'rollup');
    if (hasRollups) fetchRollups();
  }, [table.id, table.columns, rollupRefreshCounter]);

  // Lookups and rollups refresh on cell updates via refreshComputedColumns()
  // No polling needed — saves network requests

  const lookupRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rollupRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function refreshLookups() {
    const hasLookups = table.columns.some((c: any) => c.type === 'lookup');
    if (hasLookups) {
      if (lookupRefreshTimeoutRef.current) clearTimeout(lookupRefreshTimeoutRef.current);
      lookupRefreshTimeoutRef.current = setTimeout(() => { setLookupRefreshCounter(prev => prev + 1); }, 500);
    }
  }

  function refreshRollups() {
    const hasRollups = table.columns.some((c: any) => c.type === 'rollup');
    if (hasRollups) {
      if (rollupRefreshTimeoutRef.current) clearTimeout(rollupRefreshTimeoutRef.current);
      rollupRefreshTimeoutRef.current = setTimeout(() => { setRollupRefreshCounter(prev => prev + 1); }, 500);
    }
  }

  function refreshComputedColumns() {
    refreshLookups();
    refreshRollups();
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture keys when typing in inputs/textareas
      var tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setIsFindReplaceOpen(true);
        return;
      }
      // Escape — close any open panel/modal
      if (e.key === 'Escape') {
        if (isNewRowOpen) { setIsNewRowOpen(false); return; }
        if (isFindReplaceOpen) { setIsFindReplaceOpen(false); return; }
        if (showTableMenu) { setShowTableMenu(false); return; }
        if (showFieldsMenu) { setShowFieldsMenu(false); return; }
        if (isActivityOpen) { setIsActivityOpen(false); return; }
        return;
      }
      if (isViewer) return;
      // Ctrl+N — new row
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setIsNewRowOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const action = undo();
        if (action) {
          setRowOrder(prevRows => prevRows.map(row => row.id === action.rowId ? { ...row, data: { ...row.data, [action.columnId]: action.oldValue } } : row));
          fetch(`/api/tables/${table.id}/rows/${action.rowId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId: action.columnId, value: action.oldValue }) });
          if (wsSendRef.current) wsSendRef.current({ type: 'cell-update', rowId: action.rowId, columnId: action.columnId, value: action.oldValue });
          refreshComputedColumns();
        }
      }
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        const action = redo();
        if (action) {
          setRowOrder(prevRows => prevRows.map(row => row.id === action.rowId ? { ...row, data: { ...row.data, [action.columnId]: action.newValue } } : row));
          fetch(`/api/tables/${table.id}/rows/${action.rowId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId: action.columnId, value: action.newValue }) });
          if (wsSendRef.current) wsSendRef.current({ type: 'cell-update', rowId: action.rowId, columnId: action.columnId, value: action.newValue });
          refreshComputedColumns();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, table.id, isViewer]);

  function toggleColumn(columnId: string) {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId); else next.add(columnId);
      return next;
    });
  }

  function showAllColumns() { setHiddenColumns(new Set()); }
  function hideAllColumns() { setHiddenColumns(new Set(table.columns.map((c: any) => c.id))); }

  function handleSummaryChange(columnId: string, type: string) {
    setSummaryConfig(prev => ({ ...prev, [columnId]: type }));
  }

  function handleCellUpdate(rowId: string, columnId: string, value: any) {
    if (isViewer) return;
    const row = rowOrder.find(r => r.id === rowId);
    const oldValue = row?.data?.[columnId];
    recordAction({ cellId: `${rowId}-${columnId}`, rowId, columnId, oldValue, newValue: value });
    setRowOrder(prevRows => prevRows.map(r => r.id === rowId ? { ...r, data: { ...r.data, [columnId]: value } } : r));
    refreshComputedColumns();
  }

  async function handleKanbanCardMove(rowId: string, newValue: string) {
    if (!canEdit) return;
    const kanbanColumnId = currentView?.config?.kanbanColumnId;
    if (!kanbanColumnId) return;
    setRowOrder(prevRows => prevRows.map(r => r.id === rowId ? { ...r, data: { ...r.data, [kanbanColumnId]: newValue } } : r));
    await fetch(`/api/tables/${table.id}/rows/${rowId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId: kanbanColumnId, value: newValue }) });
    if (wsSendRef.current) wsSendRef.current({ type: 'cell-update', rowId, columnId: kanbanColumnId, value: newValue });
  }

  async function handleCalendarEventMove(rowId: string, newDate: string) {
    if (!canEdit) return;
    const calendarColumnId = currentView?.config?.calendarDateColumnId;
    if (!calendarColumnId) return;
    setRowOrder(prevRows => prevRows.map(r => r.id === rowId ? { ...r, data: { ...r.data, [calendarColumnId]: newDate } } : r));
    await fetch(`/api/tables/${table.id}/rows/${rowId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId: calendarColumnId, value: newDate }) });
    if (wsSendRef.current) wsSendRef.current({ type: 'cell-update', rowId, columnId: calendarColumnId, value: newDate });
  }

  async function handleReplace(rowId: string, columnId: string, newValue: string) {
    if (!canEdit) return;
    setRowOrder(prevRows => prevRows.map(r => r.id === rowId ? { ...r, data: { ...r.data, [columnId]: newValue } } : r));
    await fetch(`/api/tables/${table.id}/rows/${rowId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId, value: newValue }) });
    if (wsSendRef.current) wsSendRef.current({ type: 'cell-update', rowId, columnId, value: newValue });
  }

  async function handleReplaceAll(matches: Match[], findValue: string, replaceValue: string, matchCase: boolean) {
    if (!canEdit) return;
    const updates: { rowId: string; columnId: string; value: string }[] = [];
    matches.forEach((match) => {
      const newValue = match.value.replace(new RegExp(findValue, matchCase ? 'g' : 'gi'), replaceValue);
      updates.push({ rowId: match.rowId, columnId: match.columnId, value: newValue });
    });
    setRowOrder(prevRows => prevRows.map(row => {
      const rowUpdates = updates.filter(u => u.rowId === row.id);
      if (rowUpdates.length === 0) return row;
      const newData = { ...row.data };
      rowUpdates.forEach(u => { newData[u.columnId] = u.value; });
      return { ...row, data: newData };
    }));
    await Promise.all(updates.map(({ rowId, columnId, value }) => fetch(`/api/tables/${table.id}/rows/${rowId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId, value }) })));
    if (wsSendRef.current) updates.forEach(({ rowId, columnId, value }) => { wsSendRef.current!({ type: 'cell-update', rowId, columnId, value }); });
  }

  function handleRowLockChange(rowId: string, locked: boolean) {
    setRowOrder(prevRows => prevRows.map(r => r.id === rowId ? { ...r, isLocked: locked } : r));
    if (wsSendRef.current) wsSendRef.current({ type: 'row-lock', rowId, isLocked: locked });
  }

  async function handleSync() {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncMessage('');
    try {
      const res = await fetch(`/api/tables/${table.id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage(data.message || 'Sync complete');
        setTimeout(() => setSyncMessage(''), 5000);
        window.location.reload();
      } else {
        setSyncMessage('Sync failed: ' + (data.error || 'Unknown error'));
        setTimeout(() => setSyncMessage(''), 5000);
      }
    } catch {
      setSyncMessage('Sync failed');
      setTimeout(() => setSyncMessage(''), 5000);
    } finally {
      setIsSyncing(false);
    }
  }

  function handleNewRowCreated(newRow: any) {
    setRowOrder(prev => [...prev, { ...newRow, data: newRow.data || {} }].sort((a, b) => a.position - b.position));
    if (wsSendRef.current) wsSendRef.current({ type: 'row-inserted', row: newRow });
    refreshComputedColumns();
  }

  function handlePermissionsChanged() {
    // Reload to get fresh permission level from server
    window.location.reload();
  }

  function handleNavigateToCell(rowId: string, columnId: string) {
    setHighlightedCell({ rowId, columnId });
    setTimeout(() => {
      const cell = document.querySelector(`[data-cell-id="${rowId}-${columnId}"]`);
      cell?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  const handleWebSocketSend = useCallback((sendFn: (message: any) => void) => { wsSendRef.current = sendFn; }, []);

  // Listen for permission changes via WebSocket and reload
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'permissions-changed' && msg.tableId === table.id) {
          // Small delay to let the server finish, then reload to get fresh permissions
          setTimeout(() => window.location.reload(), 500);
        }
      } catch {}
    }
    // We can't easily hook into the existing WS from here, so we'll handle it in TableWithSelection
    // For now, the wsBroadcast will trigger a reload for all connected clients
  }, [table.id]);

  // --- Unsaved Changes Detection ---
  const savedHiddenColumns = new Set(currentView?.config?.hiddenColumns || []);
  const savedFilters = currentView?.config?.filters || [];
  const savedSort = currentView?.config?.sorts?.[0] || null;
  const savedColumnOrder = currentView?.config?.columnOrder as string[] | undefined;
  const savedSummaryConfig = currentView?.config?.summaryConfig || {};

  const hiddenColumnsChanged = hiddenColumns.size !== savedHiddenColumns.size || [...hiddenColumns].some(id => !savedHiddenColumns.has(id));
  const filtersChanged = Object.keys(filters).length !== savedFilters.length || savedFilters.some((sf: any) => !filters[sf.columnId]);
  const sortChanged = sortConfig?.columnId !== savedSort?.columnId || sortConfig?.direction !== savedSort?.direction;
  const referenceOrder = savedColumnOrder?.length ? savedColumnOrder : baseColumnOrder.map((c: any) => c.id);
  const columnOrderChanged = columnOrder.length !== referenceOrder.length || columnOrder.some((col: any, i: number) => col.id !== referenceOrder[i]);
  const summaryChanged = JSON.stringify(summaryConfig) !== JSON.stringify(savedSummaryConfig);
  const savedFormattingRules = currentView?.config?.formattingRules || [];
  const formattingChanged = JSON.stringify(formattingRules) !== JSON.stringify(savedFormattingRules);
  const hasUnsavedChanges = hiddenColumnsChanged || filtersChanged || sortChanged || columnOrderChanged || summaryChanged || formattingChanged;

  const saveView = useCallback(async () => {
    if (!currentView) return;
    setIsSaving(true);
    try {
      const filterArray = Object.entries(filters).map(([columnId, filter]) => ({ columnId, ...filter }));
      const columnOrderIds = columnOrder.map((c: any) => c.id);
      await fetch(`/api/tables/${table.id}/views/${currentView.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { filters: filterArray, sorts: sortConfig ? [sortConfig] : [], hiddenColumns: Array.from(hiddenColumns), columnOrder: columnOrderIds, summaryConfig, formattingRules } }),
      });
      if (currentView?.config) {
        currentView.config.hiddenColumns = Array.from(hiddenColumns);
        currentView.config.filters = filterArray;
        currentView.config.sorts = sortConfig ? [sortConfig] : [];
        currentView.config.columnOrder = columnOrderIds;
        currentView.config.summaryConfig = summaryConfig;
        currentView.config.formattingRules = formattingRules;
      } else {
        currentView.config = { hiddenColumns: Array.from(hiddenColumns), filters: filterArray, sorts: sortConfig ? [sortConfig] : [], columnOrder: columnOrderIds, summaryConfig, formattingRules };
      }
    } finally {
      setIsSaving(false);
    }
  }, [currentView, filters, sortConfig, hiddenColumns, columnOrder, summaryConfig, table.id]);

  const hiddenCount = hiddenColumns.size;
  const visibleColumns = columnOrder.filter((col: any) => !hiddenColumns.has(col.id));

  // Undo/Redo handler helper
  function handleUndo() {
    const action = undo();
    if (action) {
      setRowOrder(prevRows => prevRows.map(row => row.id === action.rowId ? { ...row, data: { ...row.data, [action.columnId]: action.oldValue } } : row));
      fetch(`/api/tables/${table.id}/rows/${action.rowId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId: action.columnId, value: action.oldValue }) });
      if (wsSendRef.current) wsSendRef.current({ type: 'cell-update', rowId: action.rowId, columnId: action.columnId, value: action.oldValue });
      refreshComputedColumns();
    }
  }

  function handleRedo() {
    const action = redo();
    if (action) {
      setRowOrder(prevRows => prevRows.map(row => row.id === action.rowId ? { ...row, data: { ...row.data, [action.columnId]: action.newValue } } : row));
      fetch(`/api/tables/${table.id}/rows/${action.rowId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId: action.columnId, value: action.newValue }) });
      if (wsSendRef.current) wsSendRef.current({ type: 'cell-update', rowId: action.rowId, columnId: action.columnId, value: action.newValue });
      refreshComputedColumns();
    }
  }

  async function handleInsertRow(where: 'above' | 'below' | 'top' | 'bottom', referenceRowId?: string) {
    let insertPosition = 0;

    if (where === 'top') {
      insertPosition = 0;
    } else if (where === 'bottom') {
      const maxPos = rowOrder.length > 0 ? Math.max(...rowOrder.map(r => r.position)) : -1;
      insertPosition = maxPos + 1;
    } else if (referenceRowId) {
      const refRow = rowOrder.find(r => r.id === referenceRowId);
      if (!refRow) return;
      insertPosition = where === 'above' ? refRow.position : refRow.position + 1;
    }

    try {
      const res = await fetch(`/api/tables/${table.id}/rows/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: insertPosition }),
      });
      if (res.ok) {
        const newRow = await res.json();
        // Insert into local state
        setRowOrder(prev => {
          const updated = prev.map(r => r.position >= insertPosition ? { ...r, position: r.position + 1 } : r);
          return [...updated, { ...newRow, data: newRow.data || {} }].sort((a, b) => a.position - b.position);
        });
        // Broadcast via WebSocket
        if (wsSendRef.current) {
          wsSendRef.current({ type: 'row-inserted', row: newRow });
        }
      }
    } catch (err) {
      console.error('Failed to insert row:', err);
    }
  }

  return (
    <>
      {/* Unified Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5">
        <div className="flex items-center justify-between">
          {/* Left: Table dropdown + Views + Fields */}
          <div className="flex items-center space-x-3">
            {/* Table Name Dropdown */}
            <div className="relative" ref={tableMenuRef}>
              <button
                onClick={() => setShowTableMenu(!showTableMenu)}
                className="flex items-center space-x-2 hover:bg-gray-100 rounded-lg px-2 py-1.5 transition-colors"
              >
                <span className="text-xl">{table.icon || '📊'}</span>
                <h1 className="text-lg font-bold text-gray-900">{table.name}</h1>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${showTableMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {isViewer && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">View Only</span>
                )}
                {!isViewer && !isAdminUser && canEdit && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Editor</span>
                )}
              </button>

              {showTableMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowTableMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    {table.description && (
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-xs text-gray-500">{table.description}</p>
                      </div>
                    )}

                    {isAdminUser && (
                      <>
                        {(table.enabledFeatures as string[] || []).includes('forms') && (
                        <button onClick={() => { setShowTableMenu(false); setIsFormsOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">📋</span><span>Forms</span>
                        </button>
                        )}
                        {(table.enabledFeatures as string[] || []).includes('charts') && (
                        <button onClick={() => { setShowTableMenu(false); setIsChartsOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">📊</span><span>Charts</span>
                        </button>
                        )}
                        {(table.enabledFeatures as string[] || []).includes('approvals') && (
                        <button onClick={() => { setShowTableMenu(false); setIsApprovalsOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">✅</span><span>Approvals</span>
                        </button>
                        )}
                        {(table.enabledFeatures as string[] || []).includes('record_export') && (
						<button onClick={() => { setShowTableMenu(false); setIsRecordExportOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">📄</span><span>Record Export</span>
                        </button>
                        )}
                        <button onClick={() => { setShowTableMenu(false); setIsNotifSettingsOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">🔔</span><span>Notifications</span>
                        </button>
                        <button onClick={() => { setShowTableMenu(false); setIsFormattingOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">🎨</span><span>Conditional Formatting</span>
                        </button>
						{(table.enabledFeatures as string[] || []).includes('data_connectors') && (
                        <button onClick={() => { setShowTableMenu(false); setIsConnectorsOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">🔗</span><span>Data Connectors</span>
                        </button>
                        )}
                        {(table.enabledFeatures as string[] || []).includes('api_access') && (
                        <button onClick={() => { setShowTableMenu(false); setIsApiAccessOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">🔌</span><span>API Access</span>
                        </button>
                        )}
                        <button onClick={() => { setShowTableMenu(false); setIsActivityOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">🕐</span><span>Activity</span>
                        </button>
                        <button onClick={() => { setShowTableMenu(false); setIsShareModalOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">🔒</span><span>Share & Permissions</span>
                        </button>
                        <div className="border-t border-gray-100 my-1" />
                        <button onClick={() => { setShowTableMenu(false); setIsEditingTable(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                          <span className="text-base">⚙️</span><span>Edit Table Info</span>
                        </button>
                      </>
                    )}

                    {!isAdminUser && (
                      <button onClick={() => { setShowTableMenu(false); setIsActivityOpen(true); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3">
                        <span className="text-base">🕐</span><span>Activity</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="w-px h-6 bg-gray-200" />

            {/* View Switcher */}
            <ViewSwitcher
              tableId={table.id}
              views={table.views || []}
              currentViewId={currentViewId}
              hasUnsavedChanges={hasUnsavedChanges}
              onSaveView={saveView}
              columns={table.columns}
            />

            <div className="w-px h-6 bg-gray-200" />

            {/* Fields Toggle */}
            <div className="relative">
              <button
                onClick={() => setShowFieldsMenu(!showFieldsMenu)}
                className={`flex items-center space-x-2 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                  hiddenCount > 0 ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                <span>Fields</span>
                {hiddenCount > 0 && (
                  <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5">{hiddenCount} hidden</span>
                )}
              </button>

              {showFieldsMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowFieldsMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-200 w-64">
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900">Fields</span>
                      <div className="flex items-center space-x-2">
                        <button onClick={showAllColumns} className="text-xs text-blue-600 hover:text-blue-800">Show all</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={hideAllColumns} className="text-xs text-blue-600 hover:text-blue-800">Hide all</button>
                      </div>
                    </div>
                    <div className="py-2 max-h-80 overflow-y-auto">
                      {/* System columns section */}
                      <div className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">System Fields</span>
                      </div>
                      {systemColumns.map((column: any) => {
                        const isHidden = hiddenColumns.has(column.id);
                        return (
                          <div key={column.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => toggleColumn(column.id)}>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-400">{getSystemColumnIcon(column.type)}</span>
                              <span className={`text-sm ${isHidden ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>{column.name}</span>
                              <span className="text-[8px] bg-gray-100 dark:bg-gray-700 text-gray-400 px-1 rounded">SYS</span>
                            </div>
                            <div className={`relative w-8 h-4 rounded-full transition-colors ${isHidden ? 'bg-gray-200 dark:bg-gray-600' : 'bg-blue-600'}`}>
                              <div className={`absolute top-0 w-4 h-4 bg-white rounded-full shadow transition-transform ${isHidden ? 'translate-x-0' : 'translate-x-4'}`} />
                            </div>
                          </div>
                        );
                      })}
                      {/* Regular columns section */}
                      <div className="px-4 py-1.5 border-b border-t border-gray-100 dark:border-gray-700 mt-1">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Table Fields</span>
                      </div>
                      {columnOrder.filter((c: any) => !c.isSystem).map((column: any) => {
                        const isHidden = hiddenColumns.has(column.id);
                        return (
                          <div key={column.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => toggleColumn(column.id)}>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-500">{getColumnTypeIcon(column.type)}</span>
                              <span className={`text-sm ${isHidden ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>{column.name}</span>
                            </div>
                            <div className={`relative w-8 h-4 rounded-full transition-colors ${isHidden ? 'bg-gray-200 dark:bg-gray-600' : 'bg-blue-600'}`}>
                              <div className={`absolute top-0 w-4 h-4 bg-white rounded-full shadow transition-transform ${isHidden ? 'translate-x-0' : 'translate-x-4'}`} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hiddenColumnsChanged && (
                      <div className="px-4 py-3 border-t border-gray-200">
                        <button onClick={() => { setHiddenColumns(new Set(currentView?.config?.hiddenColumns || [])); setShowFieldsMenu(false); }} className="text-xs text-gray-500 hover:text-gray-700 w-full text-center">
                          ↩ Revert to saved
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: Undo/Redo + Import + Add Column + Add Row */}
          <div className="flex items-center space-x-2">
            {canEdit && (
              <div className="flex items-center space-x-1 border border-gray-300 rounded-lg overflow-hidden">
                <button onClick={handleUndo} disabled={!canUndo} className={`px-3 py-1.5 text-sm transition-colors ${canUndo ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`} title="Undo (Ctrl+Z)">↶</button>
                <div className="w-px h-6 bg-gray-300" />
                <button onClick={handleRedo} disabled={!canRedo} className={`px-3 py-1.5 text-sm transition-colors ${canRedo ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`} title="Redo (Ctrl+Y)">↷</button>
              </div>
            )}

            {isAdminUser && <ImportCSVButton tableId={table.id} columns={table.columns} />}
            {isAdminUser && <AddColumnModal tableId={table.id} />}

            {canEdit && (
              <button
                onClick={() => setIsNewRowOpen(true)}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <span>New</span>
              </button>
            )}
            {table.isSheetBacked && canEdit && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center space-x-1.5"
              >
                <svg className={'w-3.5 h-3.5 ' + (isSyncing ? 'animate-spin' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
              </button>
            )}
            {syncMessage && (
              <span className="text-[10px] text-green-600 ml-2">{syncMessage}</span>
            )}
          </div>
        </div>
      </div>

      {/* Table / Kanban / Calendar / Gallery */}
      {currentView?.type === 'kanban' ? (
        <KanbanBoard rows={rowOrder} columns={table.columns} kanbanColumnId={currentView.config?.kanbanColumnId} tableId={table.id} onCardMove={handleKanbanCardMove} onCardClick={(row) => setExpandedRow(row)} />
      ) : currentView?.type === 'calendar' ? (
        <CalendarBoard rows={rowOrder} columns={table.columns} dateColumnId={currentView.config?.calendarDateColumnId} tableId={table.id} onEventClick={(row) => setExpandedRow(row)} onEventMove={handleCalendarEventMove} bookingConfig={((table as any).enabledFeatures as string[] || []).includes('booking') ? ((table as any).notificationTargets as any)?.__bookingConfig || null : null} />
      ) : currentView?.type === 'gallery' ? (
        <GalleryBoard rows={rowOrder} columns={table.columns} tableId={table.id} onCardClick={(row) => setExpandedRow(row)} />
      ) : currentView?.type === 'gantt' ? (
        <GanttChart rows={rowOrder} columns={table.columns} startColumnId={currentView.config?.ganttStartColumnId} endColumnId={currentView.config?.ganttEndColumnId || undefined} tableId={table.id} onBarClick={(row) => setExpandedRow(row)} />
      ) : (
        <TableWithSelection
          table={{ ...table, rows: rowOrder }}
          currentView={currentView}
          hiddenColumns={hiddenColumns}
          columnOrder={columnOrder}
          onColumnReorder={setColumnOrder}
          filters={filters}
          sortConfig={sortConfig}
          onFiltersChange={setFilters}
          onSortChange={setSortConfig}
          summaryConfig={summaryConfig}
          onSummaryChange={handleSummaryChange}
          isSaving={isSaving}
          session={session}
          onCellUpdate={handleCellUpdate}
          onWebSocketSend={handleWebSocketSend}
          highlightedCell={highlightedCell}
          lookupData={lookupData}
          rollupData={rollupData}
          onRemoteCellUpdate={refreshComputedColumns}
          readOnly={isViewer}
          columnPermissions={colPerms}
          isAdmin={isAdminUser}
          onColumnPermissions={(column: any) => setPermissionsColumn(column)}
          onRowLockChange={handleRowLockChange}
          onInsertRow={handleInsertRow}
          formattingRules={formattingRules}
          onPermissionsChanged={handlePermissionsChanged}
        />
      )}

      {expandedRow && (
        <RowExpandPanel
          row={expandedRow}
          rows={rowOrder}
          columns={table.columns}
          tableId={table.id}
          onClose={() => setExpandedRow(null)}
          onNavigate={(row) => setExpandedRow(row)}
          readOnly={isViewer}
          permissionLevel={permissionLevel || undefined}
          session={session}
          onRowLockChange={handleRowLockChange}
          wsSend={wsSendRef.current || undefined}
		  bookingConfig={((table as any).enabledFeatures as string[] || []).includes('booking') ? ((table as any).notificationTargets as any)?.__bookingConfig || null : null}
        />
      )}

      <ActivityPanel tableId={table.id} isOpen={isActivityOpen} onClose={() => setIsActivityOpen(false)} />

      {isAdminUser && <EditTableModal table={table} isOpen={isEditingTable} onClose={() => setIsEditingTable(false)} />}
      {isAdminUser && <ShareTableModal tableId={table.id} workspaceId={table.workspace?.id || null} workspaceName={table.workspace?.name || null} isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} />}

      <ColumnPermissionsModal
        tableId={table.id}
        column={permissionsColumn}
        isOpen={!!permissionsColumn}
        onClose={() => setPermissionsColumn(null)}
        onUpdated={refreshColumnPermissions}
        wsSend={wsSendRef.current || undefined}
      />

      {isAdminUser && <FormsManager tableId={table.id} columns={table.columns} isOpen={isFormsOpen} onClose={() => setIsFormsOpen(false)} />}
      {isAdminUser && <ChartsManager tableId={table.id} columns={table.columns} rows={rowOrder} isOpen={isChartsOpen} onClose={() => setIsChartsOpen(false)} />}
	  {isAdminUser && <RecordExportManager tableId={table.id} columns={table.columns} isOpen={isRecordExportOpen} onClose={() => setIsRecordExportOpen(false)} />}
      {isAdminUser && <ApprovalsManager tableId={table.id} columns={table.columns} isOpen={isApprovalsOpen} onClose={() => setIsApprovalsOpen(false)} />}
      <NotificationSettingsModal tableId={table.id} isOpen={isNotifSettingsOpen} onClose={() => setIsNotifSettingsOpen(false)} isAdmin={isAdminUser} />
      <ConditionalFormattingModal
        columns={table.columns}
        rules={formattingRules}
        isOpen={isFormattingOpen}
        onClose={() => setIsFormattingOpen(false)}
        onSave={(rules) => setFormattingRules(rules)}
      />
	  {isAdminUser && <DataConnectorPanel tableId={table.id} columns={table.columns} isOpen={isConnectorsOpen} onClose={() => setIsConnectorsOpen(false)} />}
      {isAdminUser && <ApiAccessPanel tableId={table.id} tableName={table.name} isOpen={isApiAccessOpen} onClose={() => setIsApiAccessOpen(false)} />}
      <NewRowPanel
        tableId={table.id}
        columns={table.columns}
        isOpen={isNewRowOpen}
        onClose={() => setIsNewRowOpen(false)}
        onRowCreated={handleNewRowCreated}
      />

      <FindReplaceModal
        isOpen={isFindReplaceOpen}
        onClose={() => { setIsFindReplaceOpen(false); setHighlightedCell(null); }}
        rows={rowOrder}
        columns={visibleColumns}
        onReplace={handleReplace}
        onReplaceAll={handleReplaceAll}
        onNavigate={handleNavigateToCell}
        readOnly={isViewer}
      />
    </>
  );
}

function getColumnTypeIcon(type: string): string {
  const icons: { [key: string]: string } = {
    text: '𝐓', number: '#', currency: '$', percent: '%',
    date: '📅', datetime: '🕐', email: '✉', phone: '📞',
    url: '🔗', select: '◉', multiselect: '◈', checkbox: '☑',
    rating: '★', textarea: '¶', attachment: '📎', formula: 'ƒ',
    lookup: '👀', linked_record: '🔗', rollup: '📊',
  };
  return icons[type] || '𝐓';
}

function getSystemColumnIcon(type: string): string {
  const icons: { [key: string]: string } = {
    system_row_number: '🔢',
    system_datetime: '🕐',
    system_user: '👤',
    system_id: '🆔',
  };
  return icons[type] || '⚙️';
}