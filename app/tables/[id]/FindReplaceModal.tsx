'use client';

import { useState, useEffect } from 'react';

interface Match {
  rowId: string;
  columnId: string;
  value: string;
  rowIndex: number;
  columnName: string;
}

interface FindReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  columns: any[];
  onReplace: (rowId: string, columnId: string, newValue: string) => void;
  onReplaceAll: (matches: Match[], findValue: string, replaceValue: string, matchCase: boolean) => void;
  onNavigate: (rowId: string, columnId: string) => void;
  readOnly?: boolean;
}

export function FindReplaceModal({
  isOpen,
  onClose,
  rows,
  columns,
  onReplace,
  onReplaceAll,
  onNavigate,
  readOnly = false,
}: FindReplaceModalProps) {
  const [findValue, setFindValue] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeCell, setMatchWholeCell] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matches, setMatches] = useState<Match[]>([]);

  // Find matches whenever search params change
  useEffect(() => {
    if (!findValue) {
      setMatches([]);
      setCurrentMatchIndex(0);
      return;
    }

    const newMatches: Match[] = [];
    
    rows.forEach((row, rowIndex) => {
      columns.forEach((column) => {
        const cellValue = String(row.data?.[column.id] || '');
        const searchValue = matchCase ? findValue : findValue.toLowerCase();
        const compareValue = matchCase ? cellValue : cellValue.toLowerCase();

        let isMatch = false;
        if (matchWholeCell) {
          isMatch = compareValue === searchValue;
        } else {
          isMatch = compareValue.includes(searchValue);
        }

        if (isMatch) {
          newMatches.push({
            rowId: row.id,
            columnId: column.id,
            value: cellValue,
            rowIndex,
            columnName: column.name,
          });
        }
      });
    });

    setMatches(newMatches);
    setCurrentMatchIndex(0);
  }, [findValue, matchCase, matchWholeCell, rows, columns]);

  // Navigate to current match
  useEffect(() => {
    if (matches.length > 0 && matches[currentMatchIndex]) {
      const match = matches[currentMatchIndex];
      onNavigate(match.rowId, match.columnId);
    }
  }, [currentMatchIndex, matches, onNavigate]);

  function handleNext() {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  }

  function handlePrevious() {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }

  function handleReplace() {
    if (matches.length === 0 || !matches[currentMatchIndex]) return;
    
    const match = matches[currentMatchIndex];
    const newValue = match.value.replace(
      new RegExp(findValue, matchCase ? 'g' : 'gi'),
      replaceValue
    );
    
    onReplace(match.rowId, match.columnId, newValue);
    
    // Move to next match
    handleNext();
  }

  function handleReplaceAll() {
    if (matches.length === 0) return;
    onReplaceAll(matches, findValue, replaceValue, matchCase);
    setMatches([]);
    setCurrentMatchIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handlePrevious();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleNext();
    }
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Find and Replace</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4" onKeyDown={handleKeyDown}>
          {/* Find Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Find
            </label>
            <input
              type="text"
              value={findValue}
              onChange={(e) => setFindValue(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Replace Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Replace with
            </label>
            <input
              type="text"
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              placeholder="Replace..."
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
              />
              <span className="text-gray-700">Match case</span>
            </label>
            <label className="flex items-center space-x-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={matchWholeCell}
                onChange={(e) => setMatchWholeCell(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
              />
              <span className="text-gray-700">Match whole cell</span>
            </label>
          </div>

          {/* Match Counter */}
          {findValue && (
            <div className="text-sm text-gray-600">
              {matches.length > 0 ? (
                <>
                  <span className="font-medium">{currentMatchIndex + 1}</span> of{' '}
                  <span className="font-medium">{matches.length}</span> matches
                </>
              ) : (
                <span>No matches found</span>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrevious}
              disabled={matches.length === 0}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <button
              onClick={handleNext}
              disabled={matches.length === 0}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>

          {/* Replace Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleReplace}
              disabled={matches.length === 0}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Replace
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={matches.length === 0}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Replace All
            </button>
          </div>
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg text-xs text-gray-500">
          Press <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded">Enter</kbd> for next,{' '}
          <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded">Shift+Enter</kbd> for previous
        </div>
      </div>
    </>
  );
}