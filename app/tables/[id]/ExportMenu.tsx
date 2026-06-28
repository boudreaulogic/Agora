'use client';

import { useState, useRef, useEffect } from 'react';
import * as XLSX from '@e965/xlsx';

export function ExportMenu({ 
  table,
  filteredRows,
  allRows,
  selectedRows 
}: { 
  table: any;
  filteredRows: any[];
  allRows: any[];
  selectedRows: string[];
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

  function exportToCSV(rows: any[]) {
    // Prepare headers
    const headers = table.columns.map((col: any) => col.name);
    
    // Prepare data rows
    const data = rows.map((row: any) => {
      return table.columns.map((col: any) => {
        const value = row.data[col.id];
        
        // Handle select columns - show label instead of value
        if (col.type === 'select' || col.type === 'multi_select') {
          if (!value) return '';
          if (col.type === 'multi_select' && value.includes(',')) {
            const values = value.split(',');
            return values.map((v: string) => {
              const option = col.settings?.options?.find((opt: any) => opt.value === v);
              return option ? option.label : v;
            }).join(', ');
          }
          const option = col.settings?.options?.find((opt: any) => opt.value === value);
          return option ? option.label : value;
        }
        
        // Handle checkboxes
        if (col.type === 'checkbox') {
          return value === 'true' ? 'Yes' : 'No';
        }
        
        return value || '';
      });
    });

    // Create CSV content
    // Formula-injection guard: cells beginning with =, +, -, @, TAB, CR are
    // prefixed with a TAB inside the quoted value so spreadsheet apps don't
    // evaluate them as formulas (DDE, data exfiltration, etc.).
    const FORMULA_CHARS = /^[=+\-@\t\r]/;
    const csvContent = [
      headers.join(','),
      ...data.map((row: any) => row.map((cell: any) => {
        var cellStr = String(cell == null ? '' : cell);
        // Prefix dangerous lead characters inside the quoted field
        if (FORMULA_CHARS.test(cellStr)) {
          cellStr = '\t' + cellStr;
        }
        // Always quote if contains comma, quote, newline, or we added a prefix
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n') || cellStr.includes('\t')) {
          return '"' + cellStr.replace(/"/g, '""') + '"';
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${table.name}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setIsOpen(false);
  }

  function exportToExcel(rows: any[]) {
    // Prepare headers
    const headers = table.columns.map((col: any) => col.name);
    
    // Prepare data rows
    const data = rows.map((row: any) => {
      const rowData: any = {};
      table.columns.forEach((col: any) => {
        const value = row.data[col.id];
        
        // Handle select columns
        if (col.type === 'select' || col.type === 'multi_select') {
          if (!value) {
            rowData[col.name] = '';
          } else if (col.type === 'multi_select' && value.includes(',')) {
            const values = value.split(',');
            rowData[col.name] = values.map((v: string) => {
              const option = col.settings?.options?.find((opt: any) => opt.value === v);
              return option ? option.label : v;
            }).join(', ');
          } else {
            const option = col.settings?.options?.find((opt: any) => opt.value === value);
            rowData[col.name] = option ? option.label : value;
          }
          return;
        }
        
        // Handle checkboxes
        if (col.type === 'checkbox') {
          rowData[col.name] = value === 'true' ? 'Yes' : 'No';
          return;
        }
        
        // Handle currency
        if (col.type === 'currency') {
          rowData[col.name] = value ? parseFloat(value) : '';
          return;
        }
        
        // Handle numbers
        if (col.type === 'number' || col.type === 'percent') {
          rowData[col.name] = value ? parseFloat(value) : '';
          return;
        }
        
        // Handle dates
        if (col.type === 'date' || col.type === 'datetime') {
          rowData[col.name] = value || '';
          return;
        }
        
        rowData[col.name] = value || '';
      });
      return rowData;
    });

    // Create workbook
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, table.name.substring(0, 31)); // Excel sheet name limit

    // Auto-size columns
    const colWidths = headers.map((header: any, i: number) => {
      const maxLength = Math.max(
        header.length,
        ...data.map((row: any) => String(Object.values(row)[i] || '').length)
      );
      return { wch: Math.min(maxLength + 2, 50) };
    });
    ws['!cols'] = colWidths;

    // Download
    XLSX.writeFile(wb, `${table.name}-${new Date().toISOString().split('T')[0]}.xlsx`);
    
    setIsOpen(false);
  }

  // Get selected row objects
  const selectedRowObjects = allRows.filter(row => selectedRows.includes(row.id));

  return (
    <div className="relative ml-auto" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Export</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Export Options</span>
          </div>
          
          {/* Selected Rows (if any) */}
          {selectedRows.length > 0 && (
            <>
              <div className="p-2">
                <div className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">Selected Rows ({selectedRows.length})</div>
                <button
                  onClick={() => exportToCSV(selectedRowObjects)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Export as CSV</span>
                </button>
                <button
                  onClick={() => exportToExcel(selectedRowObjects)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Export as Excel</span>
                </button>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
            </>
          )}

          {/* Current View */}
          <div className="p-2">
            <div className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">Current View ({filteredRows.length} rows)</div>
            <button
              onClick={() => exportToCSV(filteredRows)}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Export as CSV</span>
            </button>
            <button
              onClick={() => exportToExcel(filteredRows)}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Export as Excel</span>
            </button>
          </div>

          {/* All Data */}
          {filteredRows.length !== allRows.length && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
              <div className="p-2">
                <div className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">All Data ({allRows.length} rows)</div>
                <button
                  onClick={() => exportToCSV(allRows)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Export all as CSV</span>
                </button>
                <button
                  onClick={() => exportToExcel(allRows)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Export all as Excel</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}