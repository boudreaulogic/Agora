'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function ImportCSVButton({ tableId }: { tableId: string }) {
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if CSV
    if (!file.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    setIsImporting(true);

    try {
      // Read file
      const text = await file.text();
      
      // Parse CSV
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        alert('CSV file is empty or invalid');
        setIsImporting(false);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map(line => {
        // Simple CSV parsing (doesn't handle quotes with commas inside)
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const rowData: any = {};
        headers.forEach((header, i) => {
          rowData[header] = values[i] || '';
        });
        return rowData;
      });

      // Import directly
      const response = await fetch(`/api/tables/${tableId}/import-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, rows }),
      });

      if (response.ok) {
        const result = await response.json();
        router.refresh();
        alert(`Successfully imported ${result.imported} rows!`);
      } else {
        const error = await response.json();
        alert(`Failed to import: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Error importing CSV');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
        className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span>{isImporting ? 'Importing...' : 'Import CSV'}</span>
      </button>
    </>
  );
}