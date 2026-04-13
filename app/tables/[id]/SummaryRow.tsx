'use client';

import { useState } from 'react';

type AggregationType = 
  | 'none'
  | 'count' | 'count_empty' | 'count_filled' | 'count_unique'
  | 'sum' | 'avg' | 'min' | 'max'
  | 'earliest' | 'latest'
  | 'checked' | 'unchecked' | 'percent_checked';

function getOptionsForType(columnType: string): { value: AggregationType; label: string }[] {
  const common = [
    { value: 'none' as AggregationType, label: 'None' },
    { value: 'count_filled' as AggregationType, label: 'Count filled' },
    { value: 'count_empty' as AggregationType, label: 'Count empty' },
    { value: 'count_unique' as AggregationType, label: 'Count unique' },
    { value: 'count' as AggregationType, label: 'Count all' },
  ];

  if (['number', 'currency', 'percent', 'rating'].includes(columnType)) {
    return [...common,
      { value: 'sum', label: 'Sum' },
      { value: 'avg', label: 'Average' },
      { value: 'min', label: 'Min' },
      { value: 'max', label: 'Max' },
    ];
  }

  if (['date', 'datetime'].includes(columnType)) {
    return [...common,
      { value: 'earliest', label: 'Earliest' },
      { value: 'latest', label: 'Latest' },
    ];
  }

  if (columnType === 'checkbox') {
    return [
      { value: 'none' as AggregationType, label: 'None' },
      { value: 'checked', label: 'Checked' },
      { value: 'unchecked', label: 'Unchecked' },
      { value: 'percent_checked', label: '% Checked' },
      { value: 'count', label: 'Count all' },
    ];
  }

  return common;
}

function computeAggregation(
  type: AggregationType,
  columnId: string,
  columnType: string,
  rows: any[]
): string {
  if (type === 'none') return '';
  const values = rows.map(r => r.data[columnId]).filter(v => v !== null && v !== undefined && v !== '');

  switch (type) {
    case 'count': return String(rows.length);
    case 'count_filled': return String(values.length);
    case 'count_empty': return String(rows.length - values.length);
    case 'count_unique': return String(new Set(values).size);
    case 'sum': {
      const sum = values.reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
      return columnType === 'currency' ? '$' + sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : columnType === 'percent' ? sum.toFixed(1) + '%'
        : sum % 1 === 0 ? String(sum) : sum.toFixed(2);
    }
    case 'avg': {
      if (!values.length) return '';
      const avg = values.reduce((acc, v) => acc + (parseFloat(v) || 0), 0) / values.length;
      return columnType === 'currency' ? '$' + avg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : columnType === 'percent' ? avg.toFixed(1) + '%'
        : avg % 1 === 0 ? String(avg) : avg.toFixed(2);
    }
    case 'min': {
      if (!values.length) return '';
      const min = Math.min(...values.map(v => parseFloat(v) || 0));
      return columnType === 'currency' ? '$' + min.toLocaleString() : String(min);
    }
    case 'max': {
      if (!values.length) return '';
      const max = Math.max(...values.map(v => parseFloat(v) || 0));
      return columnType === 'currency' ? '$' + max.toLocaleString() : String(max);
    }
    case 'earliest': {
      if (!values.length) return '';
      const dates = values.map(v => new Date(v)).filter(d => !isNaN(d.getTime()));
      if (!dates.length) return '';
      return new Date(Math.min(...dates.map(d => d.getTime()))).toLocaleDateString();
    }
    case 'latest': {
      if (!values.length) return '';
      const dates = values.map(v => new Date(v)).filter(d => !isNaN(d.getTime()));
      if (!dates.length) return '';
      return new Date(Math.max(...dates.map(d => d.getTime()))).toLocaleDateString();
    }
    case 'checked': return String(values.filter(v => v === 'true').length);
    case 'unchecked': return String(rows.length - values.filter(v => v === 'true').length);
    case 'percent_checked': {
      if (!rows.length) return '0%';
      return (values.filter(v => v === 'true').length / rows.length * 100).toFixed(0) + '%';
    }
    default: return '';
  }
}

export function SummaryRow({
  columns,
  rows,
  summaryConfig,
  onSummaryChange,
}: {
  columns: any[];
  rows: any[];
  summaryConfig: { [columnId: string]: AggregationType };
  onSummaryChange: (columnId: string, type: AggregationType) => void;
}) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const hasAnySummary = Object.values(summaryConfig).some(v => v && v !== 'none');

  return (
    <thead>
      <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-600 sticky top-[37px] z-[9]">
        {/* Empty cell for checkbox/drag column */}
        <th className="w-20 px-2 py-1 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <span className="text-[10px] font-semibold text-gray-400 uppercase">∑</span>
        </th>

        {columns.map((column: any) => {
          const aggType = summaryConfig[column.id] || 'none';
          const result = computeAggregation(aggType, column.id, column.type, rows);
          const options = getOptionsForType(column.type);
          const isOpen = openDropdown === column.id;

          return (
            <th
              key={column.id}
              className="px-2 py-1 border-r border-gray-200 dark:border-gray-700 relative bg-gray-50 dark:bg-gray-800 text-left font-normal"
              style={{ maxWidth: (column.width || 200) + 'px' }}
            >
              <button
                onClick={() => setOpenDropdown(isOpen ? null : column.id)}
                className={'w-full text-left group/summary flex items-center justify-between px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ' + (aggType !== 'none' ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400')}
              >
                <span className="text-[11px] font-medium truncate">
                  {aggType !== 'none' ? (
                    <>
                      <span className="text-gray-400 dark:text-gray-500 mr-1 uppercase" style={{ fontSize: '9px' }}>
                        {options.find(o => o.value === aggType)?.label}
                      </span>
                      <span className="text-blue-700 dark:text-blue-400 font-semibold">{result}</span>
                    </>
                  ) : (
                    <span className="opacity-0 group-hover/summary:opacity-100 transition-opacity text-[10px]">+</span>
                  )}
                </span>
                <svg
                  className={'w-2.5 h-2.5 flex-shrink-0 transition-opacity ' + (aggType !== 'none' ? 'opacity-100' : 'opacity-0 group-hover/summary:opacity-100')}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 w-40 py-1">
                    <div className="px-3 py-1 border-b border-gray-100 dark:border-gray-700">
                      <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{column.name}</span>
                    </div>
                    {options.map(option => (
                      <button
                        key={option.value}
                        onClick={() => { onSummaryChange(column.id, option.value); setOpenDropdown(null); }}
                        className={'w-full text-left px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between ' + (aggType === option.value ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300')}
                      >
                        {option.label}
                        {aggType === option.value && (
                          <svg className="w-3 h-3 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}