'use client';

import { useState, useRef } from 'react';

export function DraggableColumn({
  columnId,
  tableId,
  columnIndex,
  totalColumns,
  allColumns,
  children,
  onReorder,
}: {
  columnId: string;
  tableId: string;
  columnIndex: number;
  totalColumns: number;
  allColumns: any[];
  children: React.ReactNode;
  onReorder: (newColumns: any[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState<'left' | 'right' | null>(null);
  const dragColumnId = useRef<string | null>(null);

  function handleDragStart(e: React.DragEvent) {
    dragColumnId.current = columnId;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnId);

    // Custom blue ghost image
    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position: fixed;
      top: -1000px;
      background: #3B82F6;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    `;
    const col = allColumns.find(c => c.id === columnId);
    ghost.textContent = col?.name || 'Column';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }

  function handleDragEnd() {
    setIsDragging(false);
    setIsDragOver(null);
    dragColumnId.current = null;
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    setIsDragOver(e.clientX < midpoint ? 'left' : 'right');
  }

  function handleDragLeave() {
    setIsDragOver(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    setIsDragOver(null);

    if (draggedId === columnId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const dropSide = e.clientX < midpoint ? 'left' : 'right';

    const cols = [...allColumns];
    const fromIndex = cols.findIndex(c => c.id === draggedId);
    const toIndex = cols.findIndex(c => c.id === columnId);

    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = cols.splice(fromIndex, 1);
    const insertAt = dropSide === 'left' ? toIndex : toIndex + 1;
    const adjustedIndex = fromIndex < toIndex ? insertAt - 1 : insertAt;
    cols.splice(adjustedIndex, 0, moved);

    // Only update React state - no DB save!
    // Column order is saved per-view via the ViewSwitcher amber dot
    // Refreshing or switching views without saving will revert the order
    onReorder(cols);
  }

  return (
    <th
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative p-0 border-r border-gray-200 bg-gray-50 select-none transition-opacity ${
        isDragging ? 'opacity-40' : 'opacity-100'
      }`}
    >
      {/* Left drop indicator */}
      {isDragOver === 'left' && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 z-20 pointer-events-none" />
      )}
      {/* Right drop indicator */}
      {isDragOver === 'right' && (
        <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-blue-500 z-20 pointer-events-none" />
      )}

      {/* Drag handle dots - show on header hover */}
      <div className="absolute top-1 left-1 opacity-0 group-hover/header:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10 pointer-events-none">
        <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 6a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm8-16a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4z"/>
        </svg>
      </div>

      {children}
    </th>
  );
}