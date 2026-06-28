'use client';

import { useState, useRef, useEffect } from 'react';

export function ColumnFilterMenu({ 
  column,
  rows,
  activeFilters,
  onFilterChange 
}: { 
  column: any;
  rows: any[];
  activeFilters: { [columnId: string]: any };
  onFilterChange: (columnId: string, filter: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const currentFilter = activeFilters[column.id];
  const hasFilter = currentFilter && Object.keys(currentFilter).length > 0;

  // Get unique values for select columns
  function getUniqueValues() {
    const values = new Set<string>();
    rows.forEach(row => {
      const value = row.data[column.id];
      if (value) {
        if (column.type === 'multi_select') {
          const vals = value.split(',');
          vals.forEach((v: string) => values.add(v));
        } else {
          values.add(value);
        }
      }
    });
    return Array.from(values).sort();
  }

  // Get option label from value
  function getOptionLabel(value: string) {
    if (column.type === 'select' || column.type === 'multi_select') {
      const option = column.settings?.options?.find((opt: any) => opt.value === value);
      return option ? option.label : value;
    }
    return value;
  }

  // Handle select filter
  function handleSelectFilter(value: string) {
    const current = currentFilter?.values || [];
    const newValues = current.includes(value)
      ? current.filter((v: string) => v !== value)
      : [...current, value];
    
    if (newValues.length === 0) {
      onFilterChange(column.id, {});
    } else {
      onFilterChange(column.id, { type: 'select', values: newValues });
    }
  }

  // Handle text filter
  function handleTextFilter(value: string, mode: 'contains' | 'equals') {
    if (!value) {
      onFilterChange(column.id, {});
    } else {
      onFilterChange(column.id, { type: 'text', value, mode });
    }
  }

  // Handle number filter
  function handleNumberFilter(min?: string, max?: string) {
    if (!min && !max) {
      onFilterChange(column.id, {});
    } else {
      onFilterChange(column.id, { type: 'number', min, max });
    }
  }

  // Render filter content based on column type
  function renderFilterContent() {
    if (column.type === 'select' || column.type === 'multi_select') {
      const uniqueValues = getUniqueValues();
      const selectedValues = currentFilter?.values || [];

      return (
        <div className="p-2 max-h-64 overflow-y-auto">
          <div className="space-y-1">
            {uniqueValues.map(value => (
              <label key={value} className="flex items-center px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(value)}
                  onChange={() => handleSelectFilter(value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{getOptionLabel(value)}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (column.type === 'text' || column.type === 'email' || column.type === 'url' || column.type === 'phone') {
      return (
        <div className="p-3 space-y-2">
          <input
            type="text"
            placeholder="Search..."
            defaultValue={currentFilter?.value || ''}
            onChange={(e) => handleTextFilter(e.target.value, 'contains')}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      );
    }

    if (column.type === 'number' || column.type === 'currency') {
      return (
        <div className="p-3 space-y-2">
          <input
            type="number"
            placeholder="Min"
            defaultValue={currentFilter?.min || ''}
            onChange={(e) => handleNumberFilter(e.target.value, currentFilter?.max)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
          />
          <input
            type="number"
            placeholder="Max"
            defaultValue={currentFilter?.max || ''}
            onChange={(e) => handleNumberFilter(currentFilter?.min, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      );
    }

    if (column.type === 'date' || column.type === 'datetime') {
      return (
        <div className="p-3 space-y-2">
          <input
            type="date"
            defaultValue={currentFilter?.min || ''}
            onChange={(e) => handleNumberFilter(e.target.value, currentFilter?.max)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
          />
          <input
            type="date"
            defaultValue={currentFilter?.max || ''}
            onChange={(e) => handleNumberFilter(currentFilter?.min, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      );
    }

    if (column.type === 'checkbox') {
      return (
        <div className="p-2">
          <label className="flex items-center px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
            <input
              type="checkbox"
              checked={currentFilter?.value === 'true'}
              onChange={(e) => onFilterChange(column.id, e.target.checked ? { type: 'checkbox', value: 'true' } : {})}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Show checked only</span>
          </label>
        </div>
      );
    }

    return <div className="p-3 text-sm text-gray-500 dark:text-gray-400">No filter available for this type</div>;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`ml-1 p-1 rounded transition-colors ${
          hasFilter 
            ? 'text-blue-600 bg-blue-50' 
            : 'text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100'
        }`}
        title="Filter column"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter {column.name}</span>
            {hasFilter && (
              <button
                onClick={() => {
                  onFilterChange(column.id, {});
                  setIsOpen(false);
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear
              </button>
            )}
          </div>
          {renderFilterContent()}
        </div>
      )}
    </div>
  );
}