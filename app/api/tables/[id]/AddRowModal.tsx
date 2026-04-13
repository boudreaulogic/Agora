'use client';

import { useState } from 'react';

export function AddRowModal({ 
  tableId, 
  columns 
}: { 
  tableId: string; 
  columns: Array<{ id: string; name: string; type: string; settings?: any }>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Build row data object
    const rowData: any = {};
    columns.forEach((col) => {
      const value = formData.get(col.id);
      if (value) {
        rowData[col.id] = value;
      }
    });

    // Call server action
    const response = await fetch(`/api/tables/${tableId}/rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: rowData }),
    });

    if (response.ok) {
      setIsOpen(false);
      window.location.reload(); // Refresh to show new row
    }
  }

  return (
    <>
      {/* Trigger Buttons */}
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
      >
        + Add Row
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add New Row</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {columns.map((column) => (
                <div key={column.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {column.name}
                  </label>
                  
                  {/* Text field */}
                  {column.type === 'text' && (
                    <input
                      type="text"
                      name={column.id}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={`Enter ${column.name.toLowerCase()}`}
                    />
                  )}

                  {/* Select field */}
                  {column.type === 'select' && column.settings?.options && (
                    <select
                      name={column.id}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select an option...</option>
                      {column.settings.options.map((opt: any) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Date field */}
                  {column.type === 'date' && (
                    <input
                      type="date"
                      name={column.id}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  )}

                  {/* Number field */}
                  {column.type === 'number' && (
                    <input
                      type="number"
                      name={column.id}
                      step="any"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={`Enter ${column.name.toLowerCase()}`}
                    />
                  )}

                  {/* Checkbox field */}
                  {column.type === 'checkbox' && (
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name={column.id}
                        value="true"
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-600">Check if yes</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Buttons */}
              <div className="flex items-center justify-end space-x-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Row
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}