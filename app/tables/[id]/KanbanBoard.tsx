'use client';

import { useState, useRef } from 'react';

interface KanbanProps {
  rows: any[];
  columns: any[];
  kanbanColumnId: string;
  tableId: string;
  onCardMove: (rowId: string, newValue: string) => void;
  onCardClick: (row: any) => void;
}

export function KanbanBoard({
  rows,
  columns,
  kanbanColumnId,
  tableId,
  onCardMove,
  onCardClick,
}: KanbanProps) {
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<string | null>(null);
  const dragCounter = useRef<Record<string, number>>({});

  // Get the kanban column definition
  const kanbanColumn = columns.find((c: any) => c.id === kanbanColumnId);
  if (!kanbanColumn) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Kanban column not found. Please edit this view.
      </div>
    );
  }

  // Get the options from the select column (handle both string[] and object[] formats)
  const rawOptions = kanbanColumn.settings?.options || [];
  const options: string[] = rawOptions.map((opt: any) =>
    typeof opt === 'string' ? opt : opt.value || opt.label || String(opt)
  );

  // Build colors map (handle both formats)
  const colors: Record<string, string> = { ...(kanbanColumn.settings?.colors || {}) };
  if (rawOptions.length > 0 && typeof rawOptions[0] === 'object') {
    rawOptions.forEach((opt: any) => {
      if (opt.value && opt.color) {
        colors[opt.value] = opt.color;
      }
      if (opt.label && opt.color && !colors[opt.label]) {
        colors[opt.label] = opt.color;
      }
    });
  }

  // Add "No Value" lane for rows without a value
  const lanes = ['__none__', ...options];

  // Get the first text/name column for card title
  const titleColumn = columns.find(
    (c: any) => c.type === 'text' && c.id !== kanbanColumnId
  ) || columns[0];

  // Get a few preview columns (exclude kanban column and title column)
  const previewColumns = columns
    .filter((c: any) => 
      c.id !== kanbanColumnId && 
      c.id !== titleColumn?.id && 
      c.type !== 'linked_record' && 
      c.type !== 'lookup' && 
      c.type !== 'rollup' &&
      c.type !== 'formula'
    )
    .slice(0, 3);

  // Group rows by kanban column value
  function getRowsForLane(lane: string): any[] {
    return rows.filter((row) => {
      const val = row.data?.[kanbanColumnId];
      if (lane === '__none__') {
        return !val || val === '' || val === null || val === undefined;
      }
      return val === lane;
    });
  }

  // Color helpers
  function getLaneColor(lane: string) {
    if (lane === '__none__') return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-600', dot: 'bg-gray-400' };
    const color = colors[lane];
    const colorMap: Record<string, any> = {
      red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500' },
      blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
      green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
      yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500' },
      purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
      pink: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', dot: 'bg-pink-500' },
      orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
      teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', dot: 'bg-teal-500' },
      indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' },
      gray: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', dot: 'bg-gray-500' },
    };
    return colorMap[color] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', dot: 'bg-gray-400' };
  }

  function getChipColor(value: string) {
    const color = colors[value];
    const chipMap: Record<string, string> = {
      red: 'bg-red-100 text-red-800',
      blue: 'bg-blue-100 text-blue-800',
      green: 'bg-green-100 text-green-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      purple: 'bg-purple-100 text-purple-800',
      pink: 'bg-pink-100 text-pink-800',
      orange: 'bg-orange-100 text-orange-800',
      teal: 'bg-teal-100 text-teal-800',
      indigo: 'bg-indigo-100 text-indigo-800',
      gray: 'bg-gray-100 text-gray-800',
    };
    return chipMap[color] || 'bg-gray-100 text-gray-800';
  }

  // Drag handlers
  function handleDragStart(e: React.DragEvent, rowId: string) {
    setDraggedCardId(rowId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', rowId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`kanban-card-${rowId}`);
      if (el) el.style.opacity = '0.4';
    });
  }

  function handleDragEnd(e: React.DragEvent) {
    const el = document.getElementById(`kanban-card-${draggedCardId}`);
    if (el) el.style.opacity = '1';
    setDraggedCardId(null);
    setDragOverLane(null);
    dragCounter.current = {};
  }

  function handleDragEnter(e: React.DragEvent, lane: string) {
    e.preventDefault();
    dragCounter.current[lane] = (dragCounter.current[lane] || 0) + 1;
    setDragOverLane(lane);
  }

  function handleDragLeave(e: React.DragEvent, lane: string) {
    dragCounter.current[lane] = (dragCounter.current[lane] || 0) - 1;
    if (dragCounter.current[lane] <= 0) {
      dragCounter.current[lane] = 0;
      if (dragOverLane === lane) {
        setDragOverLane(null);
      }
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent, lane: string) {
    e.preventDefault();
    const rowId = e.dataTransfer.getData('text/plain');
    if (rowId && draggedCardId) {
      const newValue = lane === '__none__' ? '' : lane;
      onCardMove(rowId, newValue);
    }
    setDraggedCardId(null);
    setDragOverLane(null);
    dragCounter.current = {};
  }

  function formatCellValue(value: any, column: any): string {
    if (value === null || value === undefined || value === '') return '';
    if (column.type === 'currency') return `$${parseFloat(value).toFixed(2)}`;
    if (column.type === 'percent') return `${value}%`;
    if (column.type === 'checkbox') return value ? '✓' : '✗';
    if (column.type === 'rating') return '★'.repeat(Number(value) || 0);
    if (column.type === 'date') {
      try { return new Date(value).toLocaleDateString(); } catch { return String(value); }
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value).slice(0, 60);
  }

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden bg-gray-100 dark:bg-gray-950 p-6">
      <div className="flex space-x-4 h-full min-h-0">
        {lanes.map((lane) => {
          const laneRows = getRowsForLane(lane);
          const laneColor = getLaneColor(lane);
          const isDropTarget = dragOverLane === lane && draggedCardId !== null;
          const laneName = lane === '__none__' ? 'No Value' : lane;

          return (
            <div
              key={lane}
              className={`flex flex-col w-72 flex-shrink-0 rounded-xl transition-all ${
                isDropTarget
                  ? 'bg-blue-100 ring-2 ring-blue-400 ring-offset-2'
                  : 'bg-gray-50 dark:bg-gray-800/50'
              }`}
              onDragEnter={(e) => handleDragEnter(e, lane)}
              onDragLeave={(e) => handleDragLeave(e, lane)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, lane)}
            >
              {/* Lane Header */}
              <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl ${laneColor.bg}`}>
                <div className="flex items-center space-x-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${laneColor.dot}`} />
                  <span className={`text-sm font-semibold ${laneColor.text}`}>
                    {laneName}
                  </span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 px-2 py-0.5 rounded-full font-medium">
                  {laneRows.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
                {laneRows.length === 0 && !isDropTarget && (
                  <div className="text-center py-8 text-xs text-gray-400 dark:text-gray-500">
                    No items
                  </div>
                )}

                {isDropTarget && laneRows.length === 0 && (
                  <div className="border-2 border-dashed border-blue-300 rounded-lg py-8 text-center text-xs text-blue-500 font-medium">
                    Drop here
                  </div>
                )}

                {laneRows.map((row) => {
                  const titleVal = row.data?.[titleColumn?.id];
                  const title = (titleVal && typeof titleVal !== 'object') ? String(titleVal) : 'Untitled';
                  const isDragging = draggedCardId === row.id;

                  return (
                    <div
                      key={row.id}
                      id={`kanban-card-${row.id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, row.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onCardClick(row)}
                      className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all group ${
                        isDragging ? 'opacity-40' : ''
                      }`}
                    >
                      {/* Card Title */}
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-1 truncate">
                        {title}
                      </div>

                      {/* Preview Fields */}
                      {previewColumns.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {previewColumns.map((col: any) => {
                            const val = row.data?.[col.id];
                            if (!val && val !== 0 && val !== false) return null;
                            const formatted = formatCellValue(val, col);
                            if (!formatted) return null;

                            return (
                              <div key={col.id} className="flex items-center space-x-1.5">
                                <span className="text-xs text-gray-400 dark:text-gray-500 truncate w-16 flex-shrink-0">
                                  {col.name}
                                </span>
                                {col.type === 'select' ? (
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${getChipColor(String(val))}`}>
                                    {formatted}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                    {formatted}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Card Footer */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs text-gray-400 dark:text-gray-500">Click to expand</span>
                        <svg className="w-3 h-3 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}