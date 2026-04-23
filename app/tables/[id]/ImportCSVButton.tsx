'use client';
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface ColumnInfo {
  id: string;
  name: string;
  type: string;
}

interface MappingResult {
  csvHeader: string;
  matchedColumn: ColumnInfo | null;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  var lines: string[] = [];
  var current = '';
  var inQuotes = false;

  // Split by lines respecting quoted fields
  for (var i = 0; i < text.length; i++) {
    var ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim()) {
        lines.push(current);
      }
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    lines.push(current);
  }

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  function parseLine(line: string): string[] {
    var fields: string[] = [];
    var field = '';
    var quoted = false;

    for (var j = 0; j < line.length; j++) {
      var c = line[j]!;
      if (c === '"') {
        if (quoted && line[j + 1] === '"') {
          field += '"';
          j++;
        } else {
          quoted = !quoted;
        }
      } else if (c === ',' && !quoted) {
        fields.push(field.trim());
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field.trim());
    return fields;
  }

  var headers = parseLine(lines[0]!);
  var rows = lines.slice(1).map(function(line) {
    var values = parseLine(line);
    var rowData: Record<string, string> = {};
    headers.forEach(function(header, idx) {
      rowData[header] = values[idx] || '';
    });
    return rowData;
  });

  return { headers, rows };
}

export function ImportCSVButton({ tableId, columns }: { tableId: string; columns: ColumnInfo[] }) {
  var [isImporting, setIsImporting] = useState(false);
  var [showPreview, setShowPreview] = useState(false);
  var [mappings, setMappings] = useState<MappingResult[]>([]);
  var [parsedData, setParsedData] = useState<{ headers: string[]; rows: Record<string, string>[] }>({ headers: [], rows: [] });
  var fileInputRef = useRef<HTMLInputElement>(null);
  var router = useRouter();

  var handleFileSelect = useCallback(function(event: React.ChangeEvent<HTMLInputElement>) {
    var file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    file.text().then(function(text) {
      var parsed = parseCSV(text);

      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        alert('CSV file is empty or invalid');
        return;
      }

      // Build mappings by matching CSV headers to table columns (case-insensitive)
      var mappingResults: MappingResult[] = parsed.headers.map(function(csvHeader) {
        var match = columns.find(function(col) {
          return col.name.toLowerCase() === csvHeader.toLowerCase();
        });
        return {
          csvHeader: csvHeader,
          matchedColumn: match || null,
        };
      });

      setParsedData(parsed);
      setMappings(mappingResults);
      setShowPreview(true);
    }).catch(function() {
      alert('Error reading file');
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [columns]);

  var handleImport = useCallback(function() {
    var matched = mappings.filter(function(m) { return m.matchedColumn !== null; });
    if (matched.length === 0) {
      alert('No columns matched. Please check your CSV headers match the table column names.');
      return;
    }

    setIsImporting(true);

    // Only send matched columns
    var filteredHeaders = matched.map(function(m) { return m.csvHeader; });
    var filteredRows = parsedData.rows.map(function(row) {
      var filtered: Record<string, string> = {};
      matched.forEach(function(m) {
        filtered[m.csvHeader] = row[m.csvHeader] || '';
      });
      return filtered;
    });

    fetch('/api/tables/' + tableId + '/import-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers: filteredHeaders, rows: filteredRows }),
    })
      .then(function(response) {
        if (response.ok) {
          return response.json().then(function(result: any) {
            router.refresh();
            setShowPreview(false);
            alert('Successfully imported ' + result.imported + ' rows!');
          });
        } else {
          return response.json().then(function(error: any) {
            alert('Failed to import: ' + (error.error || 'Unknown error'));
          });
        }
      })
      .catch(function(error) {
        console.error('Import error:', error);
        alert('Error importing CSV');
      })
      .finally(function() {
        setIsImporting(false);
      });
  }, [mappings, parsedData, tableId, router]);

  var matchedCount = mappings.filter(function(m) { return m.matchedColumn !== null; }).length;
  var unmatchedCount = mappings.filter(function(m) { return m.matchedColumn === null; }).length;

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
        onClick={function() { fileInputRef.current?.click(); }}
        disabled={isImporting}
        className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span>{isImporting ? 'Importing...' : 'Import CSV'}</span>
      </button>

      {/* Mapping Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Import Preview</h3>
              <p className="text-sm text-gray-500 mt-1">
                {parsedData.rows.length} rows found in CSV
              </p>
            </div>

            {/* Column Mapping List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Summary */}
              <div className="flex gap-3 mb-4">
                <div className="flex items-center gap-1.5 text-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-gray-600">{matchedCount} matched</span>
                </div>
                {unmatchedCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <span className="text-gray-600">{unmatchedCount} skipped</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {mappings.map(function(mapping, idx) {
                  var isMatched = mapping.matchedColumn !== null;
                  return (
                    <div
                      key={idx}
                      className={
                        'flex items-center justify-between px-3 py-2.5 rounded-lg border ' +
                        (isMatched
                          ? 'border-green-200 bg-green-50'
                          : 'border-amber-200 bg-amber-50')
                      }
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-gray-700 truncate">
                          {mapping.csvHeader}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isMatched ? (
                          <>
                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span className="text-sm text-green-700 font-medium">
                              {mapping.matchedColumn!.name}
                            </span>
                            <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                              {mapping.matchedColumn!.type}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-amber-600 font-medium">
                            No match — will skip
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={function() { setShowPreview(false); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting || matchedCount === 0}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isImporting
                  ? 'Importing...'
                  : 'Import ' + parsedData.rows.length + ' rows (' + matchedCount + ' columns)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}