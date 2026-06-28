'use client';

import { useState, useEffect } from 'react';
import { LinkedRecordPicker } from './LinkedRecordPicker';
import { validateColumnValue } from '@/lib/columnValidation';

// Column types that are NOT editable by users (computed/system)
const NON_EDITABLE_TYPES = ['formula', 'lookup', 'rollup', 'approval_status', 'attachment'];

export function NewRowPanel({
  tableId,
  columns,
  isOpen,
  onClose,
  onRowCreated,
}: {
  tableId: string;
  columns: any[];
  isOpen: boolean;
  onClose: () => void;
  onRowCreated: (row: any) => void;
}) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Get only editable columns, sorted by position
  const editableColumns = columns
    .filter(c => !c.isSystem && !NON_EDITABLE_TYPES.includes(c.type) && c.showInNewRow !== false)
    .sort((a, b) => a.position - b.position);

  // Initialize form data with default values when panel opens
  useEffect(() => {
    if (isOpen) {
      const defaults: Record<string, any> = {};
      editableColumns.forEach(col => {
        const defaultVal = col.settings?.defaultValue;
        if (defaultVal) {
          if (defaultVal === '__today') {
            defaults[col.id] = col.type === 'datetime'
              ? new Date().toISOString().slice(0, 16)
              : new Date().toISOString().split('T')[0];
          } else {
            defaults[col.id] = defaultVal;
          }
        } else if (col.type === 'checkbox') {
          defaults[col.id] = 'false';
        }
      });
      setFormData(defaults);
      setErrors({});
      setTouched(new Set());
    }
  }, [isOpen]);

  function updateField(columnId: string, value: any) {
    setFormData(prev => ({ ...prev, [columnId]: value }));
    setTouched(prev => { const next = new Set(prev); next.add(columnId); return next; });
    // Clear error when user types
    if (errors[columnId]) {
      setErrors(prev => { const next = { ...prev }; delete next[columnId]; return next; });
    }
  }
 
  function handleFieldBlur(columnId: string) {
    var col = editableColumns.find(c => c.id === columnId);
    if (!col) return;
    var val = formData[columnId];
    if (val !== undefined && val !== null && val !== '') {
      var result = validateColumnValue(val, col.type, col.settings);
      if (!result.valid) {
        setErrors(prev => ({ ...prev, [columnId]: result.error || 'Invalid value' }));
      } else if (result.sanitized !== undefined && result.sanitized !== val) {
        setFormData(prev => ({ ...prev, [columnId]: result.sanitized }));
      }
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    editableColumns.forEach(col => {
      const val = formData[col.id];
      // Required check
      if (col.required) {
        if (val === undefined || val === null || val === '' || (typeof val === 'string' && !val.trim())) {
          newErrors[col.id] = `${col.name} is required`;
          return;
        }
      }
      // Type validation using shared validator
      if (val !== undefined && val !== null && val !== '') {
        var result = validateColumnValue(val, col.type, col.settings);
        if (!result.valid) {
          newErrors[col.id] = result.error || 'Invalid value';
        } else if (result.sanitized !== undefined) {
          // Apply sanitized value (e.g. lowercase email, auto-add https://)
          setFormData(prev => ({ ...prev, [col.id]: result.sanitized }));
        }
      }
    });
    setErrors(newErrors);
    setTouched(new Set(editableColumns.map(c => c.id)));
    return Object.keys(newErrors).length === 0;
  }

  async function handleSave() {
    if (!validate() || isSaving) return;
    setIsSaving(true);
    try {
      // Clean up form data — remove empty strings
      const cleanData: Record<string, any> = {};
      Object.entries(formData).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          cleanData[key] = val;
        }
      });

      const res = await fetch(`/api/tables/${tableId}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: cleanData }),
      });

      if (res.ok) {
        const newRow = await res.json();
        onRowCreated(newRow);
        onClose();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create row');
      }
    } finally {
      setIsSaving(false);
    }
  }

  function getColumnIcon(type: string): string {
    const icons: Record<string, string> = {
      text: '📝', long_text: '📄', number: '🔢', currency: '💵', percent: '📊',
      date: '📅', datetime: '🕐', checkbox: '☑️', select: '🎯', multi_select: '🏷️',
      linked_record: '🔗', user: '👤', email: '📧', url: '🔗', phone: '📱',
      rating: '⭐', progress: '📈', color: '🎨', duration: '⏱️', attachment: '📎',
    };
    return icons[type] || '📝';
  }

  function renderField(column: any) {
    const value = formData[column.id] || '';
    const hasError = errors[column.id] && touched.has(column.id);
    const inputClass = `w-full px-3 py-2 text-sm border rounded-lg transition-colors focus:ring-2 focus:outline-none dark:text-gray-100 ${
      hasError
        ? 'border-red-300 focus:ring-red-500 bg-red-50 dark:bg-red-900/20'
        : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 bg-white dark:bg-gray-800'
    }`;

    switch (column.type) {
      case 'text':
        return <input type="text" value={value} onChange={e => updateField(column.id, e.target.value)} onBlur={() => handleFieldBlur(column.id)} className={inputClass} placeholder={`Enter ${column.name.toLowerCase()}...`} />;

      case 'phone':
        return <input type="text" value={value} onChange={e => updateField(column.id, e.target.value)} onBlur={() => handleFieldBlur(column.id)} className={inputClass} placeholder="(555) 123-4567" />;

      case 'long_text':
        return <textarea value={value} onChange={e => updateField(column.id, e.target.value)} rows={3} className={inputClass + ' resize-none'} placeholder={`Enter ${column.name.toLowerCase()}...`} />;

      case 'number':
        return <input type="number" value={value} onChange={e => updateField(column.id, e.target.value)} className={inputClass} placeholder="0" />;

      case 'currency':
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">$</span>
            <input type="number" step="0.01" value={value} onChange={e => updateField(column.id, e.target.value)} className={inputClass + ' pl-7'} placeholder="0.00" />
          </div>
        );

      case 'percent':
        return (
          <div className="relative">
            <input type="number" step="0.1" value={value} onChange={e => updateField(column.id, e.target.value)} className={inputClass + ' pr-8'} placeholder="0" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">%</span>
          </div>
        );

      case 'email':
        return <input type="email" value={value} onChange={e => updateField(column.id, e.target.value)} onBlur={() => handleFieldBlur(column.id)} className={inputClass} placeholder="email@example.com" />;

      case 'url':
        return <input type="url" value={value} onChange={e => updateField(column.id, e.target.value)} onBlur={() => handleFieldBlur(column.id)} className={inputClass} placeholder="https://..." />;

      case 'date':
        return <input type="date" value={value} onChange={e => updateField(column.id, e.target.value)} className={inputClass} />;

      case 'datetime':
        return <input type="datetime-local" value={value} onChange={e => updateField(column.id, e.target.value)} className={inputClass} />;

      case 'checkbox':
        return (
          <label className="flex items-center space-x-3 cursor-pointer py-1">
            <input type="checkbox" checked={value === 'true' || value === true} onChange={e => updateField(column.id, e.target.checked ? 'true' : 'false')}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{value === 'true' ? 'Yes' : 'No'}</span>
          </label>
        );

      case 'select':
        return (
          <select value={value} onChange={e => updateField(column.id, e.target.value)} className={inputClass}>
            <option value="">Select...</option>
            {(column.settings?.options || []).map((opt: any) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );

      case 'multi_select':
        const selectedValues = value ? value.split(',').filter(Boolean) : [];
        return (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5 min-h-[32px]">
              {selectedValues.map((v: string) => {
                const opt = (column.settings?.options || []).find((o: any) => o.value === v);
                return (
                  <span key={v} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: (opt?.color || '#3B82F6') + '20', color: opt?.color || '#3B82F6' }}>
                    {opt?.label || v}
                    <button type="button" onClick={() => updateField(column.id, selectedValues.filter((sv: string) => sv !== v).join(','))} className="ml-1 hover:opacity-70">×</button>
                  </span>
                );
              })}
            </div>
            <select value="" onChange={e => { if (e.target.value && !selectedValues.includes(e.target.value)) { updateField(column.id, [...selectedValues, e.target.value].join(',')); } e.target.value = ''; }} className={inputClass}>
              <option value="">Add option...</option>
              {(column.settings?.options || []).filter((opt: any) => !selectedValues.includes(opt.value)).map((opt: any) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        );

      case 'rating':
        const numValue = parseInt(value) || 0;
        return (
          <div className="flex items-center space-x-1 py-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => updateField(column.id, numValue === n ? '' : String(n))}
                className={`text-2xl transition-transform hover:scale-110 ${n <= numValue ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}>
                ★
              </button>
            ))}
            {numValue > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">{numValue}/5</span>}
          </div>
        );

      case 'progress':
        return (
          <div className="space-y-1.5">
            <input type="range" min="0" max="100" value={value || 0} onChange={e => updateField(column.id, e.target.value)} className="w-full" />
            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
              <span>0%</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{value || 0}%</span>
              <span>100%</span>
            </div>
          </div>
        );

      case 'color':
        return (
          <div className="flex items-center space-x-2">
            <input type="color" value={value || '#3B82F6'} onChange={e => updateField(column.id, e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0" />
            <input type="text" value={value || ''} onChange={e => updateField(column.id, e.target.value)} className={inputClass + ' flex-1'} placeholder="#hex" />
          </div>
        );

      case 'duration':
        return <input type="text" value={value} onChange={e => updateField(column.id, e.target.value)} className={inputClass} placeholder="e.g., 2h 30m" />;

      case 'attachment':
        return (
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            📎 Files can be attached after the row is created.
          </div>
        );

      case 'linked_record':
        return (
          <LinkedRecordPicker
            linkedTableId={column.linkedTableId || ''}
            displayColumnId={column.linkedDisplayColumnId || column.settings?.displayColumnId}
            currentValue={value || ''}
            onChange={(rowId, displayValue) => updateField(column.id, rowId || '')}
          />
        );

      default:
        return <input type="text" value={value} onChange={e => updateField(column.id, e.target.value)} className={inputClass} placeholder={`Enter value...`} />;
    }
  }

  if (!isOpen) return null;

  const requiredCount = editableColumns.filter(c => c.required).length;
  const filledRequired = editableColumns.filter(c => c.required && formData[c.id] && String(formData[c.id]).trim()).length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-20 z-30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white dark:bg-gray-900 shadow-2xl z-40 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">New Row</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {requiredCount > 0
                ? `${filledRequired} of ${requiredCount} required fields filled`
                : 'Fill in the fields below'
              }
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Close (Esc)">
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Required fields indicator */}
        {requiredCount > 0 && (
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-100 flex-shrink-0">
            <p className="text-xs text-amber-700">
              <span className="text-red-500 font-bold">*</span> indicates required fields
            </p>
          </div>
        )}

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-5">
            {editableColumns.map(column => {
              const hasError = errors[column.id] && touched.has(column.id);
              return (
                <div key={column.id}>
                  <label className="flex items-center space-x-1.5 mb-1.5">
                    <span className="text-sm text-gray-400 dark:text-gray-500">{getColumnIcon(column.type)}</span>
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{column.name}</span>
                    {column.required && <span className="text-red-500 font-bold">*</span>}
                  </label>
                  {renderField(column)}
                  {hasError && (
                    <p className="mt-1 text-xs text-red-600 flex items-center space-x-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      <span>{errors[column.id]}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
          >
            {isSaving ? 'Creating...' : 'Create Row'}
          </button>
        </div>
      </div>
    </>
  );
}