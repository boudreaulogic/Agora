'use client';

import { useState, useRef, useCallback } from 'react';

export function ResizableColumn({
  columnId,
  tableId,
  initialWidth = 200,
  children,
}: {
  columnId: string;
  tableId: string;
  initialWidth?: number;
  children: React.ReactNode;
}) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    function onMouseMove(e: MouseEvent) {
      const diff = e.clientX - startXRef.current;
      const newWidth = Math.max(80, startWidthRef.current + diff);
      setWidth(newWidth);
    }

    function onMouseUp(e: MouseEvent) {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const finalWidth = Math.max(80, startWidthRef.current + (e.clientX - startXRef.current));
      saveColumnWidth(finalWidth);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  async function saveColumnWidth(newWidth: number) {
    try {
      await fetch(`/api/tables/${tableId}/columns/${columnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ width: newWidth }),
      });
    } catch (error) {
      console.error('Failed to save column width:', error);
    }
  }

  return (
    // Just a div wrapper - DraggableColumn provides the <th>
    <div
      style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
      className="relative flex items-center px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider select-none"
    >
      {/* Content */}
      <div className="flex-1 min-w-0">
        {children}
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={startResize}
        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center z-10 group/resize`}
        title="Drag to resize"
      >
        <div className={`w-0.5 h-4 rounded-full transition-colors ${
          isResizing 
            ? 'bg-blue-500' 
            : 'bg-transparent group-hover/resize:bg-blue-400'
        }`} />
      </div>
    </div>
  );
}