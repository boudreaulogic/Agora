'use client';

import { useState, useEffect } from 'react';

const COLUMN_TYPES = [
  { value: 'text', label: 'Single Line Text', icon: '📝', description: 'Short text like names or titles' },
  { value: 'long_text', label: 'Long Text', icon: '📄', description: 'Multiple lines of text' },
  { value: 'number', label: 'Number', icon: '🔢', description: 'Numeric values' },
  { value: 'currency', label: 'Currency', icon: '💵', description: 'Monetary amounts' },
  { value: 'percent', label: 'Percent', icon: '📊', description: 'Percentage values' },
  { value: 'date', label: 'Date', icon: '📅', description: 'Calendar date' },
  { value: 'datetime', label: 'Date & Time', icon: '🕐', description: 'Date with time' },
  { value: 'checkbox', label: 'Checkbox', icon: '☑️', description: 'True/false values' },
  { value: 'select', label: 'Single Select', icon: '🎯', description: 'Pick one option from a list' },
  { value: 'multi_select', label: 'Multi Select', icon: '🏷️', description: 'Pick multiple options' },
  { value: 'formula', label: 'Formula', icon: '🧮', description: 'Calculated field based on other columns' },
  { value: 'linked_record', label: 'Linked Record', icon: '🔗', description: 'Link to records in another table' },
  { value: 'lookup', label: 'Lookup', icon: '👀', description: 'Show a field from linked records' },
  { value: 'rollup', label: 'Rollup', icon: '📊', description: 'Aggregate data from linked records (COUNT, SUM, AVG)' },
  { value: 'user', label: 'User', icon: '👤', description: 'Assign to a user' },
  { value: 'email', label: 'Email', icon: '📧', description: 'Email address' },
  { value: 'url', label: 'URL', icon: '🔗', description: 'Website link' },
  { value: 'phone', label: 'Phone', icon: '📱', description: 'Phone number' },
  { value: 'rating', label: 'Rating', icon: '⭐', description: '1-5 star rating' },
  { value: 'progress', label: 'Progress', icon: '📈', description: 'Progress bar 0-100%' },
  { value: 'color', label: 'Color', icon: '🎨', description: 'Color picker' },
  { value: 'duration', label: 'Duration', icon: '⏱️', description: 'Time duration' },
];

const FORMULA_FORMATS = [
  { value: 'number', label: 'Number', icon: '🔢', description: '1,234.56' },
  { value: 'currency', label: 'Currency', icon: '💵', description: '$1,234.56' },
  { value: 'percent', label: 'Percent', icon: '📊', description: '12.34%' },
  { value: 'duration', label: 'Duration', icon: '⏱️', description: '2h 30m' },
];

function insertAtCursor(formula: string, setFormula: (f: string) => void, insert: string) {
  var el = document.getElementById('formula-editor') as HTMLTextAreaElement;
  if (!el) { setFormula(formula + insert); return; }
  var start = el.selectionStart;
  var end = el.selectionEnd;
  var newFormula = formula.substring(0, start) + insert + formula.substring(end);
  setFormula(newFormula);
  setTimeout(function() { el.focus(); el.selectionStart = el.selectionEnd = start + insert.length; }, 0);
}

