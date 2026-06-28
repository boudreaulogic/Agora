'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { evaluateFormula } from '@/lib/formula';
import { LinkedRecordPicker } from './LinkedRecordPicker';
import { AttachmentCell } from './AttachmentCell';
import { validateColumnValue } from '@/lib/columnValidation';

export function EditableCell({
  rowId,
  columnId,
  columnType,
  columnSettings,
  columnFormula,
  column,
  initialValue,
  tableId,
  onCellUpdate,
  wsSend,
  userColor,
  session,
  allColumns,
  rowData,
  lookupValues,
  rollupValue,
  readOnly = false,
  onRowLockChange,
}: {
  rowId: string;
  columnId: string;
  columnType: string;
  columnSettings?: any;
  columnFormula?: string;
  column?: any;
  initialValue: any;
  tableId: string;
  onCellUpdate?: (rowId: string, columnId: string, value: any) => void;
  wsSend: (message: any) => void;
  userColor: string;
  session: any;
  allColumns?: any[];
  rowData?: any;
  lookupValues?: any[];
  rollupValue?: any;
  readOnly?: boolean;
  onRowLockChange?: (rowId: string, locked: boolean) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue || '');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const justSavedRef = useRef(false);
  const cellId = `${rowId}-${columnId}`;
  const [validationError, setValidationError] = useState<string | null>(null);

  // Calculate formula value if this is a formula column
  const calculatedValue = useMemo(() => {
    if (columnType !== 'formula' || !columnFormula || !allColumns || !rowData) {
      return null;
    }

    const result = evaluateFormula(columnFormula, rowData, allColumns);
    
    if (!result.success) {
      return { error: result.error };
    }

    return { value: result.value };
  }, [columnType, columnFormula, allColumns, rowData]);

  // Sync with prop changes from WebSocket
  useEffect(() => {
    if (justSavedRef.current) {
      justSavedRef.current = false;
      return;
    }
    
    if (!isEditing) {
      setValue(initialValue || '');
    }
  }, [initialValue, isEditing]);
  
  // Clear validation error when entering edit mode
  useEffect(() => {
    if (isEditing) setValidationError(null);
  }, [isEditing]);

  // Broadcast focus/blur events
  useEffect(() => {
    if (isEditing && session?.user) {
      wsSend({
        type: 'cell-focus',
        cellId,
        userName: session.user.name || session.user.email || 'Anonymous',
        color: userColor,
      });

      return () => {
        wsSend({
          type: 'cell-blur',
          cellId,
        });
      };
    }
  }, [isEditing, cellId, session?.user, wsSend, userColor]);

  async function handleSave(newValue: any, shouldClose: boolean = true) {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
 
    // Validate before saving
    if (newValue !== '' && newValue !== null && newValue !== undefined) {
      var validation = validateColumnValue(newValue, columnType, columnSettings);
      if (!validation.valid) {
        setValidationError(validation.error || 'Invalid value');
        return;
      }
      newValue = validation.sanitized !== undefined ? validation.sanitized : newValue;
      setValidationError(null);
    } else {
      setValidationError(null);
    }
 
    try {
      const response = await fetch(`/api/tables/${tableId}/rows/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId,
          value: newValue,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Failed to save! ${error.error || 'Unknown error'}`);
        return;
      }

      const updatedRow = await response.json();

      setValue(newValue);
      justSavedRef.current = true;
      
      if (shouldClose) {
        setIsEditing(false);
      }

      if (onCellUpdate) {
        onCellUpdate(rowId, columnId, newValue);
      }

      // If row got locked (e.g. approval triggered), update local state
      if (updatedRow.isLocked) {
        if (onRowLockChange) onRowLockChange(rowId, true);
        // Update approval column data if it changed
        if (updatedRow.data && onCellUpdate) {
          const newData = updatedRow.data as Record<string, any>;
          Object.keys(newData).forEach(key => {
            if (key !== columnId && newData[key] !== initialValue) {
              onCellUpdate(rowId, key, newData[key]);
            }
          });
        }
      }
    } catch (error) {
      console.error('Error saving:', error);
      alert('Error saving! Check console.');
    }
  }

  function handleDebouncedSave(newValue: any) {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleSave(newValue, false);
    }, 2500);
  }

  // Helper to render display value based on type
  function renderDisplayValue() {
    // Handle lookup columns
    if (columnType === 'lookup') {
      if (!lookupValues || lookupValues.length === 0) {
        return <span className="text-gray-400 dark:text-gray-500">—</span>;
      }
      const formatVal = (val: any) => {
        const ft = columnSettings?.lookupFieldType;
        if (ft === 'currency') return `$${parseFloat(val).toFixed(2)}`;
        if (ft === 'percent') return `${val}%`;
        if (ft === 'checkbox') return val === 'true' ? '☑️' : '☐';
        if (ft === 'rating') return '⭐'.repeat(parseInt(val) || 0);
        return String(val);
      };
      return (
        <div className="flex flex-wrap gap-1">
          {lookupValues.map((val: any, i: number) => (
            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
              {formatVal(val)}
            </span>
          ))}
        </div>
      );
    }

    // Handle rollup columns
    if (columnType === 'rollup') {
      if (rollupValue === null || rollupValue === undefined) {
        return <span className="text-gray-400 dark:text-gray-500">—</span>;
      }
      const fn = columnSettings?.rollupFunction || column?.rollupFunction || '';
      const formatVal = (val: any) => {
        const ft = columnSettings?.rollupFieldType;
        if (fn === 'COUNT' || fn === 'COUNTA') return String(val);
        if (ft === 'currency') return `$${parseFloat(val).toFixed(2)}`;
        if (ft === 'percent') return `${val}%`;
        if (typeof val === 'number') return val % 1 === 0 ? String(val) : val.toFixed(2);
        return String(val);
      };
      const fnLabel = fn === 'COUNT' ? '#' : fn === 'COUNTA' ? '#' : fn === 'SUM' ? 'Σ' : fn === 'AVG' ? 'x̄' : fn === 'MIN' ? '↓' : fn === 'MAX' ? '↑' : '';
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
          <span className="mr-1 font-bold">{fnLabel}</span>
          {formatVal(rollupValue)}
        </span>
      );
    }

    // Handle formula columns
    if (columnType === 'formula') {
      if (!calculatedValue) {
        return <span className="text-gray-400 dark:text-gray-500 italic">No formula</span>;
      }
      
      if (calculatedValue.error) {
        return (
          <span className="text-red-600 text-xs" title={calculatedValue.error}>
            ⚠️ Error
          </span>
        );
      }

      const displayValue = calculatedValue.value;
      const format = columnSettings?.format || 'number';
      
      if (typeof displayValue === 'number') {
        switch (format) {
          case 'currency':
            return <span className="font-mono">${displayValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
          
          case 'percent':
            return <span className="font-mono">{displayValue.toFixed(2)}%</span>;
          
          case 'duration':
            const hours = Math.floor(displayValue / 60);
            const minutes = Math.round(displayValue % 60);
            return <span className="font-mono">{hours}h {minutes}m</span>;
          
          case 'number':
          default:
            return <span className="font-mono">{displayValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>;
        }
      }
      
      if (typeof displayValue === 'boolean') {
        return displayValue ? '☑️ True' : '☐ False';
      }
      
      return <span>{String(displayValue)}</span>;
    }

    // Handle linked_record
    if (columnType === 'linked_record') {
      if (!value) {
        return <span className="text-gray-400 dark:text-gray-500 text-sm">🔗 Select...</span>;
      }
      return (
        <div className="flex items-center space-x-1.5">
          <span className="text-blue-600 text-xs">🔗</span>
          <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{value.length > 25 ? value.slice(0, 8) + '...' : value}</span>
        </div>
      );
    }

	if (!value) {
		  return <span className="text-gray-400 dark:text-gray-500">{readOnly ? '—' : 'Click to edit'}</span>;
		}

    switch (columnType) {
      case 'checkbox':
        return value === 'true' || value === true ? '☑️' : '☐';
      
      case 'select':
        const option = columnSettings?.options?.find((opt: any) => opt.value === value);
        return option ? (
          <span 
            className="inline-flex items-center px-2 py-1 rounded text-xs font-medium text-white"
            style={{ backgroundColor: option.color }}
          >
            {option.label}
          </span>
        ) : value;
      
      case 'multi_select':
        const values = Array.isArray(value) ? value : (value ? value.split(',') : []);
        return (
          <div className="flex flex-wrap gap-1">
            {values.map((val: string, i: number) => {
              const opt = columnSettings?.options?.find((o: any) => o.value === val);
              return opt ? (
                <span 
                  key={i}
                  className="inline-flex items-center px-2 py-1 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: opt.color }}
                >
                  {opt.label}
                </span>
              ) : val;
            })}
          </div>
        );
      
      case 'rating':
        const rating = parseInt(value) || 0;
        return '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
      
      case 'percent':
        return (
          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, parseFloat(value) || 0))}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400">{value}%</span>
          </div>
        );
      
      case 'progress':
        return (
          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, parseFloat(value) || 0))}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400">{value}%</span>
          </div>
        );
      
      case 'currency':
        const amount = parseFloat(value) || 0;
        return `$${amount.toFixed(2)}`;
      
      case 'color':
        return (
          <div className="flex items-center space-x-2">
            <div 
              className="w-6 h-6 rounded border border-gray-300"
              style={{ backgroundColor: value }}
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>
          </div>
        );
      
      case 'email':
        return <a href={`mailto:${value}`} className="text-blue-600 hover:underline">{value}</a>;
      
      case 'url':
        return <a href={value && (value.startsWith('http://') || value.startsWith('https://')) ? value : '#'} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{value}</a>;
      
      case 'phone':
        return <a href={`tel:${value}`} className="text-blue-600 hover:underline">{value}</a>;

      default:
        return <span>{value}</span>;
    }
  }

  // Read-only mode — block ALL interaction for every column type
  if (readOnly) {
    // Attachment columns
    if (columnType === 'attachment') {
      return <AttachmentCell tableId={tableId} rowId={rowId} columnId={columnId} readOnly={true} compact={true} />;
    }
    // Linked records need the picker to resolve display names
    if (columnType === 'linked_record' && value) {
      return (
        <LinkedRecordPicker
          linkedTableId={column?.linkedTableId || ''}
          displayColumnId={column?.linkedDisplayColumnId || column?.settings?.displayColumnId}
          currentValue={value}
          disabled={true}
          onChange={() => {}}
        />
      );
    }
    return (
      <div className="w-full h-full cursor-default select-none">
        {renderDisplayValue()}
      </div>
    );
  }

  // Formula columns are read-only
  if (columnType === 'formula') {
    return (
      <div className="w-full h-full bg-gray-50 dark:bg-gray-800/50 px-2 py-1 text-gray-700 dark:text-gray-300 italic cursor-not-allowed">
        {renderDisplayValue()}
      </div>
    );
  }

  // Lookup columns are read-only
  if (columnType === 'lookup') {
    if (!lookupValues || lookupValues.length === 0) {
      return (
        <div className="w-full h-full bg-purple-50/30 px-2 py-1 text-gray-400 cursor-not-allowed">
          —
        </div>
      );
    }

    const formatLookupValue = (val: any) => {
      const fieldType = columnSettings?.lookupFieldType;
      if (fieldType === 'currency') return `$${parseFloat(val).toFixed(2)}`;
      if (fieldType === 'percent') return `${val}%`;
      if (fieldType === 'checkbox') return val === 'true' ? '☑️' : '☐';
      if (fieldType === 'rating') return '⭐'.repeat(parseInt(val) || 0);
      return String(val);
    };

    return (
      <div className="w-full h-full bg-purple-50/30 px-2 py-1 cursor-not-allowed">
        <div className="flex flex-wrap gap-1">
          {lookupValues.map((val, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200"
            >
              {formatLookupValue(val)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Rollup columns are read-only
  if (columnType === 'rollup') {
    const fn = columnSettings?.rollupFunction || column?.rollupFunction || '';
    
    if (rollupValue === null || rollupValue === undefined) {
      return (
        <div className="w-full h-full bg-green-50/30 px-2 py-1 text-gray-400 cursor-not-allowed">
          —
        </div>
      );
    }

    const formatRollupValue = (val: any) => {
      const fieldType = columnSettings?.rollupFieldType;
      if (fn === 'COUNT' || fn === 'COUNTA') {
        return String(val);
      }
      if (fieldType === 'currency') return `$${parseFloat(val).toFixed(2)}`;
      if (fieldType === 'percent') return `${val}%`;
      if (typeof val === 'number') {
        return val % 1 === 0 ? String(val) : val.toFixed(2);
      }
      return String(val);
    };

    const fnLabel = fn === 'COUNT' ? '#' 
      : fn === 'COUNTA' ? '#' 
      : fn === 'SUM' ? 'Σ' 
      : fn === 'AVG' ? 'x̄' 
      : fn === 'MIN' ? '↓' 
      : fn === 'MAX' ? '↑' 
      : '';

    return (
      <div className="w-full h-full bg-green-50/30 px-2 py-1 cursor-not-allowed">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
          <span className="mr-1 font-bold">{fnLabel}</span>
          {formatRollupValue(rollupValue)}
        </span>
      </div>
    );
  }
  
  // Attachment columns
  if (columnType === 'attachment') {
    return <AttachmentCell tableId={tableId} rowId={rowId} columnId={columnId} readOnly={readOnly} />;
  }
  
	// Linked record columns — dropdown picker
  if (columnType === 'linked_record') {
    return (
      <LinkedRecordPicker
        linkedTableId={column?.linkedTableId || ''}
        displayColumnId={column?.linkedDisplayColumnId || column?.settings?.displayColumnId}
        currentValue={value || ''}
        disabled={readOnly}
        onChange={async (linkedRowId, displayValue) => {
          try {
            await fetch(`/api/tables/${tableId}/rows/${rowId}/link/${columnId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ linkedRowId }),
            });
          } catch (err) {
            console.error('Error updating link:', err);
          }

          const newVal = linkedRowId || '';
          setValue(newVal);
          justSavedRef.current = true;
          if (onCellUpdate) onCellUpdate(rowId, columnId, newVal);
          
          wsSend({
            type: 'cell-update',
            rowId,
            columnId,
            value: newVal,
          });
        }}
      />
    );
  }

	// Display mode
	if (!isEditing) {
     return (
       <div
         onClick={() => setIsEditing(true)}
         className="w-full h-full cursor-pointer group"
       >
         {renderDisplayValue()}
         <span className="ml-2 opacity-0 group-hover:opacity-100 text-xs text-blue-600">✎</span>
       </div>
    );
  }

  // Edit mode - TEXT types with debouncing
  if (['text', 'email', 'url', 'phone', 'long_text', 'duration'].includes(columnType)) {
    const Component = columnType === 'long_text' ? 'textarea' : 'input';
    const inputType = columnType === 'email' ? 'email' : columnType === 'url' ? 'url' : columnType === 'phone' ? 'tel' : 'text';
 
    return (
      <div className="relative">
      <Component
        type={Component === 'input' ? inputType : undefined}
        autoFocus
        defaultValue={value}
        onChange={(e: any) => handleDebouncedSave(e.target.value)}
        onBlur={(e: any) => {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          handleSave(e.target.value, true);
        }}
        onKeyDown={(e: any) => {
          if (e.key === 'Enter' && columnType !== 'long_text') {
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
            }
            handleSave(e.currentTarget.value, true);
          }
          if (e.key === 'Escape') {
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
            }
            setIsEditing(false);
          }
        }}
        className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows={columnType === 'long_text' ? 3 : undefined}
        placeholder={columnType === 'url' ? 'https://' : columnType === 'duration' ? 'e.g., 1h 30m' : columnType === 'email' ? 'email@example.com' : columnType === 'phone' ? '(555) 123-4567' : undefined}
      />
      {validationError && <div className="absolute top-full left-0 right-0 mt-1 px-2 py-1 bg-red-50 border border-red-200 rounded text-[10px] text-red-600 z-50 shadow-sm">{validationError}</div>}
      </div>
    );
  }

  // Edit mode - NUMBER types with debouncing
  if (['number', 'currency', 'percent', 'progress'].includes(columnType)) {
    return (
      <div className="relative">
      <input
        type="number"
        step={columnType === 'currency' ? '0.01' : '1'}
        min={['percent', 'progress'].includes(columnType) ? '0' : undefined}
        max={['percent', 'progress'].includes(columnType) ? '100' : undefined}
        autoFocus
        defaultValue={value}
        onChange={(e) => handleDebouncedSave(e.target.value)}
        onBlur={(e) => {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          handleSave(e.target.value, true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
            }
            handleSave(e.currentTarget.value, true);
          }
          if (e.key === 'Escape') {
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
            }
            setIsEditing(false);
          }
        }}
        className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {validationError && <div className="absolute top-full left-0 right-0 mt-1 px-2 py-1 bg-red-50 border border-red-200 rounded text-[10px] text-red-600 z-50 shadow-sm">{validationError}</div>}
      </div>
    );
  }

  // Edit mode - DATE/DATETIME
  if (['date', 'datetime'].includes(columnType)) {
    return (
      <input
        type={columnType === 'datetime' ? 'datetime-local' : 'date'}
        autoFocus
        defaultValue={value}
        onChange={(e) => handleSave(e.target.value)}
        onBlur={() => setIsEditing(false)}
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

  // Edit mode - COLOR
  if (columnType === 'color') {
    return (
      <input
        type="color"
        autoFocus
        defaultValue={value || '#3B82F6'}
        onChange={(e) => handleSave(e.target.value)}
        onBlur={() => setIsEditing(false)}
        className="w-full h-10 border border-blue-500 rounded cursor-pointer"
      />
    );
  }

  // Edit mode - RATING
  if (columnType === 'rating') {
    return (
      <select
        autoFocus
        defaultValue={value || '0'}
        onChange={(e) => {
          const newVal = e.target.value;
          setValue(newVal);
          justSavedRef.current = true;
          setIsEditing(false);
          if (onCellUpdate) onCellUpdate(rowId, columnId, newVal);
          handleSave(newVal, false);
        }}
        onBlur={() => setIsEditing(false)}
        className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="0">☆☆☆☆☆</option>
        <option value="1">⭐☆☆☆☆</option>
        <option value="2">⭐⭐☆☆☆</option>
        <option value="3">⭐⭐⭐☆☆</option>
        <option value="4">⭐⭐⭐⭐☆</option>
        <option value="5">⭐⭐⭐⭐⭐</option>
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
        onChange={(e) => {
          const newVal = e.target.checked.toString();
          setValue(newVal);
          justSavedRef.current = true;
          setIsEditing(false);
          if (onCellUpdate) onCellUpdate(rowId, columnId, newVal);
          handleSave(newVal, false);
        }}
        onBlur={() => setIsEditing(false)}
        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
      />
    );
  }

  // Edit mode - SELECT
  if (columnType === 'select' && columnSettings?.options) {
    return (
      <select
        autoFocus
        defaultValue={value}
        onChange={(e) => {
          const newVal = e.target.value;
          setValue(newVal);
          justSavedRef.current = true;
          setIsEditing(false);
          if (onCellUpdate) onCellUpdate(rowId, columnId, newVal);
          handleSave(newVal, false);
        }}
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

  // Edit mode - MULTI SELECT
  if (columnType === 'multi_select' && columnSettings?.options) {
    const currentValues = Array.isArray(value) ? value : (value ? value.split(',') : []);
    
    return (
      <div className="border border-blue-500 rounded p-2 bg-white dark:bg-gray-800 max-h-32 overflow-y-auto">
        {columnSettings.options.map((opt: any) => (
          <label key={opt.value} className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
            <input
              type="checkbox"
              defaultChecked={currentValues.includes(opt.value)}
              onChange={(e) => {
                const newValues = e.target.checked
                  ? [...currentValues, opt.value]
                  : currentValues.filter((v: string) => v !== opt.value);
                handleSave(newValues.join(','));
              }}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm">{opt.label}</span>
          </label>
        ))}
      </div>
    );
  }

  // Edit mode - USER
  if (columnType === 'user') {
    return (
      <input
        type="text"
        autoFocus
        defaultValue={value}
        onChange={(e) => handleDebouncedSave(e.target.value)}
        onBlur={(e) => {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          handleSave(e.target.value, true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
            }
            handleSave(e.currentTarget.value, true);
          }
          if (e.key === 'Escape') {
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
            }
            setIsEditing(false);
          }
        }}
        placeholder="Enter username"
        className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  // Fallback
  return <span className="text-gray-400">Unsupported type: {columnType}</span>;
}