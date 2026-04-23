'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { EditableCell } from './EditableCell';
import { BulkActionsBar } from './BulkActionsBar';
import { ColumnHeaderMenu } from './ColumnHeaderMenu';
import { EditColumnModal } from './EditColumnModal';
import { ExportMenu } from './ExportMenu';
import { RowContextMenu } from './RowContextMenu';
import { RowExpandPanel } from './RowExpandPanel';
import { ResizableColumn } from './ResizableColumn';
import { DraggableColumn } from './DraggableColumn';
import { SummaryRow } from './SummaryRow';
import { CellPresence, getUserColor } from './CellPresence';
import { useWebSocket } from '@/lib/useWebSocket';
import { usePresenceStore } from '@/lib/presenceStore';
import { evaluateFormattingRules } from './ConditionalFormattingModal';

export function TableWithSelection({ 
  table, 
  currentView,
  hiddenColumns = new Set(),
  columnOrder,
  onColumnReorder,
  filters,
  sortConfig,
  onFiltersChange,
  onSortChange,
  summaryConfig = {},
  onSummaryChange,
  isSaving = false,
  session,
  onCellUpdate,
  onWebSocketSend,
  highlightedCell,
  lookupData = {},
  rollupData = {},
  onRemoteCellUpdate,
  readOnly = false,
  columnPermissions = {},
  isAdmin = false,
  onColumnPermissions,
  onRowLockChange: onRowLockChangeProp,
  onInsertRow,
  formattingRules,
}: {
  table: any;
  currentView?: any;
  hiddenColumns?: Set<string>;
  columnOrder: any[];
  onColumnReorder: (newOrder: any[]) => void;
  filters: { [columnId: string]: any };
  sortConfig: { columnId: string; direction: 'asc' | 'desc' } | null;
  onFiltersChange: (filters: { [columnId: string]: any }) => void;
  onSortChange: (sort: { columnId: string; direction: 'asc' | 'desc' } | null) => void;
  summaryConfig?: { [columnId: string]: any };
  onSummaryChange: (columnId: string, type: any) => void;
  isSaving?: boolean;
  session: any;
  onCellUpdate?: (rowId: string, columnId: string, value: any) => void;
  onWebSocketSend?: (sendFn: (message: any) => void) => void;
  highlightedCell?: { rowId: string; columnId: string } | null;
  lookupData?: Record<string, Record<string, any[]>>;
  rollupData?: Record<string, Record<string, any>>;
  onRemoteCellUpdate?: () => void;
  readOnly?: boolean;
  columnPermissions?: Record<string, { canView: boolean; canEdit: boolean }>;
  isAdmin?: boolean;
  onColumnPermissions?: (column: any) => void;
  onRowLockChange?: (rowId: string, locked: boolean) => void;
  onInsertRow?: (position: 'above' | 'below' | 'top' | 'bottom', referenceRowId?: string) => void;
  formattingRules?: any[];
  onPermissionsChanged?: () => void;
}) {
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [editingColumn, setEditingColumn] = useState<any>(null);
  const [expandedRow, setExpandedRow] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ row: any; x: number; y: number } | null>(null);
  const [rowEditors, setRowEditors] = useState<Record<string, { userId: string; userName: string; color: string }>>({});
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);

  const { isConnected, send, subscribe } = useWebSocket(table.id, session);
  const { setPresence, removePresence, removeUserPresence } = usePresenceStore();

  const [rowOrder, setRowOrder] = useState<any[]>(
    [...table.rows].sort((a: any, b: any) => a.position - b.position)
  );
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [dragOverSide, setDragOverSide] = useState<'top' | 'bottom' | null>(null);
  const draggingRowId = useRef<string | null>(null);

  useEffect(() => {
    setRowOrder([...table.rows].sort((a: any, b: any) => a.position - b.position));
  }, [table.rows]);

  useEffect(() => {
    if (onWebSocketSend) {
      onWebSocketSend(send);
    }
  }, [send, onWebSocketSend]);

  useEffect(() => {
    if (!session?.user) return;

    const unsubscribe = subscribe((message) => {
      switch (message.type) {
        case 'cell-focus':
          setPresence(message.cellId, {
            userId: message.userId,
            userName: message.userName,
            color: message.color,
          });
          break;

        case 'cell-blur':
          removePresence(message.cellId);
          break;

        case 'cell-update':
          console.log('🔄 WS cell-update received:', message);
          setRowOrder(prevRows => 
            prevRows.map(row => 
              row.id === message.rowId
                ? { ...row, data: { ...row.data, [message.columnId]: message.value } }
                : row
            )
          );
          console.log('🔄 onRemoteCellUpdate exists?', !!onRemoteCellUpdate);
          if (onRemoteCellUpdate) onRemoteCellUpdate();
          break;

        case 'row-lock':
          setRowOrder(prevRows =>
            prevRows.map(r =>
              r.id === message.rowId ? { ...r, isLocked: message.isLocked } : r
            )
          );
          break;

        case 'form-submission':
          // New row from public form — add it live
          setRowOrder(prevRows => [...prevRows, message.row]);
          break;

        case 'row-editing':
          if (message.userId !== session?.user?.id) {
            setRowEditors(prev => ({ ...prev, [message.rowId]: { userId: message.userId, userName: message.userName, color: message.color } }));
          }
          break;

        case 'row-editing-done':
          setRowEditors(prev => { const next = { ...prev }; delete next[message.rowId]; return next; });
          break;

        case 'row-inserted':
          // Another user inserted a row
          setRowOrder(prevRows => {
            const exists = prevRows.some(r => r.id === message.row.id);
            if (exists) return prevRows;
            const updated = prevRows.map(r => r.position >= message.row.position ? { ...r, position: r.position + 1 } : r);
            return [...updated, { ...message.row, data: message.row.data || {} }].sort((a, b) => a.position - b.position);
          });
          break;
		  
		  case 'column-permissions-changed':
          // Another user changed column permissions — reload to get new perms
          window.location.reload();
          break;

        case 'permissions-changed':
          // Table shares were added/updated/removed — reload to get fresh permissions
          window.location.reload();
          break;

        case 'user-disconnected':
          removeUserPresence(message.userId);
          break;
      }
    });

    return unsubscribe;
  }, [subscribe, session?.user, setPresence, removePresence, removeUserPresence, onRemoteCellUpdate]);
  
  // Scroll focused cell into view
  useEffect(() => {
    if (!focusedCell) return;
    var row = finalRows[focusedCell.rowIndex];
    var col = visibleColumns[focusedCell.colIndex];
    if (row && col) {
      var cellEl = document.querySelector('[data-cell-id="' + row.id + '-' + col.id + '"]');
      if (cellEl) cellEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [focusedCell]);

  function toggleRow(rowId: string) {
    setSelectedRows(prev => 
      prev.includes(rowId) 
        ? prev.filter(id => id !== rowId)
        : [...prev, rowId]
    );
  }

  function toggleAll() {
    if (selectedRows.length === finalRows.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(finalRows.map((row: any) => row.id));
    }
  }

  function clearSelection() {
    setSelectedRows([]);
  }

  function handleFilterChange(columnId: string, filter: any) {
    const newFilters = { ...filters };
    if (Object.keys(filter).length === 0) {
      delete newFilters[columnId];
    } else {
      newFilters[columnId] = filter;
    }
    onFiltersChange(newFilters);
  }

  function handleSort(columnId: string) {
    if (sortConfig?.columnId === columnId) {
      if (sortConfig.direction === 'asc') {
        onSortChange({ columnId, direction: 'desc' });
      } else {
        onSortChange(null);
      }
    } else {
      onSortChange({ columnId, direction: 'asc' });
    }
  }

  function clearAll() {
    onFiltersChange({});
    onSortChange(null);
    setSearchQuery('');
  }

  function handleContextMenu(event: React.MouseEvent, row: any) {
    event.preventDefault();
    setContextMenu({
      row,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleCellUpdateInternal(rowId: string, columnId: string, value: any) {
    if (onCellUpdate) {
      onCellUpdate(rowId, columnId, value);
    }
    
    send({
      type: 'cell-update',
      rowId,
      columnId,
      value,
    } as any);
  }

  function handleRowDragStart(e: React.DragEvent, rowId: string) {
    draggingRowId.current = rowId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', rowId);

    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position: fixed;
      top: -1000px;
      background: #3B82F6;
      color: white;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    `;
    ghost.textContent = 'Moving row...';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }

  function handleRowDragOver(e: React.DragEvent, rowId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    setDragOverRowId(rowId);
    setDragOverSide(e.clientY < midpoint ? 'top' : 'bottom');
  }

  function handleRowDragLeave() {
    setDragOverRowId(null);
    setDragOverSide(null);
  }

  function handleRowDragEnd() {
    draggingRowId.current = null;
    setDragOverRowId(null);
    setDragOverSide(null);
  }

  async function handleRowDrop(e: React.DragEvent, targetRowId: string) {
    e.preventDefault();
    const draggedId = draggingRowId.current;
    setDragOverRowId(null);
    setDragOverSide(null);

    if (!draggedId || draggedId === targetRowId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const dropSide = e.clientY < midpoint ? 'top' : 'bottom';

    const rows = [...finalRows];
    const fromIndex = rows.findIndex(r => r.id === draggedId);
    const toIndex = rows.findIndex(r => r.id === targetRowId);

    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = rows.splice(fromIndex, 1);
    const insertAt = dropSide === 'top' ? toIndex : toIndex + 1;
    const adjustedIndex = fromIndex < toIndex ? insertAt - 1 : insertAt;
    rows.splice(adjustedIndex, 0, moved);

    const updatedRows = rows.map((row, index) => ({ ...row, position: index }));
    setRowOrder(updatedRows);

    try {
      await fetch(`/api/tables/${table.id}/rows/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: updatedRows.map(r => ({ id: r.id, position: r.position })),
        }),
      });
    } catch (error) {
      console.error('Failed to save row order:', error);
    }
  }

  const searchedRows = useMemo(() => {
    if (!searchQuery.trim()) return rowOrder;
    const query = searchQuery.toLowerCase();
    return rowOrder.filter((row: any) => {
      return Object.values(row.data).some((value: any) => {
        if (!value) return false;
        return String(value).toLowerCase().includes(query);
      });
    });
  }, [rowOrder, searchQuery]);

  const filteredRows = useMemo(() => {
    let rows = searchedRows;

    Object.entries(filters).forEach(([columnId, filter]) => {
      if (!filter || Object.keys(filter).length === 0) return;

      rows = rows.filter((row: any) => {
        const cellValue = row.data[columnId];

        if (filter.type === 'select') {
          if (!cellValue) return false;
          if (cellValue.includes(',')) {
            const values = cellValue.split(',');
            return values.some((v: string) => filter.values.includes(v));
          }
          return filter.values.includes(cellValue);
        }

        if (filter.type === 'text') {
          if (!cellValue) return false;
          if (filter.mode === 'contains') {
            return cellValue.toLowerCase().includes(filter.value.toLowerCase());
          }
          return cellValue.toLowerCase() === filter.value.toLowerCase();
        }

        if (filter.type === 'number') {
          const numValue = parseFloat(cellValue);
          if (isNaN(numValue)) return false;
          if (filter.min && numValue < parseFloat(filter.min)) return false;
          if (filter.max && numValue > parseFloat(filter.max)) return false;
          return true;
        }

        if (filter.type === 'checkbox') {
          return cellValue === filter.value;
        }

        if (filter.type === 'empty') {
          if (filter.mode === 'empty') return !cellValue || (typeof cellValue === 'string' && !cellValue.trim());
          if (filter.mode === 'not_empty') return cellValue && (typeof cellValue !== 'string' || cellValue.trim().length > 0);
        }

        return true;
      });
    });

    return rows;
  }, [searchedRows, filters]);

  const finalRows = useMemo(() => {
    if (!sortConfig) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const aValue = a.data[sortConfig.columnId];
      const bValue = b.data[sortConfig.columnId];

      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;

      const column = table.columns.find((col: any) => col.id === sortConfig.columnId);
      const columnType = column?.type;

      if (columnType === 'number' || columnType === 'currency' || columnType === 'percent') {
        const aNum = parseFloat(aValue);
        const bNum = parseFloat(bValue);
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      if (columnType === 'date' || columnType === 'datetime') {
        const aDate = new Date(aValue).getTime();
        const bDate = new Date(bValue).getTime();
        return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
      }

      if (columnType === 'checkbox') {
        const aCheck = aValue === 'true' ? 1 : 0;
        const bCheck = bValue === 'true' ? 1 : 0;
        return sortConfig.direction === 'asc' ? aCheck - bCheck : bCheck - aCheck;
      }

      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      return sortConfig.direction === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }, [filteredRows, sortConfig, table.columns]);

  const hasActiveFilters = Object.keys(filters).length > 0;
  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasAnything = hasActiveFilters || sortConfig || hasActiveSearch;
  const canDragRows = !hasAnything && !readOnly;

  // Filter out columns the user can't view (column-level permissions)
  const visibleColumns = columnOrder.filter(
    (col: any) => {
      if (hiddenColumns.has(col.id)) return false;
      const colPerm = columnPermissions[col.id];
      if (colPerm && !colPerm.canView) return false;
      return true;
    }
  );

  function handleReorder(newVisibleCols: any[]) {
    const hiddenCols = columnOrder.filter((c: any) => hiddenColumns.has(c.id));
    onColumnReorder([...newVisibleCols, ...hiddenCols]);
  }

  const userColor = session?.user ? getUserColor(session.user.id) : '#3B82F6';

  // Broadcast row editing presence
  useEffect(() => {
    if (expandedRow && session?.user) {
      send({
        type: 'row-editing',
        rowId: expandedRow.id,
        userName: session.user.name || session.user.email || 'Someone',
        color: userColor,
      } as any);

      return () => {
        send({
          type: 'row-editing-done',
          rowId: expandedRow.id,
        } as any);
      };
    }
  }, [expandedRow?.id, session?.user, send, userColor]);

  return (
    <>
      <BulkActionsBar 
        selectedRows={selectedRows} 
        onClearSelection={clearSelection}
        tableId={table.id}
      />

      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-1.5">
        <div className="flex items-center space-x-3">
          {session?.user && (
            <div className="flex items-center space-x-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-[10px] text-gray-400">{isConnected ? 'Live' : 'Offline'}</span>
            </div>
          )}

          <div className="relative flex-1 max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="block w-full pl-8 pr-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
            />
            {hasActiveSearch && (
              <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-2 flex items-center">
                <svg className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {hasAnything && (
            <button onClick={clearAll} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              Clear all
            </button>
          )}

          <ExportMenu 
            table={table}
            filteredRows={finalRows}
            allRows={table.rows}
            selectedRows={selectedRows}
          />
        </div>
      </div>

      {hasAnything && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-1">
          <div className="flex items-center space-x-3 text-[11px] text-blue-800 dark:text-blue-300">
            <span>{finalRows.length} of {table.rows.length} rows</span>
            {hasActiveSearch && <span>• "{searchQuery}"</span>}
            {sortConfig && <span>• {table.columns.find((c: any) => c.id === sortConfig?.columnId)?.name} {sortConfig?.direction === 'asc' ? '↑' : '↓'}</span>}
            {hasActiveFilters && <span>• {Object.keys(filters).length} filter(s)</span>}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="inline-block min-w-full align-middle">
          <table className="min-w-full divide-y divide-gray-200">

            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
              <tr>
                <th className="w-16 px-2 py-1.5 text-left border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <input
                    type="checkbox"
                    checked={selectedRows.length === finalRows.length && finalRows.length > 0}
                    onChange={toggleAll}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                  />
                </th>
                {visibleColumns.map((column: any, index: number) => {
                  // System column headers — simple, no drag/resize/menu
                  if (column.isSystem) {
                    return (
                      <th
                        key={column.id}
                        className="px-6 py-1.5 text-left border-r border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/80"
                        style={{ width: `${column.width || 200}px`, minWidth: `${column.width || 200}px` }}
                      >
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] text-gray-400">{column.id === '__sys_row_number' ? '🔢' : column.id === '__sys_created_at' ? '🕐' : column.id === '__sys_updated_at' ? '🕐' : column.id === '__sys_created_by' ? '👤' : '🆔'}</span>
                          <span className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{column.name}</span>
                        </div>
                      </th>
                    );
                  }

                  const colPerm = columnPermissions[column.id];
                  const isColumnReadOnly = colPerm && !colPerm.canEdit;

                  return (
                    <DraggableColumn
                      key={column.id}
                      columnId={column.id}
                      tableId={table.id}
                      columnIndex={index}
                      totalColumns={visibleColumns.length}
                      allColumns={visibleColumns}
                      onReorder={handleReorder}
                    >
                      <ResizableColumn
                        columnId={column.id}
                        tableId={table.id}
                        initialWidth={column.width || 200}
                      >
                        <div className="flex items-center justify-between group/header">
                          <div className="flex items-center flex-1 min-w-0">
                            <span className="truncate text-xs font-medium text-gray-600 dark:text-gray-300">{column.name}</span>
                            {column.type === 'formula' && <span className="text-xs text-gray-400 ml-1">ƒ</span>}
                            {column.type === 'lookup' && <span className="text-xs text-gray-400 ml-1">👀</span>}
                            {column.type === 'rollup' && <span className="text-xs text-gray-400 ml-1">📊</span>}
                            {isColumnReadOnly && <span className="text-xs text-gray-400 ml-1" title="Read-only">🔒</span>}
                            {sortConfig?.columnId === column.id && (
                              <span className="text-blue-600 dark:text-blue-400 ml-1 flex-shrink-0 text-xs">
                                {sortConfig?.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                            {filters[column.id] && Object.keys(filters[column.id]).length > 0 && (
                              <span className="ml-1 w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
                            )}
                          </div>
                          <ColumnHeaderMenu
                            column={column}
                            tableId={table.id}
                            rows={table.rows}
                            activeFilters={filters}
                            sortConfig={sortConfig}
                            onFilterChange={handleFilterChange}
                            onSort={handleSort}
                            onEdit={() => setEditingColumn(column)}
                            showPermissions={isAdmin}
                            onPermissions={() => onColumnPermissions?.(column)}
                            readOnly={readOnly}
                          />
                        </div>
                      </ResizableColumn>
                    </DraggableColumn>
                  );
                })}
              </tr>
            </thead>

            <SummaryRow
              columns={visibleColumns}
              rows={finalRows}
              summaryConfig={summaryConfig}
              onSummaryChange={onSummaryChange}
            />

            <tbody className="bg-white divide-y divide-gray-200">
              {finalRows.length > 0 ? (
                finalRows.map((row: any, index: number) => {
                  const formatting = formattingRules?.length ? evaluateFormattingRules(formattingRules, row, table.columns) : { rowStyle: {}, cellStyles: {} };
                  const hasRowFormatting = Object.keys(formatting.rowStyle).length > 0;
                  return (
                  <tr
                    key={row.id}
                    draggable={canDragRows}
                    onDragStart={canDragRows ? (e) => handleRowDragStart(e, row.id) : undefined}
                    onDragOver={canDragRows ? (e) => handleRowDragOver(e, row.id) : undefined}
                    onDragLeave={canDragRows ? handleRowDragLeave : undefined}
                    onDragEnd={canDragRows ? handleRowDragEnd : undefined}
                    onDrop={canDragRows ? (e) => handleRowDrop(e, row.id) : undefined}
                    onContextMenu={(e) => handleContextMenu(e, row)}
                    className={`group relative ${
                      selectedRows.includes(row.id)
                        ? 'bg-blue-50'
                        : rowEditors[row.id]
                          ? ''
                          : hasRowFormatting
                            ? ''
                            : row.isLocked 
                              ? 'bg-amber-50/50'
                              : index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    } hover:bg-blue-50 ${
                      draggingRowId.current === row.id ? 'opacity-40' : 'opacity-100'
                    }`}
                    style={rowEditors[row.id] 
                      ? { backgroundColor: rowEditors[row.id].color + '15', borderLeft: `3px solid ${rowEditors[row.id].color}` }
                      : hasRowFormatting ? formatting.rowStyle : undefined
                    }
                  >
                    {dragOverRowId === row.id && dragOverSide === 'top' && (
                      <td
                        colSpan={visibleColumns.length + 1}
                        className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10 pointer-events-none"
                      />
                    )}
                    {dragOverRowId === row.id && dragOverSide === 'bottom' && (
                      <td
                        colSpan={visibleColumns.length + 1}
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10 pointer-events-none"
                      />
                    )}

                    <td className="w-20 px-3 py-4 border-r border-gray-200">
                      {rowEditors[row.id] && (
                        <div className="absolute left-0 top-0 px-2 py-0.5 text-[9px] font-medium text-white rounded-br-md z-10" style={{ backgroundColor: rowEditors[row.id].color }}>
                          {rowEditors[row.id].userName}
                        </div>
                      )}
                      <div className="flex items-center space-x-1.5">
                        {canDragRows && (
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 6a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm8-16a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4z"/>
                            </svg>
                          </div>
                        )}
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(row.id)}
                          onChange={() => toggleRow(row.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                        />
                        <button
                          onClick={() => setExpandedRow(row)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600 flex-shrink-0"
                          title="Expand row"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                          </svg>
                        </button>
                        {row.isLocked && (
                          <span className="text-amber-500 flex-shrink-0" title="Row is locked">
                            🔒
                          </span>
                        )}
                      </div>
                    </td>

                    {visibleColumns.map((column: any) => {
                      // Handle approval status column
                      if (column.type === 'approval_status') {
                        const raw = (row.data as any)[column.id];
                        let approvalData: any = null;
                        try { approvalData = raw ? JSON.parse(raw) : null; } catch { approvalData = null; }
                        
                        return (
                          <td
                            key={column.id}
                            className="px-4 py-3 text-sm border-r border-gray-200 dark:border-gray-700"
                            style={{ maxWidth: `${column.width || 220}px` }}
                          >
                            {!approvalData ? (
                              <span className="text-xs text-gray-300">—</span>
                            ) : (
                              <div className="flex items-center space-x-1">
                                {approvalData.stages?.map((stage: any) => {
                                  const stageStatus = approvalData.stageStatuses?.[String(stage.order)] || 'waiting';
                                  return (
                                    <div key={stage.order} className="flex items-center" title={`${stage.name}: ${stageStatus}`}>
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                                        stageStatus === 'approved' ? 'bg-green-100 border-green-500 text-green-700' :
                                        stageStatus === 'denied' ? 'bg-red-100 border-red-500 text-red-700' :
                                        stageStatus === 'pending' ? 'bg-yellow-100 border-yellow-500 text-yellow-700 animate-pulse' :
                                        stageStatus === 'skipped' ? 'bg-gray-100 border-gray-300 text-gray-400' :
                                        'bg-gray-50 border-gray-200 text-gray-300'
                                      }`}>
                                        {stageStatus === 'approved' ? '✓' :
                                         stageStatus === 'denied' ? '✗' :
                                         stageStatus === 'pending' ? '⏳' :
                                         stageStatus === 'skipped' ? '⏭' :
                                         '○'}
                                      </div>
                                      {stage.order < approvalData.totalStages && (
                                        <div className={`w-4 h-0.5 ${
                                          stageStatus === 'approved' ? 'bg-green-400' :
                                          stageStatus === 'denied' ? 'bg-red-400' :
                                          'bg-gray-200'
                                        }`} />
                                      )}
                                    </div>
                                  );
                                })}
                                <span className={`text-[9px] font-semibold ml-1.5 px-1.5 py-0.5 rounded-full ${
                                  approvalData.status === 'approved' ? 'bg-green-100 text-green-700' :
                                  approvalData.status === 'denied' ? 'bg-red-100 text-red-700' :
                                  approvalData.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {approvalData.status === 'in_progress' ? 'In Progress' : approvalData.status?.charAt(0).toUpperCase() + approvalData.status?.slice(1)}
                                </span>
                              </div>
                            )}
                          </td>
                        );
                      }

                      // Handle system columns
                      if (column.isSystem) {
                        let displayValue = '';
                        switch (column.id) {
                          case '__sys_row_number':
                            displayValue = String(index + 1);
                            break;
                          case '__sys_created_at':
                            displayValue = row.createdAt ? new Date(row.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
                            break;
                          case '__sys_updated_at':
                            displayValue = row.updatedAt ? new Date(row.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
                            break;
                          case '__sys_created_by':
                            displayValue = row.createdBy?.name || row.createdBy?.email || row.createdById || '';
                            break;
                          case '__sys_row_id':
                            displayValue = row.id;
                            break;
                        }
                        return (
                          <td
                            key={column.id}
                            className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/30"
                            style={{ maxWidth: `${column.width || 200}px` }}
                          >
                            <span className="truncate block text-xs font-mono">{displayValue}</span>
                          </td>
                        );
                      }

                      const cellData = (row.data as any)[column.id];
                      const cellId = `${row.id}-${column.id}`;
                      const isHighlighted = highlightedCell?.rowId === row.id && highlightedCell?.columnId === column.id;
                      
                      const cellLookupValues = column.type === 'lookup'
                        ? lookupData[column.id]?.[row.id] || []
                        : undefined;

                      const cellRollupValue = column.type === 'rollup'
                        ? rollupData[column.id]?.[row.id]
                        : undefined;

                      // Check if this column is read-only for this user
                      const colPerm = columnPermissions[column.id];
                      const isRowLocked = row.isLocked === true;
                      const isCellReadOnly = readOnly || isRowLocked || (colPerm && !colPerm.canEdit);

                      const cellFormatting = formatting.cellStyles[column.id];

                      return (
                        <td
                          key={column.id}
                          data-cell-id={cellId}
                          onClick={() => { var ri = finalRows.findIndex(function(fr) { return fr.id === row.id; }); var ci = visibleColumns.findIndex(function(vc) { return vc.id === column.id; }); setFocusedCell({ rowIndex: ri, colIndex: ci }); }}
                          onDoubleClick={() => setExpandedRow(row)}
                          className={`px-6 py-4 text-sm text-gray-900 border-r border-gray-200 overflow-hidden relative cursor-pointer hover:bg-blue-50/50 ${
                            isHighlighted ? 'ring-2 ring-yellow-400 bg-yellow-50' : ''
                          } ${focusedCell && finalRows[focusedCell.rowIndex]?.id === row.id && visibleColumns[focusedCell.colIndex]?.id === column.id ? 'ring-2 ring-blue-500 bg-blue-50/30' : ''}`}
                          style={{ maxWidth: `${column.width || 200}px`, ...cellFormatting }}
                        >
                          <CellPresence cellId={cellId} />
                          <EditableCell
                            rowId={row.id}
                            columnId={column.id}
                            columnType={column.type}
                            columnSettings={column.settings}
                            columnFormula={column.formula}
                            column={column}
                            initialValue={cellData}
                            tableId={table.id}
                            onCellUpdate={handleCellUpdateInternal}
                            onRowLockChange={(rid: string, locked: boolean) => {
                              setRowOrder(prev => prev.map(r => r.id === rid ? { ...r, isLocked: locked } : r));
                              onRowLockChangeProp?.(rid, locked);
                            }}
                            wsSend={send}
                            userColor={userColor}
                            session={session}
                            allColumns={table.columns}
                            rowData={row.data}
                            lookupValues={cellLookupValues}
                            rollupValue={cellRollupValue}
                            readOnly={true}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="px-6 py-12 text-center text-gray-400">
                    {table.rows.length === 0 && !hasAnything ? (
                      <>
                        <div className="text-4xl mb-4">📊</div>
                        <p className="text-lg font-medium text-gray-900 mb-2">No rows yet</p>
                        <p className="text-sm text-gray-500">Click "Add Row" to get started</p>
                      </>
                    ) : (
                      <>
                        <div className="text-4xl mb-4">🔍</div>
                        <p className="text-lg font-medium text-gray-900 mb-2">
                          {hasActiveSearch ? 'No results found' : 'No matching rows'}
                        </p>
                        <p className="text-sm text-gray-500 mb-4">
                          {hasActiveSearch 
                            ? `No rows match "${searchQuery}"` 
                            : 'Try adjusting your filters'}
                        </p>
                        <button
                          onClick={clearAll}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Clear all
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>

          </table>
        </div>
      </div>

      {expandedRow && (
        <RowExpandPanel
          row={rowOrder.find(r => r.id === expandedRow.id) || expandedRow}
          rows={finalRows}
          columns={visibleColumns}
          tableId={table.id}
          onClose={() => setExpandedRow(null)}
          onNavigate={(row) => setExpandedRow(row)}
          readOnly={readOnly && !expandedRow?.isLocked}
          permissionLevel={isAdmin ? 'owner' : readOnly ? 'viewer' : 'editor'}
          session={session}
          columnPermissions={columnPermissions}
          onCellUpdate={handleCellUpdateInternal}
          onRowLockChange={(rowId: string, locked: boolean) => {
            setRowOrder(prevRows =>
              prevRows.map(r =>
                r.id === rowId ? { ...r, isLocked: locked } : r
              )
            );
            onRowLockChangeProp?.(rowId, locked);
          }}
          wsSend={send}
          wsSubscribe={subscribe}
        />
      )}

      {contextMenu && (
        <RowContextMenu
          row={contextMenu.row}
          tableId={table.id}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onInsertRow={onInsertRow}
          canEdit={!readOnly}
        />
      )}

      {editingColumn && (
        <EditColumnModal
          column={editingColumn}
          tableId={table.id}
          isOpen={!!editingColumn}
          onClose={() => setEditingColumn(null)}
        />
      )}
    </>
  );
}