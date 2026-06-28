'use client';

import { useState, useEffect, useRef } from 'react';

export function LinkedRecordPicker({
  linkedTableId,
  displayColumnId,
  currentValue,
  onChange,
  disabled = false,
  placeholder = 'Select a record...',
}: {
  linkedTableId: string;
  displayColumnId?: string;
  currentValue?: string; // The linked row ID
  onChange: (rowId: string | null, displayValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch records from linked table
  useEffect(() => {
    if (!linkedTableId) return;
    fetchRecords();
  }, [linkedTableId]);

  // Resolve current value's display name
  useEffect(() => {
    if (currentValue && records.length > 0) {
      const record = records.find(r => r.id === currentValue);
      if (record) {
        setSelectedDisplay(getDisplayValue(record));
      }
    } else if (!currentValue) {
      setSelectedDisplay('');
    }
  }, [currentValue, records]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  async function fetchRecords() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tables/${linkedTableId}/rows`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (error) {
      console.error('Error fetching linked records:', error);
    } finally {
      setLoading(false);
    }
  }

  function getDisplayValue(record: any): string {
    if (!record?.data) return 'Untitled';
    
    // If we have a specific display column, use it
    if (displayColumnId && record.data[displayColumnId]) {
      return String(record.data[displayColumnId]);
    }
    
    // Otherwise use the first non-empty field
    const values = Object.values(record.data);
    for (const val of values) {
      if (val && String(val).trim()) {
        return String(val).slice(0, 50);
      }
    }
    return `Record ${record.id.slice(0, 8)}`;
  }

  const filteredRecords = records.filter(record => {
    if (!search.trim()) return true;
    const display = getDisplayValue(record);
    return display.toLowerCase().includes(search.toLowerCase());
  });

  function handleSelect(record: any) {
    const display = getDisplayValue(record);
    setSelectedDisplay(display);
    setIsOpen(false);
    setSearch('');
    onChange(record.id, display);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedDisplay('');
    setSearch('');
    onChange(null, '');
  }

  if (disabled) {
    return (
      <div className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-500 dark:text-gray-400 cursor-not-allowed">
        {selectedDisplay || <span className="text-gray-400">—</span>}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected value / trigger */}
      <div
        onClick={() => { setIsOpen(!isOpen); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`w-full px-3 py-2 border rounded-lg text-sm cursor-pointer flex items-center justify-between transition-colors ${
          isOpen ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
        }`}
      >
        {selectedDisplay ? (
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <span className="text-blue-600">🔗</span>
            <span className="truncate text-gray-900 dark:text-gray-100">{selectedDisplay}</span>
          </div>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}
        <div className="flex items-center space-x-1 flex-shrink-0">
          {selectedDisplay && (
            <button onClick={handleClear} className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Clear">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search records..."
              className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsOpen(false);
                if (e.key === 'Enter' && filteredRecords.length === 1) {
                  handleSelect(filteredRecords[0]);
                }
              }}
            />
          </div>

          {/* Records list */}
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">Loading records...</div>
            ) : filteredRecords.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                {search ? `No records match "${search}"` : 'No records available'}
              </div>
            ) : (
              filteredRecords.map((record) => {
                const display = getDisplayValue(record);
                const isSelected = record.id === currentValue;
                return (
                  <button
                    key={record.id}
                    onClick={() => handleSelect(record)}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center space-x-2 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    <span className="text-blue-500 text-xs">🔗</span>
                    <span className="truncate">{display}</span>
                    {isSelected && (
                      <svg className="w-4 h-4 text-blue-600 flex-shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}