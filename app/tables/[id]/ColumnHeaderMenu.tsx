'use client';

import { useState, useRef, useEffect } from 'react';

export function ColumnHeaderMenu({
  column,
  tableId,
  rows,
  activeFilters,
  sortConfig,
  onFilterChange,
  onSort,
  onEdit,
  onPermissions,
  showPermissions = false,
  readOnly = false,
}: {
  column: any;
  tableId: string;
  rows: any[];
  activeFilters: { [columnId: string]: any };
  sortConfig: { columnId: string; direction: 'asc' | 'desc' } | null;
  onFilterChange: (columnId: string, filter: any) => void;
  onSort: (columnId: string) => void;
  onEdit: () => void;
  onPermissions?: () => void;
  showPermissions?: boolean;
  readOnly?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentFilter = activeFilters[column.id];
  const hasFilter = currentFilter && Object.keys(currentFilter).length > 0;
  const isSortedAsc = sortConfig?.columnId === column.id && sortConfig?.direction === 'asc';
  const isSortedDesc = sortConfig?.columnId === column.id && sortConfig?.direction === 'desc';
  const isSorted = isSortedAsc || isSortedDesc;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowFilter(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  function getUniqueValues() {
    const values = new Set<string>();
    rows.forEach(row => {
      const value = row.data[column.id];
      if (value) {
        if (column.type === 'multi_select') {
          value.split(',').forEach((v: string) => values.add(v));
        } else {
          values.add(value);
        }
      }
    });
    return Array.from(values).sort();
  }

  function getOptionLabel(value: string) {
    if (column.type === 'select' || column.type === 'multi_select') {
      const option = column.settings?.options?.find((opt: any) => opt.value === value);
      return option ? option.label : value;
    }
    return value;
  }

  function handleSelectFilter(value: string) {
    const current = currentFilter?.values || [];
    const newValues = current.includes(value)
      ? current.filter((v: string) => v !== value)
      : [...current, value];
    if (newValues.length === 0) onFilterChange(column.id, {});
    else onFilterChange(column.id, { type: 'select', values: newValues });
  }

  function handleTextFilter(value: string) {
    if (!value) onFilterChange(column.id, {});
    else onFilterChange(column.id, { type: 'text', value, mode: 'contains' });
  }

  function handleNumberFilter(min?: string, max?: string) {
    if (!min && !max) onFilterChange(column.id, {});
    else onFilterChange(column.id, { type: 'number', min, max });
  }

  async function handleDelete() {
    if (!confirm(`Delete column "${column.name}"? All data in this column will be lost.`)) return;
    try {
      const res = await fetch(`/api/tables/${tableId}/columns/${column.id}`, { method: 'DELETE' });
      if (res.ok) window.location.reload();
      else alert('Failed to delete column');
    } catch (err) {
      console.error('Error deleting column:', err);
      alert('Error deleting column');
    }
  }

  function renderFilterContent() {
    if (column.type === 'select' || column.type === 'multi_select') {
      const uniqueValues = getUniqueValues();
      const selectedValues = currentFilter?.values || [];
      return (
        <div className="p-2 max-h-48 overflow-y-auto">
          {uniqueValues.map(value => (
            <label key={value} className="flex items-center px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
              <input type="checkbox" checked={selectedValues.includes(value)} onChange={() => handleSelectFilter(value)}
                className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded" />
              <span className="ml-2 text-xs text-gray-700 dark:text-gray-300">{getOptionLabel(value)}</span>
            </label>
          ))}
          {uniqueValues.length === 0 && <p className="px-2 py-1 text-xs text-gray-400">No values</p>}
        </div>
      );
    }
    if (['text', 'email', 'url', 'phone', 'textarea'].includes(column.type)) {
      return (
        <div className="p-2">
          <input type="text" placeholder="Contains..." defaultValue={currentFilter?.value || ''}
            onChange={(e) => handleTextFilter(e.target.value)} autoFocus
            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" />
        </div>
      );
    }
    if (['number', 'currency', 'percent', 'rating'].includes(column.type)) {
      return (
        <div className="p-2 space-y-1.5">
          <input type="number" placeholder="Min" defaultValue={currentFilter?.min || ''}
            onChange={(e) => handleNumberFilter(e.target.value, currentFilter?.max)}
            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" />
          <input type="number" placeholder="Max" defaultValue={currentFilter?.max || ''}
            onChange={(e) => handleNumberFilter(currentFilter?.min, e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" />
        </div>
      );
    }
    if (column.type === 'date' || column.type === 'datetime') {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      return (
        <div className="p-2 space-y-1.5">
          <div className="flex flex-wrap gap-1 mb-2">
            <button onClick={() => handleNumberFilter(today, today)} className="text-[9px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100">Today</button>
            <button onClick={() => handleNumberFilter(weekAgo, today)} className="text-[9px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100">Past 7 days</button>
            <button onClick={() => handleNumberFilter(monthAgo, today)} className="text-[9px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100">Past 30 days</button>
            <button onClick={() => handleNumberFilter(yearStart, today)} className="text-[9px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100">This year</button>
          </div>
          <label className="text-[9px] text-gray-400 font-medium">From</label>
          <input type="date" defaultValue={currentFilter?.min || ''}
            onChange={(e) => handleNumberFilter(e.target.value, currentFilter?.max)}
            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" />
          <label className="text-[9px] text-gray-400 font-medium">To</label>
          <input type="date" defaultValue={currentFilter?.max || ''}
            onChange={(e) => handleNumberFilter(currentFilter?.min, e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" />
        </div>
      );
    }
    if (column.type === 'checkbox') {
      return (
        <div className="p-2">
          <label className="flex items-center px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
            <input type="checkbox" checked={currentFilter?.value === 'true'}
              onChange={(e) => onFilterChange(column.id, e.target.checked ? { type: 'checkbox', value: 'true' } : {})}
              className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded" />
            <span className="ml-2 text-xs text-gray-700 dark:text-gray-300">Checked only</span>
          </label>
        </div>
      );
    }
    return (
      <div className="p-2 space-y-1">
        <label className="flex items-center px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
          <input type="radio" name={`empty-${column.id}`} checked={currentFilter?.type === 'empty' && currentFilter?.mode === 'empty'}
            onChange={() => onFilterChange(column.id, { type: 'empty', mode: 'empty' })}
            className="h-3 w-3 text-blue-600 border-gray-300" />
          <span className="ml-2 text-xs text-gray-700 dark:text-gray-300">Is empty</span>
        </label>
        <label className="flex items-center px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
          <input type="radio" name={`empty-${column.id}`} checked={currentFilter?.type === 'empty' && currentFilter?.mode === 'not_empty'}
            onChange={() => onFilterChange(column.id, { type: 'empty', mode: 'not_empty' })}
            className="h-3 w-3 text-blue-600 border-gray-300" />
          <span className="ml-2 text-xs text-gray-700 dark:text-gray-300">Is not empty</span>
        </label>
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); setShowFilter(false); }}
        className={'p-0.5 rounded transition-colors ' + (
          isSorted || hasFilter
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-400 hover:text-gray-600 opacity-0 group-hover/header:opacity-100'
        )}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-1 z-50">
          {/* Column name header */}
          <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{column.name}</span>
          </div>

          {/* Sort options — context-aware labels */}
          {(() => {
            const isDate = ['date', 'datetime', 'system_datetime'].includes(column.type);
            const isNumber = ['number', 'currency', 'percent', 'rating'].includes(column.type);
            const isCheckbox = column.type === 'checkbox';
            const ascLabel = isDate ? 'Oldest → Newest' : isNumber ? 'Smallest → Largest' : isCheckbox ? 'Unchecked → Checked' : 'Sort A → Z';
            const descLabel = isDate ? 'Newest → Oldest' : isNumber ? 'Largest → Smallest' : isCheckbox ? 'Checked → Unchecked' : 'Sort Z → A';
            const ascIcon = isDate ? '📅↑' : isNumber ? '1↑' : '↑';
            const descIcon = isDate ? '📅↓' : isNumber ? '9↓' : '↓';
            return (
              <>
                <button onClick={(e) => { e.stopPropagation(); onSort(column.id); setIsOpen(false); }}
                  className={'w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2 ' + (isSortedAsc ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300')}>
                  <span>{ascIcon}</span><span>{ascLabel}</span>
                  {isSortedAsc && <span className="ml-auto">✓</span>}
                </button>
                <button onClick={(e) => {
                    e.stopPropagation();
                    if (isSortedAsc) onSort(column.id);
                    else if (!isSorted) { onSort(column.id); onSort(column.id); }
                    else onSort(column.id);
                    setIsOpen(false);
                  }}
                  className={'w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2 ' + (isSortedDesc ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300')}>
                  <span>{descIcon}</span><span>{descLabel}</span>
                  {isSortedDesc && <span className="ml-auto">✓</span>}
                </button>
              </>
            );
          })()}

          {isSorted && (
            <button onClick={(e) => { e.stopPropagation(); onSort(column.id); if (isSortedAsc) onSort(column.id); setIsOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2">
              <span>✕</span><span>Clear sort</span>
            </button>
          )}

          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />

          {/* Filter */}
          <button onClick={(e) => { e.stopPropagation(); setShowFilter(!showFilter); }}
            className={'w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2 ' + (hasFilter ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300')}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span>Filter</span>
            {hasFilter && <span className="ml-auto text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 px-1.5 rounded-full">ON</span>}
          </button>

          {showFilter && (
            <div className="border-t border-gray-100 dark:border-gray-700">
              {hasFilter && (
                <div className="px-3 py-1 flex justify-end">
                  <button onClick={() => { onFilterChange(column.id, {}); }} className="text-[10px] text-blue-600 hover:text-blue-800">Clear filter</button>
                </div>
              )}
              {renderFilterContent()}
            </div>
          )}

          {!readOnly && column.type !== 'approval_status' && column.type !== 'attachment' && (
            <>
              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />

              {/* Edit */}
              <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); onEdit(); }}
                className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Edit Column</span>
              </button>

              {/* Permissions */}
              {showPermissions && onPermissions && (
                <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); onPermissions(); }}
                  className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Permissions</span>
                </button>
              )}

              {/* Delete */}
              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
              <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); handleDelete(); }}
                className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Delete Column</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}