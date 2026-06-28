'use client';

import { useState } from 'react';

interface GalleryProps {
  rows: any[];
  columns: any[];
  tableId: string;
  onCardClick: (row: any) => void;
}

export function GalleryBoard({
  rows,
  columns,
  tableId,
  onCardClick,
}: GalleryProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Get the title column (first text column)
  const titleColumn = columns.find((c: any) => c.type === 'text') || columns[0];

  // Get display columns (exclude complex types, limit to 6)
  const displayColumns = columns
    .filter((c: any) =>
      c.id !== titleColumn?.id &&
      c.type !== 'linked_record' &&
      c.type !== 'lookup' &&
      c.type !== 'rollup' &&
      c.type !== 'formula'
    )
    .slice(0, 6);

  // Filter rows by search
  const filteredRows = searchQuery.trim()
    ? rows.filter((row) => {
        const title = row.data?.[titleColumn?.id];
        if (!title) return false;
        return String(title).toLowerCase().includes(searchQuery.toLowerCase());
      })
    : rows;

  function formatCellValue(value: any, column: any): string {
    if (value === null || value === undefined || value === '') return '';
    if (column.type === 'currency') return `$${parseFloat(value).toFixed(2)}`;
    if (column.type === 'percent') return `${value}%`;
    if (column.type === 'checkbox') return value ? '✓ Yes' : '✗ No';
    if (column.type === 'rating') return '★'.repeat(Number(value) || 0);
    if (column.type === 'date' || column.type === 'datetime') {
      try { return new Date(value).toLocaleDateString(); } catch { return String(value); }
    }
    if (column.type === 'url') return String(value).replace(/^https?:\/\//, '').slice(0, 40);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value).slice(0, 80);
  }

  function getSelectColor(value: string, column: any): string {
    const rawOptions = column.settings?.options || [];
    const colors: Record<string, string> = { ...(column.settings?.colors || {}) };
    if (rawOptions.length > 0 && typeof rawOptions[0] === 'object') {
      rawOptions.forEach((opt: any) => {
        if (opt.value && opt.color) colors[opt.value] = opt.color;
      });
    }
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

  // Generate a consistent accent color for each card based on row index
  const accentColors = [
    'from-blue-500 to-blue-600',
    'from-purple-500 to-purple-600',
    'from-emerald-500 to-emerald-600',
    'from-orange-500 to-orange-600',
    'from-pink-500 to-pink-600',
    'from-teal-500 to-teal-600',
    'from-indigo-500 to-indigo-600',
    'from-red-500 to-red-600',
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-gray-950 p-6">
      {/* Search Bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="relative w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cards..."
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ✕
            </button>
          )}
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filteredRows.length} card{filteredRows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Cards Grid */}
      {filteredRows.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          {searchQuery ? 'No cards match your search.' : 'No records to display.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRows.map((row, index) => {
            const titleVal = row.data?.[titleColumn?.id];
            const title = (titleVal && typeof titleVal !== 'object') ? String(titleVal) : 'Untitled';
            const accent = accentColors[index % accentColors.length];

            return (
              <div
                key={row.id}
                onClick={() => onCardClick(row)}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 transition-all group"
              >
                {/* Accent Bar */}
                <div className={`h-1.5 bg-gradient-to-r ${accent}`} />

                {/* Card Content */}
                <div className="p-4">
                  {/* Title */}
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-3 truncate group-hover:text-blue-700 transition-colors">
                    {title}
                  </h3>

                  {/* Fields */}
                  <div className="space-y-2">
                    {displayColumns.map((col: any) => {
                      const val = row.data?.[col.id];
                      if (!val && val !== 0 && val !== false) return null;
                      const formatted = formatCellValue(val, col);
                      if (!formatted) return null;

                      return (
                        <div key={col.id} className="flex items-start space-x-2">
                          <span className="text-xs text-gray-400 dark:text-gray-500 w-20 flex-shrink-0 pt-0.5 truncate">
                            {col.name}
                          </span>
                          {col.type === 'select' ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${getSelectColor(String(val), col)}`}>
                              {formatted}
                            </span>
                          ) : col.type === 'checkbox' ? (
                            <span className={`text-xs font-medium ${val ? 'text-green-600' : 'text-gray-400 dark:text-gray-500'}`}>
                              {formatted}
                            </span>
                          ) : col.type === 'rating' ? (
                            <span className="text-xs text-yellow-500">{formatted}</span>
                          ) : col.type === 'email' ? (
                            <span className="text-xs text-blue-600 truncate">{formatted}</span>
                          ) : col.type === 'url' ? (
                            <span className="text-xs text-blue-600 truncate">{formatted}</span>
                          ) : (
                            <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{formatted}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Click to view details</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}