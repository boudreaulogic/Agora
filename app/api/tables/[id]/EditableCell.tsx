'use client';

import { useState } from 'react';

export function EditableCell({
  rowId,
  columnId,
  columnType,
  columnSettings,
  initialValue,
  tableId,
}: {
  rowId: string;
  columnId: string;
  columnType: string;
  columnSettings?: any;
  initialValue: any;
  tableId: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue || '');

  async function handleSave(newValue: any) {
    console.log('💾 Attempting to save:', { tableId, rowId, columnId, newValue });
    
    try {
      const url = `/api/tables/${tableId}/rows/${rowId}`;
      console.log('📡 Fetching:', url);
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId,
          value: newValue,
        }),
      });

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Failed to save:', error);
        alert(`Failed to save! ${error.error || 'Unknown error'}`);
        return;
      }

      const result = await response.json();
      console.log('✅ Saved successfully!', result);
      
      setValue(newValue);
      setIsEditing(false);
    } catch (error) {
      console.error('💥 Error saving:', error);
      alert('Error saving! Check console.');
    }
  }

  // Display mode
  if (!isEditing) {
    return (
      <div
        onClick={() => setIsEditing(true)}
        className="w-full h-full cursor-pointer group"
      >
        {value ? (
          <span>{value}</span>
        ) : (
          <span className="text-gray-400">Click to edit</span>
        )}
        <span className="ml-2 opacity-0 group-hover:opacity-100 text-xs text-blue-600">✎</span>
      </div>
    );
  }

  // Edit mode - TEXT
  if (columnType === 'text') {
    return (
      <input
        type="text"
        autoFocus
        defaultValue={value}
        onBlur={(e) => handleSave(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSave(e.currentTarget.value);
          }
          if (e.key === 'Escape') {
            setIsEditing(false);
          }
        }}
        className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  // Edit mode - NUMBER
  if (columnType === 'number') {
    return (
      <input
        type="number"
        autoFocus
        defaultValue={value}
        onBlur={(e) => handleSave(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSave(e.currentTarget.value);
          }
          if (e.key === 'Escape') {
            setIsEditing(false);
          }
        }}
        className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  // Edit mode - DATE
  if (columnType === 'date') {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value}
        onBlur={(e) => handleSave(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSave(e.currentTarget.value);
          }
          if (e.key === 'Escape') {
            setIsEditing(false);
          }
        }}
        className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  // Edit mode - SELECT (dropdown)
  if (columnType === 'select' && columnSettings?.options) {
    return (
      <select
        autoFocus
        defaultValue={value}
        onChange={(e) => handleSave(e.target.value)}
        onBlur={() => setIsEditing(false)}
        className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Select...</option>
        {columnSettings.options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  // Edit mode - CHECKBOX
  if (columnType === 'checkbox') {
    return (
      <input
        type="checkbox"
        autoFocus
        defaultChecked={value === 'true' || value === true}
        onChange={(e) => handleSave(e.target.checked.toString())}
        onBlur={() => setIsEditing(false)}
        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
      />
    );
  }

  // Fallback
  return <span className="text-gray-400">Unsupported type</span>;
}