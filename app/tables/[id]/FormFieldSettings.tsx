'use client';

export function FormFieldSettings({
  field,
  fieldIndex,
  allFields,
  onUpdate,
  onClose,
}: {
  field: any;
  fieldIndex: number;
  allFields: any[];
  onUpdate: (index: number, updates: any) => void;
  onClose: () => void;
}) {
  function update(updates: any) {
    onUpdate(fieldIndex, updates);
  }

  const isNumericType = ['number', 'currency', 'percent', 'rating'].includes(field.columnType);
  const isCalculated = field.calculated === true;

  // Build repeating group aggregate options for formula builder
  const rgAggregateOptions: { label: string; value: string; rgFieldId: string; columnName: string }[] = [];
  allFields.filter(f => f.type === 'repeating_group').forEach(rgField => {
    const cols = rgField.columnsPerRow || [];
    cols.forEach((colName: string) => {
      rgAggregateOptions.push({
        label: '\u03A3 ' + rgField.label + ' \u2192 ' + colName,
        value: 'rg_agg__' + rgField.columnId + '__' + colName,
        rgFieldId: rgField.columnId,
        columnName: colName,
      });
    });
  });

  return (
    <div className="w-[260px] border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-800/50">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-2 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{field.label}</span>
        {isCalculated && <span className="text-[8px] bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1 rounded font-bold">ƒ</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Label */}
        <div>
          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Label</label>
          <input type="text" value={field.label} onChange={e => update({ label: e.target.value })}
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" />
        </div>

        {/* Help Text */}
        <div>
          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Help Text</label>
          <input type="text" value={field.description || ''} onChange={e => update({ description: e.target.value })}
            placeholder="Shown below the field..."
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" />
        </div>

        {/* Placeholder */}
        {field.type !== 'section_header' && !isCalculated && (
          <div>
            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Placeholder</label>
            <input type="text" value={field.placeholder || ''} onChange={e => update({ placeholder: e.target.value })}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" />
          </div>
        )}

        {/* Toggles */}
        {field.type !== 'section_header' && (
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5">
            {!isCalculated && (
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input type="checkbox" checked={field.required || false} onChange={() => update({ required: !field.required })}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600" />
                <span className="text-[10px] text-gray-700 dark:text-gray-300">Required</span>
              </label>
            )}
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input type="checkbox" checked={field.visible !== false} onChange={() => update({ visible: field.visible === false })}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600" />
              <span className="text-[10px] text-gray-700 dark:text-gray-300">Visible</span>
            </label>
            {!isCalculated && (
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input type="checkbox" checked={field.readOnly || false} onChange={() => update({ readOnly: !field.readOnly })}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-orange-600" />
                <span className="text-[10px] text-gray-700 dark:text-gray-300">Read-only</span>
              </label>
            )}
          </div>
        )}

        {/* Calculated Field Toggle — only for numeric column types */}
        {isNumericType && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <label className="flex items-center space-x-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={isCalculated}
                onChange={() => {
                  if (isCalculated) {
                    update({ calculated: false, formula: undefined, readOnly: false });
                  } else {
                    update({ calculated: true, readOnly: true, required: false, formula: { operations: [], format: field.columnType === 'currency' ? 'currency' : field.columnType === 'percent' ? 'percent' : 'number', decimals: 2, prefix: field.columnType === 'currency' ? '$' : '' } });
                  }
                }}
                className="w-3.5 h-3.5 rounded border-gray-300 text-orange-600"
              />
              <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Enable Live Calculation</span>
            </label>

            {isCalculated && (
              <div className="space-y-2 bg-orange-50/50 dark:bg-orange-900/10 rounded-lg p-2 border border-orange-200 dark:border-orange-800">
                <h6 className="text-[9px] font-bold text-orange-600 dark:text-orange-400 uppercase">Formula Builder</h6>

                {/* Visual formula display */}
                <div className="min-h-[36px] px-2 py-1.5 bg-white dark:bg-gray-800 border-2 border-orange-300 dark:border-orange-700 rounded-lg flex flex-wrap items-center gap-1">
                  {(field.formula?.operations || []).length === 0 && (
                    <span className="text-[10px] text-gray-400 italic">Click columns below to build formula...</span>
                  )}
                  {(field.formula?.operations || []).map((op: any, oi: number) => {
                    const isRgAgg = op.type === 'rg_aggregate';
                    if (oi > 0) {
                      return (
                        <span key={'op-' + oi} className="flex items-center">
                          <select
                            value={op.operator || '+'}
                            onChange={e => {
                              const ops = [...(field.formula?.operations || [])];
                              ops[oi] = { ...ops[oi], operator: e.target.value };
                              update({ formula: { ...field.formula, operations: ops } });
                            }}
                            className="w-7 h-6 text-[11px] font-bold text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 border-0 rounded text-center cursor-pointer appearance-none px-0"
                          >
                            <option value="+">+</option>
                            <option value="-">−</option>
                            <option value="*">×</option>
                            <option value="/">÷</option>
                          </select>
                          {isRgAgg ? (
                            <span className="inline-flex items-center space-x-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 px-1.5 py-0.5 rounded text-[9px] font-bold">
                              <span>Σ {rgAggregateOptions.find(r => r.rgFieldId === op.rgFieldId && r.columnName === op.columnName)?.label || op.columnName}</span>
                              <select value={op.aggregation || 'sum'} onChange={e => { const ops = [...(field.formula?.operations || [])]; ops[oi] = { ...ops[oi], aggregation: e.target.value }; update({ formula: { ...field.formula, operations: ops } }); }} className="w-10 text-[8px] bg-transparent border-0 font-bold text-teal-600 cursor-pointer">
                                <option value="sum">SUM</option><option value="avg">AVG</option><option value="min">MIN</option><option value="max">MAX</option><option value="count">CNT</option>
                              </select>
                              <button onClick={() => { const ops = (field.formula?.operations || []).filter((_: any, i: number) => i !== oi); update({ formula: { ...field.formula, operations: ops } }); }} className="text-teal-400 hover:text-red-500 ml-0.5">×</button>
                            </span>
                          ) : op.fieldId === '__constant' ? (
                            <span className="inline-flex items-center bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[9px] font-bold text-gray-700 dark:text-gray-300">
                              <input type="number" value={op.constantValue ?? ''} onChange={e => { const ops = [...(field.formula?.operations || [])]; ops[oi] = { ...ops[oi], constantValue: parseFloat(e.target.value) || 0 }; update({ formula: { ...field.formula, operations: ops } }); }} className="w-10 bg-transparent border-0 text-[9px] font-bold text-center" placeholder="0" />
                              <button onClick={() => { const ops = (field.formula?.operations || []).filter((_: any, i: number) => i !== oi); update({ formula: { ...field.formula, operations: ops } }); }} className="text-gray-400 hover:text-red-500 ml-0.5">×</button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-bold">
                              {allFields.find(f => f.columnId === op.fieldId)?.label || 'Unknown'}
                              <button onClick={() => { const ops = (field.formula?.operations || []).filter((_: any, i: number) => i !== oi); update({ formula: { ...field.formula, operations: ops } }); }} className="text-blue-400 hover:text-red-500 ml-1">×</button>
                            </span>
                          )}
                        </span>
                      );
                    }
                    // First operand (no operator before it)
                    if (isRgAgg) {
                      return (
                        <span key={'op-' + oi} className="inline-flex items-center space-x-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          <span>Σ {rgAggregateOptions.find(r => r.rgFieldId === op.rgFieldId && r.columnName === op.columnName)?.label || op.columnName}</span>
                          <select value={op.aggregation || 'sum'} onChange={e => { const ops = [...(field.formula?.operations || [])]; ops[oi] = { ...ops[oi], aggregation: e.target.value }; update({ formula: { ...field.formula, operations: ops } }); }} className="w-10 text-[8px] bg-transparent border-0 font-bold text-teal-600 cursor-pointer">
                            <option value="sum">SUM</option><option value="avg">AVG</option><option value="min">MIN</option><option value="max">MAX</option><option value="count">CNT</option>
                          </select>
                          <button onClick={() => { const ops = (field.formula?.operations || []).filter((_: any, i: number) => i !== oi); update({ formula: { ...field.formula, operations: ops } }); }} className="text-teal-400 hover:text-red-500 ml-0.5">×</button>
                        </span>
                      );
                    }
                    if (op.fieldId === '__constant') {
                      return (
                        <span key={'op-' + oi} className="inline-flex items-center bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[9px] font-bold text-gray-700 dark:text-gray-300">
                          <input type="number" value={op.constantValue ?? ''} onChange={e => { const ops = [...(field.formula?.operations || [])]; ops[oi] = { ...ops[oi], constantValue: parseFloat(e.target.value) || 0 }; update({ formula: { ...field.formula, operations: ops } }); }} className="w-10 bg-transparent border-0 text-[9px] font-bold text-center" placeholder="0" />
                          <button onClick={() => { const ops = (field.formula?.operations || []).filter((_: any, i: number) => i !== oi); update({ formula: { ...field.formula, operations: ops } }); }} className="text-gray-400 hover:text-red-500 ml-0.5">×</button>
                        </span>
                      );
                    }
                    return (
                      <span key={'op-' + oi} className="inline-flex items-center bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-bold">
                        {allFields.find(f => f.columnId === op.fieldId)?.label || 'Unknown'}
                        <button onClick={() => { const ops = (field.formula?.operations || []).filter((_: any, i: number) => i !== oi); update({ formula: { ...field.formula, operations: ops } }); }} className="text-blue-400 hover:text-red-500 ml-1">×</button>
                      </span>
                    );
                  })}
                </div>

                {/* Operator buttons */}
                <div className="flex items-center space-x-1">
                  <span className="text-[8px] text-gray-400 mr-1">Operators:</span>
                  {[{ label: '+', value: '+' }, { label: '−', value: '-' }, { label: '×', value: '*' }, { label: '÷', value: '/' }].map(op => (
                    <button key={op.value} onClick={() => {
                      const ops = [...(field.formula?.operations || [])];
                      if (ops.length === 0) return;
                      ops.push({ fieldId: '', operator: op.value, type: 'field' });
                      update({ formula: { ...field.formula, operations: ops } });
                    }} className="w-6 h-6 text-[11px] font-bold rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 disabled:opacity-30" disabled={(field.formula?.operations || []).length === 0}>
                      {op.label}
                    </button>
                  ))}
                  <button onClick={() => {
                    const ops = [...(field.formula?.operations || [])];
                    if (ops.length === 0) return;
                    ops.push({ fieldId: '__constant', operator: '+', type: 'field', constantValue: 0 });
                    update({ formula: { ...field.formula, operations: ops } });
                  }} className="px-1.5 h-6 text-[8px] font-bold rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 disabled:opacity-30" disabled={(field.formula?.operations || []).length === 0}>
                    123
                  </button>
                </div>

                {/* Dynamic content — clickable columns */}
                <div>
                  <span className="text-[8px] font-bold text-gray-400 uppercase">Dynamic Content</span>
                  <div className="mt-1 flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                    {allFields
                      .filter(f => f.columnId !== field.columnId && ['number', 'currency', 'percent', 'rating'].includes(f.columnType || ''))
                      .map(f => (
                        <button key={f.columnId} onClick={() => {
                          const ops = [...(field.formula?.operations || [])];
                          if (ops.length > 0 && ops[ops.length - 1].fieldId !== '' && ops[ops.length - 1].fieldId !== '__constant' && ops[ops.length - 1].type !== 'rg_aggregate') {
                            ops.push({ fieldId: f.columnId, operator: '+', type: 'field' });
                          } else if (ops.length > 0 && (ops[ops.length - 1].fieldId === '' || ops[ops.length - 1].fieldId === undefined)) {
                            ops[ops.length - 1] = { ...ops[ops.length - 1], fieldId: f.columnId, type: 'field' };
                          } else {
                            ops.push({ fieldId: f.columnId, operator: '+', type: 'field' });
                          }
                          update({ formula: { ...field.formula, operations: ops } });
                        }} className="px-2 py-1 text-[9px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          {f.label}
                        </button>
                      ))}
                    {/* Calculated fields */}
                    {allFields
                      .filter(f => f.columnId !== field.columnId && (f.type === 'calculated' || f.calculated))
                      .map(f => (
                        <button key={f.columnId} onClick={() => {
                          const ops = [...(field.formula?.operations || [])];
                          if (ops.length > 0 && ops[ops.length - 1].fieldId !== '' && ops[ops.length - 1].fieldId !== '__constant' && ops[ops.length - 1].type !== 'rg_aggregate') {
                            ops.push({ fieldId: f.columnId, operator: '+', type: 'field' });
                          } else if (ops.length > 0 && (ops[ops.length - 1].fieldId === '' || ops[ops.length - 1].fieldId === undefined)) {
                            ops[ops.length - 1] = { ...ops[ops.length - 1], fieldId: f.columnId, type: 'field' };
                          } else {
                            ops.push({ fieldId: f.columnId, operator: '+', type: 'field' });
                          }
                          update({ formula: { ...field.formula, operations: ops } });
                        }} className="px-2 py-1 text-[9px] font-medium bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 rounded hover:bg-orange-100 transition-colors">
                          ƒ {f.label}
                        </button>
                      ))}
                  </div>
                  {/* Repeating group aggregates */}
                  {rgAggregateOptions.length > 0 && (
                    <div className="mt-2">
                      <span className="text-[8px] font-bold text-teal-500 uppercase">Repeating Group Totals</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {rgAggregateOptions.map(rga => (
                          <button key={rga.value} onClick={() => {
                            const ops = [...(field.formula?.operations || [])];
                            const newOp = { type: 'rg_aggregate', rgFieldId: rga.rgFieldId, columnName: rga.columnName, aggregation: 'sum', operator: '+' };
                            if (ops.length > 0 && (ops[ops.length - 1].fieldId === '' || ops[ops.length - 1].fieldId === undefined) && ops[ops.length - 1].type !== 'rg_aggregate') {
                              ops[ops.length - 1] = { ...ops[ops.length - 1], ...newOp };
                            } else {
                              ops.push(newOp);
                            }
                            update({ formula: { ...field.formula, operations: ops } });
                          }} className="px-2 py-1 text-[9px] font-medium bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800 rounded hover:bg-teal-100 transition-colors">
                            Σ {rga.columnName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Display format */}
                <div className="space-y-1.5 pt-2 border-t border-orange-200 dark:border-orange-700">
                  <h6 className="text-[9px] font-bold text-orange-500 uppercase">Display</h6>
                  <select
                    value={field.formula?.format || 'number'}
                    onChange={e => update({ formula: { ...field.formula, format: e.target.value, prefix: e.target.value === 'currency' ? '$' : '' } })}
                    className="w-full px-2 py-1 text-[10px] border border-orange-300 dark:border-orange-700 rounded bg-white dark:bg-gray-800 dark:text-gray-200"
                  >
                    <option value="number">Number</option>
                    <option value="currency">Currency ($)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] text-orange-500 mb-0.5">Prefix</label>
                      <input type="text" value={field.formula?.prefix || ''} onChange={e => update({ formula: { ...field.formula, prefix: e.target.value } })} placeholder="$"
                        className="w-full px-2 py-1 text-[10px] border border-orange-300 dark:border-orange-700 rounded bg-white dark:bg-gray-800 dark:text-gray-200" />
                    </div>
                    <div>
                      <label className="block text-[9px] text-orange-500 mb-0.5">Decimals</label>
                      <input type="number" value={field.formula?.decimals ?? 2} onChange={e => update({ formula: { ...field.formula, decimals: parseInt(e.target.value) || 0 } })} min="0" max="6"
                        className="w-full px-2 py-1 text-[10px] border border-orange-300 dark:border-orange-700 rounded bg-white dark:bg-gray-800 dark:text-gray-200" />
                    </div>
                  </div>
                </div>

                <p className="text-[8px] text-orange-400 dark:text-orange-600 italic">Field will be read-only and auto-calculated on the live form.</p>
              </div>
            )}
          </div>
        )}

        {/* Validation */}
        {field.type !== 'section_header' && !isCalculated && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <h5 className="text-[9px] font-bold text-gray-400 uppercase mb-2">Validation</h5>

            {['text', 'textarea', 'email', 'url', 'phone'].includes(field.columnType) && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] text-gray-400 mb-0.5">Min Length</label>
                    <input type="number" value={field.validation?.minLength || ''} onChange={e => update({ validation: { ...field.validation, minLength: e.target.value ? parseInt(e.target.value) : undefined } })}
                      className="w-full px-2 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200" />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400 mb-0.5">Max Length</label>
                    <input type="number" value={field.validation?.maxLength || ''} onChange={e => update({ validation: { ...field.validation, maxLength: e.target.value ? parseInt(e.target.value) : undefined } })}
                      className="w-full px-2 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200" />
                  </div>
                </div>
                {field.columnType === 'email' && (
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input type="checkbox" checked={field.validation?.emailFormat !== false} onChange={e => update({ validation: { ...field.validation, emailFormat: e.target.checked } })}
                      className="w-3 h-3 rounded border-gray-300 text-blue-600" />
                    <span className="text-[10px] text-gray-600 dark:text-gray-300">Validate email format</span>
                  </label>
                )}
                {field.columnType === 'phone' && (
                  <div className="space-y-1.5">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input type="checkbox" checked={field.validation?.phoneFormat !== false} onChange={e => update({ validation: { ...field.validation, phoneFormat: e.target.checked } })}
                        className="w-3 h-3 rounded border-gray-300 text-blue-600" />
                      <span className="text-[10px] text-gray-600 dark:text-gray-300">Validate phone</span>
                    </label>
                    <select value={field.validation?.phonePattern || 'us'} onChange={e => update({ validation: { ...field.validation, phonePattern: e.target.value } })}
                      className="w-full px-2 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200">
                      <option value="us">US — (555) 123-4567</option>
                      <option value="us_simple">US Simple — 5551234567</option>
                      <option value="international">International</option>
                      <option value="any">Any (10+ digits)</option>
                    </select>
                  </div>
                )}
                {field.columnType === 'url' && (
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input type="checkbox" checked={field.validation?.urlFormat !== false} onChange={e => update({ validation: { ...field.validation, urlFormat: e.target.checked } })}
                      className="w-3 h-3 rounded border-gray-300 text-blue-600" />
                    <span className="text-[10px] text-gray-600 dark:text-gray-300">Validate URL format</span>
                  </label>
                )}
                {field.columnType === 'text' && (
                  <div>
                    <label className="block text-[9px] text-gray-400 mb-0.5">Pattern</label>
                    <select value={field.validation?.pattern || 'none'} onChange={e => update({ validation: { ...field.validation, pattern: e.target.value } })}
                      className="w-full px-2 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200">
                      <option value="none">None</option>
                      <option value="letters_only">Letters only</option>
                      <option value="numbers_only">Numbers only</option>
                      <option value="alphanumeric">Alphanumeric</option>
                      <option value="zip_us">US Zip Code</option>
                      <option value="ssn">SSN (XXX-XX-XXXX)</option>
                      <option value="tribal_id">Tribal ID</option>
                      <option value="custom">Custom regex...</option>
                    </select>
                    {field.validation?.pattern === 'custom' && (
                      <input type="text" value={field.validation?.customRegex || ''} onChange={e => update({ validation: { ...field.validation, customRegex: e.target.value } })}
                        placeholder="^[A-Z]{2}\d{4}$"
                        className="w-full mt-1 px-2 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 font-mono" />
                    )}
                  </div>
                )}
              </div>
            )}

            {['number', 'currency', 'percent', 'rating'].includes(field.columnType) && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-gray-400 mb-0.5">Min Value</label>
                  <input type="number" value={field.validation?.min || ''} onChange={e => update({ validation: { ...field.validation, min: e.target.value ? parseFloat(e.target.value) : undefined } })}
                    className="w-full px-2 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200" />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 mb-0.5">Max Value</label>
                  <input type="number" value={field.validation?.max || ''} onChange={e => update({ validation: { ...field.validation, max: e.target.value ? parseFloat(e.target.value) : undefined } })}
                    className="w-full px-2 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200" />
                </div>
              </div>
            )}

            <div className="mt-2">
              <label className="block text-[9px] text-gray-400 mb-0.5">Error Message</label>
              <input type="text" value={field.validation?.errorMessage || ''} onChange={e => update({ validation: { ...field.validation, errorMessage: e.target.value } })}
                placeholder="Custom error text..."
                className="w-full px-2 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200" />
            </div>
          </div>
        )}

        {/* Conditional Logic */}
        {field.type !== 'section_header' && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <h5 className="text-[9px] font-bold text-gray-400 uppercase mb-1.5">Conditional Logic</h5>
            <p className="text-[9px] text-gray-400 mb-2">Show this field only when:</p>
            {(field.conditions || []).map((cond: any, ci: number) => (
              <div key={ci} className="flex items-center space-x-1 mb-1.5 flex-wrap">
                <select value={cond.fieldId || ''} onChange={e => {
                  const nc = [...(field.conditions || [])]; nc[ci] = { ...nc[ci], fieldId: e.target.value };
                  update({ conditions: nc });
                }} className="flex-1 min-w-0 px-1 py-0.5 text-[9px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200">
                  <option value="">Field...</option>
                  {allFields.filter(f => f.columnId !== field.columnId && f.type !== 'section_header' && f.type !== 'divider').map(f => (
                    <option key={f.columnId} value={f.columnId}>{f.label}</option>
                  ))}
                </select>
                <select value={cond.operator || 'equals'} onChange={e => {
                  const nc = [...(field.conditions || [])]; nc[ci] = { ...nc[ci], operator: e.target.value };
                  update({ conditions: nc });
                }} className="px-1 py-0.5 text-[9px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200">
                  <option value="equals">equals</option>
                  <option value="not_equals">≠</option>
                  <option value="contains">contains</option>
                  <option value="not_empty">not empty</option>
                  <option value="is_empty">is empty</option>
                </select>
                {cond.operator !== 'not_empty' && cond.operator !== 'is_empty' && (
                  <input type="text" value={cond.value || ''} onChange={e => {
                    const nc = [...(field.conditions || [])]; nc[ci] = { ...nc[ci], value: e.target.value };
                    update({ conditions: nc });
                  }} placeholder="Value..."
                    className="w-16 px-1 py-0.5 text-[9px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200" />
                )}
                <button onClick={() => {
                  update({ conditions: (field.conditions || []).filter((_: any, i: number) => i !== ci) });
                }} className="text-red-400 hover:text-red-600">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            <button onClick={() => update({ conditions: [...(field.conditions || []), { fieldId: '', operator: 'equals', value: '' }] })}
              className="text-[9px] text-blue-600 dark:text-blue-400 hover:text-blue-800">
              + Add Condition
            </button>
          </div>
        )}

        {/* Move to different page */}
        {field.pageId && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <h5 className="text-[9px] font-bold text-gray-400 uppercase mb-1.5">Page</h5>
            <p className="text-[9px] text-gray-400">Move this field to another page using the page tabs.</p>
          </div>
        )}
      </div>
    </div>
  );
}