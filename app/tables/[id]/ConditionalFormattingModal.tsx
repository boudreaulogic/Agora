'use client';

import { useState, useEffect } from 'react';

interface FormattingRule {
  id: string;
  columnId: string;
  operator: string;
  value: string;
  target: 'row' | 'cell';
  targetColumnId?: string;
  bgColor: string;
  textColor: string;
  bold: boolean;
}

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

const PRESET_BG_COLORS = [
  { value: '', label: 'None', swatch: 'bg-white border border-gray-300 border-dashed' },
  { value: '#FEE2E2', label: 'Red', swatch: 'bg-red-100' },
  { value: '#FEF3C7', label: 'Yellow', swatch: 'bg-amber-100' },
  { value: '#D1FAE5', label: 'Green', swatch: 'bg-green-100' },
  { value: '#DBEAFE', label: 'Blue', swatch: 'bg-blue-100' },
  { value: '#E9D5FF', label: 'Purple', swatch: 'bg-purple-100' },
  { value: '#FFE4E6', label: 'Pink', swatch: 'bg-pink-100' },
  { value: '#FED7AA', label: 'Orange', swatch: 'bg-orange-100' },
  { value: '#F3F4F6', label: 'Gray', swatch: 'bg-gray-100' },
];

const PRESET_TEXT_COLORS = [
  { value: '', label: 'Default', swatch: 'bg-white border border-gray-300 border-dashed' },
  { value: '#991B1B', label: 'Red', swatch: 'bg-red-800' },
  { value: '#92400E', label: 'Amber', swatch: 'bg-amber-800' },
  { value: '#065F46', label: 'Green', swatch: 'bg-green-800' },
  { value: '#1E40AF', label: 'Blue', swatch: 'bg-blue-800' },
  { value: '#6B21A8', label: 'Purple', swatch: 'bg-purple-800' },
  { value: '#9D174D', label: 'Pink', swatch: 'bg-pink-800' },
  { value: '#6B7280', label: 'Gray', swatch: 'bg-gray-500' },
];

function generateId() {
  return 'cf_' + Math.random().toString(36).substring(2, 9);
}