export function AddColumnModal({ tableId }: { tableId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('text');
  const [columnName, setColumnName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isRequired, setIsRequired] = useState(false);
  const [showInNewRow, setShowInNewRow] = useState(true);
  const [defaultValue, setDefaultValue] = useState('');
  const [columnDescription, setColumnDescription] = useState('');
  const [agoraOnly, setAgoraOnly] = useState(false);

  // For select/multi-select types
  const [options, setOptions] = useState<Array<{ value: string; label: string; color: string }>>([
    { value: 'option1', label: 'Option 1', color: '#3B82F6' },
  ]);

  // For formula type
  const [formula, setFormula] = useState('');
  const [formulaFormat, setFormulaFormat] = useState('number');
  const [tableColumnsList, setTableColumnsList] = useState<any[]>([]);

  // For linked_record type
  const [linkedTableId, setLinkedTableId] = useState('');
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [linkedDisplayColumnId, setLinkedDisplayColumnId] = useState('');
  const [linkedTableColumnsForDisplay, setLinkedTableColumnsForDisplay] = useState<any[]>([]);

  // For lookup type
  const [lookupLinkedColumnId, setLookupLinkedColumnId] = useState('');
  const [lookupFieldId, setLookupFieldId] = useState('');
  const [linkedRecordColumns, setLinkedRecordColumns] = useState<any[]>([]);
  const [linkedTableColumns, setLinkedTableColumns] = useState<any[]>([]);
  const [loadingLinkedColumns, setLoadingLinkedColumns] = useState(false);
  const [loadingFieldColumns, setLoadingFieldColumns] = useState(false);

  // For rollup type
  const [rollupLinkedColumnId, setRollupLinkedColumnId] = useState('');
  const [rollupFieldId, setRollupFieldId] = useState('');
  const [rollupFunction, setRollupFunction] = useState('');
  const [rollupLinkedTableColumns, setRollupLinkedTableColumns] = useState<any[]>([]);
  const [loadingRollupFieldColumns, setLoadingRollupFieldColumns] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setColumnName(''); setSelectedType('text'); setIsRequired(false); setShowInNewRow(true);
      setDefaultValue(''); setColumnDescription(''); setAgoraOnly(false);
      setOptions([{ value: 'option1', label: 'Option 1', color: '#3B82F6' }]);
      setFormula(''); setFormulaFormat('number');
      setLinkedTableId(''); setLinkedDisplayColumnId('');
      setLookupLinkedColumnId(''); setLookupFieldId('');
      setRollupLinkedColumnId(''); setRollupFieldId(''); setRollupFunction('');
      fetchAvailableTables();
      fetchLinkedRecordColumns();
      fetch(`/api/tables/${tableId}/columns`).then(r => r.json()).then(cols => setTableColumnsList(cols)).catch(console.error);
    }
  }, [isOpen]);

  useEffect(() => {
    if (linkedTableId) {
      fetch(`/api/tables/${linkedTableId}/columns`)
        .then(r => r.json())
        .then(cols => setLinkedTableColumnsForDisplay(cols.filter((c: any) => !['linked_record', 'lookup', 'rollup', 'formula'].includes(c.type))))
        .catch(console.error);
    } else {
      setLinkedTableColumnsForDisplay([]);
      setLinkedDisplayColumnId('');
    }
  }, [linkedTableId]);

  useEffect(() => {
    if (lookupLinkedColumnId) {
      fetchLinkedTableColumns(lookupLinkedColumnId);
    } else {
      setLinkedTableColumns([]);
      setLookupFieldId('');
    }
  }, [lookupLinkedColumnId]);

  useEffect(() => {
    if (rollupLinkedColumnId) {
      fetchRollupLinkedTableColumns(rollupLinkedColumnId);
    } else {
      setRollupLinkedTableColumns([]);
      setRollupFieldId('');
    }
  }, [rollupLinkedColumnId]);

  async function fetchAvailableTables() {
    setLoadingTables(true);
    try {
      const response = await fetch('/api/tables');
      if (response.ok) {
        const tables = await response.json();
        setAvailableTables(tables.filter((t: any) => t.id !== tableId));
      }
    } catch (error) {
      console.error('Error fetching tables:', error);
    } finally {
      setLoadingTables(false);
    }
  }

  async function fetchLinkedRecordColumns() {
    setLoadingLinkedColumns(true);
    try {
      const response = await fetch(`/api/tables/${tableId}/columns`);
      if (response.ok) {
        const columns = await response.json();
        setLinkedRecordColumns(columns.filter((c: any) => c.type === 'linked_record'));
      }
    } catch (error) {
      console.error('Error fetching linked record columns:', error);
    } finally {
      setLoadingLinkedColumns(false);
    }
  }

  async function fetchLinkedTableColumns(linkedColumnId: string) {
    setLoadingFieldColumns(true);
    setLookupFieldId('');
    try {
      const linkedCol = linkedRecordColumns.find((c: any) => c.id === linkedColumnId);
      if (!linkedCol?.linkedTableId) return;
      const response = await fetch(`/api/tables/${linkedCol.linkedTableId}/columns`);
      if (response.ok) {
        const columns = await response.json();
        setLinkedTableColumns(columns.filter((c: any) => c.type !== 'linked_record' && c.type !== 'lookup'));
      }
    } catch (error) {
      console.error('Error fetching linked table columns:', error);
    } finally {
      setLoadingFieldColumns(false);
    }
  }

  async function fetchRollupLinkedTableColumns(linkedColumnId: string) {
    setLoadingRollupFieldColumns(true);
    setRollupFieldId('');
    try {
      const linkedCol = linkedRecordColumns.find((c: any) => c.id === linkedColumnId);
      if (!linkedCol?.linkedTableId) return;
      const response = await fetch(`/api/tables/${linkedCol.linkedTableId}/columns`);
      if (response.ok) {
        const columns = await response.json();
        setRollupLinkedTableColumns(columns.filter((c: any) => c.type !== 'linked_record' && c.type !== 'lookup' && c.type !== 'rollup'));
      }
    } catch (error) {
      console.error('Error fetching rollup linked table columns:', error);
    } finally {
      setLoadingRollupFieldColumns(false);
    }
  }

  async function handleCreate() {
    if (!columnName.trim()) { alert('Column name is required'); return; }
    if (selectedType === 'formula' && !formula.trim()) { alert('Formula is required for formula columns'); return; }
    if (selectedType === 'linked_record' && !linkedTableId) { alert('Please select a table to link to'); return; }
    if (selectedType === 'lookup' && !lookupLinkedColumnId) { alert('Please select a linked record column'); return; }
    if (selectedType === 'lookup' && !lookupFieldId) { alert('Please select a field to display'); return; }
    if (selectedType === 'rollup' && !rollupLinkedColumnId) { alert('Please select a linked record column'); return; }
    if (selectedType === 'rollup' && !rollupFunction) { alert('Please select an aggregation function'); return; }
    if (selectedType === 'rollup' && rollupFunction !== 'COUNT' && !rollupFieldId) { alert('Please select a field to aggregate'); return; }

    setIsCreating(true);
    try {
      const settings: any = {};
      if (selectedType === 'select' || selectedType === 'multi_select') settings.options = options;
      if (selectedType === 'formula') settings.format = formulaFormat;
      if (defaultValue) settings.defaultValue = defaultValue;
      if (columnDescription) settings.description = columnDescription;
      if (selectedType === 'lookup') {
        const linkedCol = linkedRecordColumns.find((c: any) => c.id === lookupLinkedColumnId);
        const fieldCol = linkedTableColumns.find((c: any) => c.id === lookupFieldId);
        settings.linkedColumnName = linkedCol?.name;
        settings.lookupFieldName = fieldCol?.name;
        settings.lookupFieldType = fieldCol?.type;
      }
      if (selectedType === 'rollup') {
        const linkedCol = linkedRecordColumns.find((c: any) => c.id === rollupLinkedColumnId);
        const fieldCol = rollupLinkedTableColumns.find((c: any) => c.id === rollupFieldId);
        settings.linkedColumnName = linkedCol?.name;
        settings.rollupFieldName = fieldCol?.name;
        settings.rollupFieldType = fieldCol?.type;
        settings.rollupFunction = rollupFunction;
      }

      const response = await fetch(`/api/tables/${tableId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: columnName, type: selectedType, settings, required: isRequired, showInNewRow: showInNewRow,
          formula: selectedType === 'formula' ? formula : undefined,
          linkedTableId: selectedType === 'linked_record' ? linkedTableId : undefined,
          linkedDisplayColumnId: selectedType === 'linked_record' ? linkedDisplayColumnId : undefined,
          lookupLinkedColumnId: selectedType === 'lookup' ? lookupLinkedColumnId : undefined,
          lookupFieldId: selectedType === 'lookup' ? lookupFieldId : undefined,
          rollupLinkedColumnId: selectedType === 'rollup' ? rollupLinkedColumnId : undefined,
          rollupFieldId: selectedType === 'rollup' ? (rollupFunction === 'COUNT' ? undefined : rollupFieldId) : undefined,
          rollupFunction: selectedType === 'rollup' ? rollupFunction : undefined,
        }),
      });

      if (response.ok) { window.location.reload(); }
      else { const error = await response.json(); alert(error.error || 'Failed to create column'); }
    } catch (error) {
      console.error('Error creating column:', error);
      alert('Error creating column');
    } finally {
      setIsCreating(false);
    }
  }

  function addOption() { setOptions([...options, { value: `option${options.length + 1}`, label: `Option ${options.length + 1}`, color: '#3B82F6' }]); }
  function removeOption(index: number) { setOptions(options.filter((_, i) => i !== index)); }
  function updateOption(index: number, field: 'label' | 'color', value: string) {
    const newOptions = [...options];
    newOptions[index][field] = value;
    if (field === 'label') newOptions[index].value = value.toLowerCase().replace(/\s+/g, '_');
    setOptions(newOptions);
  }

  function getTypeIcon(type: string): string {
    const found = COLUMN_TYPES.find(t => t.value === type);
    return found?.icon || '📝';
  }

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">+ Add Column</button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Column</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {/* Column Name */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Column Name <span className="text-red-500">*</span></label>
                <input type="text" value={columnName} onChange={(e) => setColumnName(e.target.value)} placeholder="e.g., Project Status"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>

              {/* Column Description */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <input type="text" value={columnDescription} onChange={(e) => setColumnDescription(e.target.value)} placeholder="Help text shown to users (e.g. 'Enter your work email')" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                <p className="text-xs text-gray-400 mt-1">Shown as a tooltip on column headers and in forms</p>
              </div>

              {/* Required Field Toggle */}
              {!['formula', 'lookup', 'rollup', 'approval_status'].includes(selectedType) && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div><h4 className="text-sm font-medium text-gray-900">Required Field</h4><p className="text-xs text-gray-500 mt-0.5">Must have a value when creating rows</p></div>
                    <button type="button" onClick={() => setIsRequired(!isRequired)} className={`relative w-11 h-6 rounded-full transition-colors ${isRequired ? 'bg-red-500' : 'bg-gray-300'}`}>
                      <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" style={{ transform: isRequired ? 'translateX(22px)' : 'translateX(2px)' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* Show in New Row Toggle */}
              {!['formula', 'lookup', 'rollup', 'approval_status'].includes(selectedType) && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div><h4 className="text-sm font-medium text-gray-900">Show in New Row Panel</h4><p className="text-xs text-gray-500 mt-0.5">When disabled, this field won't appear when users click "+ New"</p></div>
                    <button type="button" onClick={() => setShowInNewRow(!showInNewRow)} className={`relative w-11 h-6 rounded-full transition-colors ${showInNewRow ? 'bg-blue-500' : 'bg-gray-300'}`}>
                      <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" style={{ transform: showInNewRow ? 'translateX(22px)' : 'translateX(2px)' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* Agora Only Toggle */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Agora Only</h4>
                    <p className="text-xs text-gray-500 mt-0.5">When enabled, this column will NOT be pushed to SharePoint. Use for internal tracking, automation triggers, or temporary data.</p>
                  </div>
                  <button type="button" onClick={() => setAgoraOnly(!agoraOnly)} className={`relative w-11 h-6 rounded-full transition-colors ${agoraOnly ? 'bg-blue-500' : 'bg-gray-300'}`}>
                    <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" style={{ transform: agoraOnly ? 'translateX(22px)' : 'translateX(2px)' }} />
                  </button>
                </div>
              </div>

              {/* Column Type */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Column Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {COLUMN_TYPES.map((type) => (
                    <button key={type.value} type="button" onClick={() => { setSelectedType(type.value); setDefaultValue(''); }}
                      className={`flex items-start p-3 border-2 rounded-lg text-left transition-all ${selectedType === type.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <span className="text-2xl mr-3">{type.icon}</span>
                      <div className="flex-1 min-w-0"><div className="font-medium text-sm text-gray-900">{type.label}</div><div className="text-xs text-gray-500 mt-0.5">{type.description}</div></div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Value — after type selection so options are available */}
              {!['formula', 'lookup', 'rollup', 'linked_record'].includes(selectedType) && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Default Value</label>
                  <p className="text-xs text-gray-400 mb-2">Automatically applied when new rows are created</p>
                  {selectedType === 'checkbox' ? (
                    <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={defaultValue === 'true'} onChange={(e) => setDefaultValue(e.target.checked ? 'true' : '')} className="w-5 h-5 rounded border-gray-300 text-blue-600" /><span className="text-sm text-gray-700">Checked by default</span></label>
                  ) : selectedType === 'select' ? (
                    <select value={defaultValue || ''} onChange={(e) => setDefaultValue(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      <option value="">No default</option>{options.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                  ) : ['number', 'currency', 'percent'].includes(selectedType) ? (
                    <input type="number" value={defaultValue || ''} onChange={(e) => setDefaultValue(e.target.value)} placeholder="Enter default number..." className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  ) : selectedType === 'date' || selectedType === 'datetime' ? (
                    <div className="space-y-2">
                      <select value={defaultValue === '__today' ? '__today' : ''} onChange={(e) => setDefaultValue(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="">No default</option>
                        <option value="__today">Today's date</option>
                      </select>
                    </div>
                  ) : (
                    <input type="text" value={defaultValue || ''} onChange={(e) => setDefaultValue(e.target.value)} placeholder="Enter default value..." className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  )}
                </div>
              )}

              {/* Lookup Column Configuration */}
              {selectedType === 'lookup' && (
                <div className="mb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Step 1: Select Linked Record Column <span className="text-red-500">*</span></label>
                    {loadingLinkedColumns ? (<div className="text-sm text-gray-500">Loading columns...</div>)
                    : linkedRecordColumns.length === 0 ? (<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg"><p className="text-sm text-yellow-800">No linked record columns found. Create a Linked Record column first to use lookups.</p></div>)
                    : (<select value={lookupLinkedColumnId} onChange={(e) => setLookupLinkedColumnId(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="">Select a linked record column...</option>
                        {linkedRecordColumns.map((col) => (<option key={col.id} value={col.id}>🔗 {col.name} → {col.linkedTable?.name || 'Unknown table'}</option>))}
                      </select>)}
                    <p className="mt-1 text-xs text-gray-500">Choose which linked record relationship to follow</p>
                  </div>
                  {lookupLinkedColumnId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Step 2: Select Field to Display <span className="text-red-500">*</span></label>
                      {loadingFieldColumns ? (<div className="text-sm text-gray-500">Loading fields...</div>)
                      : linkedTableColumns.length === 0 ? (<div className="text-sm text-gray-500">No fields available in the linked table</div>)
                      : (<select value={lookupFieldId} onChange={(e) => setLookupFieldId(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                          <option value="">Select a field...</option>
                          {linkedTableColumns.map((col) => (<option key={col.id} value={col.id}>{getTypeIcon(col.type)} {col.name}</option>))}
                        </select>)}
                      <p className="mt-1 text-xs text-gray-500">This field's value will be pulled from linked records</p>
                    </div>
                  )}
                  {lookupLinkedColumnId && lookupFieldId && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900"><span className="font-medium">Preview:</span> This column will show the <strong>{linkedTableColumns.find(c => c.id === lookupFieldId)?.name}</strong> field from records linked via <strong>{linkedRecordColumns.find(c => c.id === lookupLinkedColumnId)?.name}</strong></p>
                    </div>
                  )}
                </div>
              )}

              {/* Rollup Column Configuration */}
              {selectedType === 'rollup' && (
                <div className="mb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Step 1: Select Linked Record Column <span className="text-red-500">*</span></label>
                    {loadingLinkedColumns ? (<div className="text-sm text-gray-500">Loading columns...</div>)
                    : linkedRecordColumns.length === 0 ? (<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg"><p className="text-sm text-yellow-800">No linked record columns found. Create a Linked Record column first to use rollups.</p></div>)
                    : (<select value={rollupLinkedColumnId} onChange={(e) => setRollupLinkedColumnId(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="">Select a linked record column...</option>
                        {linkedRecordColumns.map((col) => (<option key={col.id} value={col.id}>🔗 {col.name} → {col.linkedTable?.name || 'Unknown table'}</option>))}
                      </select>)}
                  </div>
                  {rollupLinkedColumnId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Step 2: Aggregation Function <span className="text-red-500">*</span></label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'COUNT', label: 'Count', desc: 'Number of linked records', icon: '#️⃣' },
                          { value: 'SUM', label: 'Sum', desc: 'Total of field values', icon: '➕' },
                          { value: 'AVG', label: 'Average', desc: 'Mean of field values', icon: '📐' },
                          { value: 'MIN', label: 'Minimum', desc: 'Smallest value', icon: '⬇️' },
                          { value: 'MAX', label: 'Maximum', desc: 'Largest value', icon: '⬆️' },
                          { value: 'COUNTA', label: 'Count Values', desc: 'Non-empty field count', icon: '🔢' },
                        ].map((fn) => (
                          <button key={fn.value} type="button" onClick={() => setRollupFunction(fn.value)}
                            className={`p-3 border-2 rounded-lg text-left transition-all ${rollupFunction === fn.value ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                            <div className="text-lg mb-1">{fn.icon}</div><div className="font-medium text-sm text-gray-900">{fn.label}</div><div className="text-xs text-gray-500">{fn.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {rollupLinkedColumnId && rollupFunction && rollupFunction !== 'COUNT' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Step 3: Select Field to Aggregate <span className="text-red-500">*</span></label>
                      {loadingRollupFieldColumns ? (<div className="text-sm text-gray-500">Loading fields...</div>)
                      : rollupLinkedTableColumns.length === 0 ? (<div className="text-sm text-gray-500">No fields available</div>)
                      : (<select value={rollupFieldId} onChange={(e) => setRollupFieldId(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                          <option value="">Select a field...</option>
                          {rollupLinkedTableColumns.map((col) => (<option key={col.id} value={col.id}>{getTypeIcon(col.type)} {col.name}</option>))}
                        </select>)}
                    </div>
                  )}
                  {rollupLinkedColumnId && rollupFunction && (rollupFunction === 'COUNT' || rollupFieldId) && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-900"><span className="font-medium">Preview:</span>{' '}
                        {rollupFunction === 'COUNT'
                          ? <>This column will show the <strong>count of linked records</strong> via <strong>{linkedRecordColumns.find(c => c.id === rollupLinkedColumnId)?.name}</strong></>
                          : <>This column will show the <strong>{rollupFunction}</strong> of <strong>{rollupLinkedTableColumns.find(c => c.id === rollupFieldId)?.name}</strong> from records linked via <strong>{linkedRecordColumns.find(c => c.id === rollupLinkedColumnId)?.name}</strong></>}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Linked Record Table Selector */}
              {selectedType === 'linked_record' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Link to Table <span className="text-red-500">*</span></label>
                  {loadingTables ? (<div className="text-sm text-gray-500">Loading tables...</div>)
                  : availableTables.length === 0 ? (<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg"><p className="text-sm text-yellow-800">No other tables available. Create another table first to link records.</p></div>)
                  : (<select value={linkedTableId} onChange={(e) => setLinkedTableId(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      <option value="">Select a table...</option>
                      {availableTables.map((table) => (<option key={table.id} value={table.id}>{table.icon} {table.name}</option>))}
                    </select>)}
                  <p className="mt-2 text-xs text-gray-500">💡 This column will link to records in the selected table</p>
                  {linkedTableId && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Display Column <span className="text-red-500">*</span></label>
                      <select value={linkedDisplayColumnId} onChange={(e) => setLinkedDisplayColumnId(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="">Select which field to show...</option>
                        {linkedTableColumnsForDisplay.map((col: any) => (<option key={col.id} value={col.id}>{col.name}</option>))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">This column's values will appear in the dropdown when users pick a record</p>
                    </div>
                  )}
                </div>
              )}

              {/* Formula Editor with Dynamic Content */}
              {selectedType === 'formula' && (
                <>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Formula <span className="text-red-500">*</span></label>
                    <textarea id="formula-editor" value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="e.g., {Price} * {Quantity}" rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm" />

                    <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                        <span className="text-xs font-bold text-gray-500 uppercase">Insert Dynamic Content</span>
                      </div>
                      <div className="p-3">
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {tableColumnsList.filter(function(c: any) { return c.type !== 'formula' && c.type !== 'lookup' && c.type !== 'rollup' && c.type !== 'linked_record'; }).map(function(col: any) {
                            return (<button key={col.id} type="button" onClick={function() { insertAtCursor(formula, setFormula, '{' + col.name + '}'); }}
                              className="px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">{col.name}</button>);
                          })}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          <span className="text-[10px] text-gray-400 font-bold uppercase mr-1 self-center">Operators:</span>
                          {[{label: '+', insert: ' + '}, {label: '−', insert: ' - '}, {label: '×', insert: ' * '}, {label: '÷', insert: ' / '}, {label: '%', insert: ' % '}, {label: '(', insert: '('}, {label: ')', insert: ')'}, {label: ',', insert: ', '}].map(function(op) {
                            return (<button key={op.label} type="button" onClick={function() { insertAtCursor(formula, setFormula, op.insert); }}
                              className="w-8 h-8 text-sm font-bold bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">{op.label}</button>);
                          })}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] text-gray-400 font-bold uppercase mr-1 self-center">Functions:</span>
                          {['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'ROUND', 'ABS', 'IF', 'CONCAT'].map(function(fn) {
                            return (<button key={fn} type="button" onClick={function() { insertAtCursor(formula, setFormula, fn + '('); }}
                              className="px-2 py-1 text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded hover:bg-purple-100 transition-colors">{fn}()</button>);
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-medium text-blue-900 mb-1">Examples:</p>
                      <ul className="text-xs text-blue-800 space-y-1">
                        <li>• <code className="bg-blue-100 px-1 rounded">{'{Price} * {Quantity}'}</code> - Multiply two columns</li>
                        <li>• <code className="bg-blue-100 px-1 rounded">{'SUM({A}, {B}, {C})'}</code> - Sum multiple columns</li>
                        <li>• <code className="bg-blue-100 px-1 rounded">{'IF({Quantity} > 10, "Bulk", "Retail")'}</code> - Conditional logic</li>
                        <li>• <code className="bg-blue-100 px-1 rounded">{'ROUND({Price} * 1.08, 2)'}</code> - Add 8% tax and round</li>
                      </ul>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">Number Format</label>
                    <div className="grid grid-cols-2 gap-3">
                      {FORMULA_FORMATS.map((format) => (
                        <button key={format.value} type="button" onClick={() => setFormulaFormat(format.value)}
                          className={`flex items-start p-3 border-2 rounded-lg text-left transition-all ${formulaFormat === format.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                          <span className="text-2xl mr-3">{format.icon}</span>
                          <div className="flex-1 min-w-0"><div className="font-medium text-sm text-gray-900">{format.label}</div><div className="text-xs text-gray-500 mt-0.5">{format.description}</div></div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Options for Select/Multi-Select */}
              {(selectedType === 'select' || selectedType === 'multi_select') && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Options</label>
                  <div className="space-y-2">
                    {options.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <div className="relative">
                          <button type="button" onClick={(e) => { var el = e.currentTarget.nextElementSibling; if (el) (el as HTMLElement).style.display = (el as HTMLElement).style.display === 'none' ? 'flex' : 'none'; }} className="w-10 h-10 rounded-lg border-2 border-gray-200 cursor-pointer hover:border-gray-400 transition-colors" style={{ backgroundColor: option.color }} />
                          <div style={{ display: 'none' }} className="absolute left-0 top-12 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex flex-wrap gap-1.5 w-[168px]">
                            {['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16','#F97316','#6366F1','#14B8A6','#A855F7'].map((c) => (
                              <button key={c} type="button" onClick={(e) => { updateOption(index, 'color', c); var panel = (e.currentTarget.parentElement as HTMLElement); if (panel) panel.style.display = 'none'; }} className={'w-8 h-8 rounded-md cursor-pointer transition-all hover:scale-110 ' + (option.color === c ? 'ring-2 ring-offset-2 ring-gray-800' : 'hover:ring-2 hover:ring-offset-1 hover:ring-gray-300')} style={{ backgroundColor: c }} />
                            ))}
                          </div>
                        </div>
                        <input type="text" value={option.label} onChange={(e) => updateOption(index, 'label', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" placeholder="Option name" />
                        {options.length > 1 && (
                          <button type="button" onClick={() => removeOption(index)} className="text-red-600 hover:text-red-800">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={addOption} className="text-sm text-blue-600 hover:text-blue-800">+ Add Option</button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button onClick={() => setIsOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate}
                disabled={isCreating || !columnName.trim() || (selectedType === 'formula' && !formula.trim()) || (selectedType === 'linked_record' && !linkedTableId) || (selectedType === 'lookup' && (!lookupLinkedColumnId || !lookupFieldId)) || (selectedType === 'rollup' && (!rollupLinkedColumnId || !rollupFunction || (rollupFunction !== 'COUNT' && !rollupFieldId)))}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {isCreating ? 'Creating...' : 'Create Column'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}