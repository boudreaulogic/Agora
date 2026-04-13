'use client';

import { useState } from 'react';

export function ImportDuplicateModal({
  duplicates,
  newRows,
  onImport,
  onCancel,
}: {
  duplicates: number;
  newRows: number;
  onImport: (mode: 'all' | 'skip' | 'new') => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'skip' | 'all'>('skip');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Duplicate Rows Detected</h2>
              <p className="text-sm text-gray-600 mt-1">
                {duplicates === 0 
                  ? 'All rows are new!'
                  : `Found ${duplicates} duplicate row${duplicates !== 1 ? 's' : ''} already in the table`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Stats */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Total rows in CSV:</span>
              <span className="font-semibold text-gray-900">{duplicates + newRows}</span>
            </div>
            {duplicates > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">⚠️ Duplicate rows:</span>
                <span className="font-semibold text-yellow-700">{duplicates}</span>
              </div>
            )}
            {newRows > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">✅ New rows:</span>
                <span className="font-semibold text-green-700">{newRows}</span>
              </div>
            )}
          </div>

          {/* Options */}
          {duplicates > 0 ? (
            <div className="space-y-3">
              <label 
                className="flex items-start space-x-3 cursor-pointer p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors"
                style={{ borderColor: mode === 'skip' ? '#3B82F6' : '#E5E7EB' }}
              >
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === 'skip'}
                  onChange={() => setMode('skip')}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">✅ Skip duplicates (Recommended)</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Import only {newRows} new row{newRows !== 1 ? 's' : ''}
                  </div>
                </div>
              </label>

              <label 
                className="flex items-start space-x-3 cursor-pointer p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors"
                style={{ borderColor: mode === 'all' ? '#3B82F6' : '#E5E7EB' }}
              >
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === 'all'}
                  onChange={() => setMode('all')}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">⚠️ Import all (Creates duplicates)</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Import all {duplicates + newRows} rows, creating {duplicates} duplicate{duplicates !== 1 ? 's' : ''}
                  </div>
                </div>
              </label>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="font-medium text-green-900">All clear!</div>
                  <div className="text-sm text-green-700 mt-1">
                    No duplicates found. All {newRows} rows will be imported.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onImport(duplicates > 0 ? mode : 'all')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>
              {duplicates > 0 
                ? (mode === 'skip' ? `Import ${newRows} new row${newRows !== 1 ? 's' : ''}` : 'Import all rows')
                : `Import ${newRows} row${newRows !== 1 ? 's' : ''}`
              }
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}