export function ConditionalFormattingModal({
  columns,
  rules: initialRules,
  isOpen,
  onClose,
  onSave,
}: {
  columns: any[];
  rules: FormattingRule[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (rules: FormattingRule[]) => void;
}) {
  const [rules, setRules] = useState<FormattingRule[]>(initialRules);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showCustomBg, setShowCustomBg] = useState<string | null>(null);
  const [showCustomText, setShowCustomText] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRules(initialRules);
      setExpandedRule(null);
    }
  }, [isOpen, initialRules]);

  // Filter to only formattable columns (no system, no approval_status)
  const formattableColumns = columns.filter(
    (c: any) => !c.isSystem && c.type !== 'approval_status'
  );

  function addRule() {
    const firstCol = formattableColumns[0];
    const newRule: FormattingRule = {
      id: generateId(),
      columnId: firstCol?.id || '',
      operator: 'equals',
      value: '',
      target: 'row',
      targetColumnId: undefined,
      bgColor: '#FEE2E2',
      textColor: '',
      bold: false,
    };
    setRules(prev => [...prev, newRule]);
    setExpandedRule(newRule.id);
  }

  function updateRule(id: string, updates: Partial<FormattingRule>) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }

  function removeRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
    if (expandedRule === id) setExpandedRule(null);
  }

  function duplicateRule(id: string) {
    const original = rules.find(r => r.id === id);
    if (!original) return;
    const dup: FormattingRule = { ...original, id: generateId() };
    const idx = rules.findIndex(r => r.id === id);
    const newRules = [...rules];
    newRules.splice(idx + 1, 0, dup);
    setRules(newRules);
    setExpandedRule(dup.id);
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newRules = [...rules];
    const [moved] = newRules.splice(dragIndex, 1);
    newRules.splice(index, 0, moved);
    setRules(newRules);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleSave() {
    // Filter out rules with no column selected
    const validRules = rules.filter(r => r.columnId);
    onSave(validRules);
    onClose();
  }

  function getColumnName(columnId: string) {
    const col = formattableColumns.find((c: any) => c.id === columnId);
    return col?.name || 'Unknown';
  }

  function getColumnType(columnId: string) {
    const col = formattableColumns.find((c: any) => c.id === columnId);
    return col?.type || 'text';
  }

  function getSelectOptions(columnId: string) {
    const col = formattableColumns.find((c: any) => c.id === columnId);
    return col?.settings?.options || [];
  }

  function needsValueInput(operator: string) {
    return !['is_empty', 'is_not_empty'].includes(operator);
  }

  function getRuleSummary(rule: FormattingRule) {
    const colName = getColumnName(rule.columnId);
    const op = OPERATORS.find(o => o.value === rule.operator)?.label || rule.operator;
    const val = needsValueInput(rule.operator) ? ` "${rule.value}"` : '';
    const target = rule.target === 'row' ? 'entire row' : getColumnName(rule.targetColumnId || '');
    return `When ${colName} ${op}${val} → format ${target}`;
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Conditional Formatting</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Color rows and cells based on rules. Last matching rule wins.</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Rules List */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {rules.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-3xl mb-3">🎨</div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No formatting rules yet</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Add rules to highlight rows and cells based on conditions</p>
                <button onClick={addRule} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  + Add Rule
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule, index) => {
                  const isExpanded = expandedRule === rule.id;
                  const isDragOver = dragOverIndex === index;

                  return (
                    <div
                      key={rule.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                      onDrop={() => handleDrop(index)}
                      className={`border rounded-lg transition-all ${
                        isDragOver ? 'border-blue-400 bg-blue-50' :
                        isExpanded ? 'border-blue-300 bg-white dark:bg-gray-900 shadow-sm' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                      }`}
                    >
                      {/* Rule Header (collapsed view) */}
                      <div className="flex items-center px-3 py-2.5 cursor-pointer" onClick={() => setExpandedRule(isExpanded ? null : rule.id)}>
                        <div className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 mr-2 flex-shrink-0" title="Drag to reorder">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 6a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm8-16a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4z"/>
                          </svg>
                        </div>

                        {/* Color preview */}
                        <div
                          className="w-5 h-5 rounded border border-gray-200 mr-2.5 flex-shrink-0"
                          style={{ backgroundColor: rule.bgColor || '#fff' }}
                        />

                        <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">
                          {getRuleSummary(rule)}
                        </span>

                        <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); duplicateRule(rule.id); }} className="p-1 text-gray-400 hover:text-blue-500 transition-colors" title="Duplicate">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); removeRule(rule.id); }} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {/* Expanded Rule Editor */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                          {/* Condition Row */}
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">When</label>
                            <div className="flex space-x-1.5">
                              <select
                                value={rule.columnId}
                                onChange={(e) => updateRule(rule.id, { columnId: e.target.value, value: '' })}
                                className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
                              >
                                {formattableColumns.map((col: any) => (
                                  <option key={col.id} value={col.id}>{col.name}</option>
                                ))}
                              </select>
                              <select
                                value={rule.operator}
                                onChange={(e) => updateRule(rule.id, { operator: e.target.value })}
                                className="w-36 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
                              >
                                {OPERATORS.map(op => (
                                  <option key={op.value} value={op.value}>{op.label}</option>
                                ))}
                              </select>
                            </div>

                            {/* Value input */}
                            {needsValueInput(rule.operator) && (
                              <div className="mt-1.5">
                                {['select', 'multiselect'].includes(getColumnType(rule.columnId)) ? (
                                  <select
                                    value={rule.value}
                                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
                                  >
                                    <option value="">Select a value...</option>
                                    {getSelectOptions(rule.columnId).map((opt: any) => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                ) : ['checkbox'].includes(getColumnType(rule.columnId)) ? (
                                  <select
                                    value={rule.value}
                                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
                                  >
                                    <option value="true">Checked</option>
                                    <option value="false">Unchecked</option>
                                  </select>
                                ) : (
                                  <input
                                    type={['number', 'currency', 'percent', 'rating'].includes(getColumnType(rule.columnId)) ? 'number' : 'text'}
                                    value={rule.value}
                                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                                    placeholder="Enter value..."
                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
                                  />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Target */}
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Apply to</label>
                            <div className="flex space-x-1.5">
                              <button
                                onClick={() => updateRule(rule.id, { target: 'row', targetColumnId: undefined })}
                                className={`flex-1 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                                  rule.target === 'row' ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                              >
                                Entire Row
                              </button>
                              <button
                                onClick={() => updateRule(rule.id, { target: 'cell', targetColumnId: rule.columnId })}
                                className={`flex-1 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                                  rule.target === 'cell' ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                              >
                                Specific Cell
                              </button>
                            </div>
                            {rule.target === 'cell' && (
                              <select
                                value={rule.targetColumnId || rule.columnId}
                                onChange={(e) => updateRule(rule.id, { targetColumnId: e.target.value })}
                                className="w-full mt-1.5 px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-1 focus:ring-blue-500"
                              >
                                {formattableColumns.map((col: any) => (
                                  <option key={col.id} value={col.id}>{col.name}</option>
                                ))}
                              </select>
                            )}
                          </div>

                          {/* Formatting */}
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Format</label>

                            {/* Background color */}
                            <div className="mb-2.5">
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 mb-1 block">Background</span>
                              <div className="flex items-center flex-wrap gap-1.5">
                                {PRESET_BG_COLORS.map(c => (
                                  <button
                                    key={c.value}
                                    onClick={() => updateRule(rule.id, { bgColor: c.value })}
                                    className={`w-6 h-6 rounded-md transition-all ${c.swatch} ${
                                      rule.bgColor === c.value ? 'ring-2 ring-blue-500 ring-offset-1 scale-110' : 'hover:scale-105'
                                    }`}
                                    title={c.label}
                                  />
                                ))}
                                <div className="relative">
                                  <button
                                    onClick={() => setShowCustomBg(showCustomBg === rule.id ? null : rule.id)}
                                    className={`w-6 h-6 rounded-md border border-gray-300 text-[8px] font-bold text-gray-400 hover:text-gray-600 transition-colors ${
                                      rule.bgColor && !PRESET_BG_COLORS.find(p => p.value === rule.bgColor) ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                                    }`}
                                    style={rule.bgColor && !PRESET_BG_COLORS.find(p => p.value === rule.bgColor) ? { backgroundColor: rule.bgColor } : {}}
                                    title="Custom color"
                                  >
                                    {rule.bgColor && !PRESET_BG_COLORS.find(p => p.value === rule.bgColor) ? '' : '#'}
                                  </button>
                                  {showCustomBg === rule.id && (
                                    <div className="absolute top-8 left-0 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2">
                                      <input
                                        type="color"
                                        value={rule.bgColor || '#ffffff'}
                                        onChange={(e) => updateRule(rule.id, { bgColor: e.target.value })}
                                        className="w-8 h-8 cursor-pointer border-0"
                                      />
                                      <input
                                        type="text"
                                        value={rule.bgColor || ''}
                                        onChange={(e) => updateRule(rule.id, { bgColor: e.target.value })}
                                        placeholder="#hex"
                                        className="w-20 mt-1 px-1.5 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-gray-200"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Text color */}
                            <div className="mb-2.5">
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 mb-1 block">Text color</span>
                              <div className="flex items-center flex-wrap gap-1.5">
                                {PRESET_TEXT_COLORS.map(c => (
                                  <button
                                    key={c.value}
                                    onClick={() => updateRule(rule.id, { textColor: c.value })}
                                    className={`w-6 h-6 rounded-md transition-all ${c.swatch} ${
                                      rule.textColor === c.value ? 'ring-2 ring-blue-500 ring-offset-1 scale-110' : 'hover:scale-105'
                                    }`}
                                    title={c.label}
                                  />
                                ))}
                                <div className="relative">
                                  <button
                                    onClick={() => setShowCustomText(showCustomText === rule.id ? null : rule.id)}
                                    className={`w-6 h-6 rounded-md border border-gray-300 text-[8px] font-bold text-gray-400 hover:text-gray-600 transition-colors ${
                                      rule.textColor && !PRESET_TEXT_COLORS.find(p => p.value === rule.textColor) ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                                    }`}
                                    style={rule.textColor && !PRESET_TEXT_COLORS.find(p => p.value === rule.textColor) ? { backgroundColor: rule.textColor } : {}}
                                    title="Custom color"
                                  >
                                    {rule.textColor && !PRESET_TEXT_COLORS.find(p => p.value === rule.textColor) ? '' : '#'}
                                  </button>
                                  {showCustomText === rule.id && (
                                    <div className="absolute top-8 left-0 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2">
                                      <input
                                        type="color"
                                        value={rule.textColor || '#000000'}
                                        onChange={(e) => updateRule(rule.id, { textColor: e.target.value })}
                                        className="w-8 h-8 cursor-pointer border-0"
                                      />
                                      <input
                                        type="text"
                                        value={rule.textColor || ''}
                                        onChange={(e) => updateRule(rule.id, { textColor: e.target.value })}
                                        placeholder="#hex"
                                        className="w-20 mt-1 px-1.5 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-gray-200"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Bold toggle */}
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={rule.bold}
                                onChange={(e) => updateRule(rule.id, { bold: e.target.checked })}
                                className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded"
                              />
                              <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">Bold text</span>
                            </label>
                          </div>

                          {/* Live Preview */}
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Preview</label>
                            <div
                              className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs"
                              style={{
                                backgroundColor: rule.bgColor || undefined,
                                color: rule.textColor || undefined,
                                fontWeight: rule.bold ? 700 : 400,
                              }}
                            >
                              Sample row data — this is how matching {rule.target === 'row' ? 'rows' : 'cells'} will look
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
            <button onClick={addRule} className="flex items-center space-x-1.5 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <span>Add Rule</span>
            </button>
            <div className="flex items-center space-x-2">
              <button onClick={onClose} className="px-4 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button onClick={handleSave} className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Rules</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Evaluate formatting rules against a row and return style objects.
 * Returns { rowStyle, cellStyles } where cellStyles is a map of columnId -> style.
 * Last matching rule wins (per target).
 */
export function evaluateFormattingRules(
  rules: FormattingRule[],
  row: any,
  columns: any[]
): { rowStyle: React.CSSProperties; cellStyles: Record<string, React.CSSProperties> } {
  const rowStyle: React.CSSProperties = {};
  const cellStyles: Record<string, React.CSSProperties> = {};

  for (const rule of rules) {
    if (!rule.columnId) continue;

    const cellValue = row.data?.[rule.columnId];
    const strValue = cellValue != null ? String(cellValue) : '';
    let matches = false;

    switch (rule.operator) {
      case 'equals':
        matches = strValue.toLowerCase() === rule.value.toLowerCase();
        break;
      case 'not_equals':
        matches = strValue.toLowerCase() !== rule.value.toLowerCase();
        break;
      case 'contains':
        matches = strValue.toLowerCase().includes(rule.value.toLowerCase());
        break;
      case 'not_contains':
        matches = !strValue.toLowerCase().includes(rule.value.toLowerCase());
        break;
      case 'greater_than': {
        const num = parseFloat(strValue);
        const target = parseFloat(rule.value);
        matches = !isNaN(num) && !isNaN(target) && num > target;
        break;
      }
      case 'less_than': {
        const num = parseFloat(strValue);
        const target = parseFloat(rule.value);
        matches = !isNaN(num) && !isNaN(target) && num < target;
        break;
      }
      case 'is_empty':
        matches = !cellValue || (typeof cellValue === 'string' && !cellValue.trim());
        break;
      case 'is_not_empty':
        matches = !!cellValue && (typeof cellValue !== 'string' || cellValue.trim().length > 0);
        break;
    }

    if (matches) {
      const style: React.CSSProperties = {};
      if (rule.bgColor) style.backgroundColor = rule.bgColor;
      if (rule.textColor) style.color = rule.textColor;
      if (rule.bold) style.fontWeight = 700;

      if (rule.target === 'row') {
        Object.assign(rowStyle, style);
      } else if (rule.target === 'cell') {
        const targetCol = rule.targetColumnId || rule.columnId;
        cellStyles[targetCol] = { ...cellStyles[targetCol], ...style };
      }
    }
  }

  return { rowStyle, cellStyles };
}