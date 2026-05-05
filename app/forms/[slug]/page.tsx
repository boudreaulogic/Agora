'use client';

import { useState, useEffect } from 'react';

var PATTERNS: Record<string, RegExp> = {
  letters_only: /^[a-zA-Z\s]+$/, numbers_only: /^\d+$/, alphanumeric: /^[a-zA-Z0-9\s]+$/,
  no_special: /^[a-zA-Z0-9\s.,'-]+$/, zip_us: /^\d{5}(-\d{4})?$/, ssn: /^\d{3}-\d{2}-\d{4}$/, tribal_id: /^[a-zA-Z0-9-]+$/,
};
var PHONE_PATTERNS: Record<string, RegExp> = {
  us: /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/, us_simple: /^\d{10}$/, international: /^\+?\d[\d\s-]{9,}$/, any: /^\d{10,}$/,
};

function validateField(field: any, value: any): string | null {
  if (field.required && (!value || (typeof value === 'string' && !value.trim()))) return field.validation?.errorMessage || field.label + ' is required';
  if (!value || (typeof value === 'string' && !value.trim())) return null;
  var v = field.validation || {};
  if (v.minLength && typeof value === 'string' && value.length < v.minLength) return v.errorMessage || 'Must be at least ' + v.minLength + ' characters';
  if (v.maxLength && typeof value === 'string' && value.length > v.maxLength) return v.errorMessage || 'Must be no more than ' + v.maxLength + ' characters';
  if (v.min !== undefined && v.min !== '' && parseFloat(value) < v.min) return v.errorMessage || 'Must be at least ' + v.min;
  if (v.max !== undefined && v.max !== '' && parseFloat(value) > v.max) return v.errorMessage || 'Must be no more than ' + v.max;
  if ((v.emailFormat !== false) && field.columnType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return v.errorMessage || 'Please enter a valid email';
  if ((v.phoneFormat !== false) && field.columnType === 'phone') {
    var pattern = PHONE_PATTERNS[v.phonePattern || 'us'] || PHONE_PATTERNS.us;
    if (!pattern.test(value.replace(/\s/g, '')) && !pattern.test(value)) return v.errorMessage || 'Please enter a valid phone number';
  }
  if ((v.urlFormat !== false) && field.columnType === 'url' && !/^https?:\/\/.+\..+/.test(value)) return v.errorMessage || 'Please enter a valid URL';
  if (v.pattern && v.pattern !== 'none') {
    if (v.pattern === 'custom' && v.customRegex) { try { if (!new RegExp(v.customRegex).test(value)) return v.errorMessage || 'Invalid format'; } catch {} }
    else if (PATTERNS[v.pattern] && !PATTERNS[v.pattern].test(value)) return v.errorMessage || 'Invalid format';
  }
  return null;
}

function evaluateConditions(field: any, values: Record<string, any>): boolean {
  if (!field.conditions || field.conditions.length === 0) return true;
  return field.conditions.every(function(cond: any) {
    if (!cond.fieldId) return true;
    var strVal = String(values[cond.fieldId] ?? '');
    switch (cond.operator) {
      case 'equals': return strVal === cond.value;
      case 'not_equals': return strVal !== cond.value;
      case 'contains': return strVal.toLowerCase().includes((cond.value || '').toLowerCase());
      case 'not_empty': return strVal.length > 0;
      case 'is_empty': return strVal.length === 0;
      default: return true;
    }
  });
}

function calcRowFormula(formula: any, row: any, cols: any, values: any): number | null {
  if (!formula || !formula.operations || formula.operations.length === 0) return null;
  var result: number | null = null;
  for (var i = 0; i < formula.operations.length; i++) {
    var op = formula.operations[i];
    var val = 0;
    if (op.isConstant) {
      val = op.constantValue || 0;
    } else if (op.columnIndex !== undefined && op.columnIndex !== null) {
      var fid = row.fields[op.columnIndex];
      if (fid) val = parseFloat(values[fid]) || 0;
    }
    if (result === null) {
      result = val;
    } else {
      switch (op.operator) {
        case '+': result = result + val; break;
        case '-': result = result - val; break;
        case '*': result = result * val; break;
        case '/': result = val !== 0 ? result / val : 0; break;
        default: result = result + val;
      }
    }
  }
  return result;
}

function RgBlock(props: any) {
  var field = props.field;
  var values = props.values;
  var errors = props.errors || {};
  var touched = props.touched || {};
  var onFieldChange = props.onFieldChange;
  var onFieldBlur = props.onFieldBlur;
  var onAddRow = props.onAddRow;
  var onRemoveRow = props.onRemoveRow;
  var visibleCount = props.visibleCount;
  var onCalcUpdate = props.onCalcUpdate;
  var maxRows = field.rows?.length || 0;
  var cols = field.columnsPerRow || [];
  var formulas = field.columnFormulas || {};
  var requiredCols = field.rgRequiredColumns || [];
  var requireMode = field.rgRequireMode || 'none';

  function renderTypedInput(fid: string, colName: string, fieldType: any, value: string, fieldError: string | null) {
    var type = fieldType?.type || 'text';
    var settings = fieldType?.settings || {};
    var baseClass = 'w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ' + (fieldError ? 'border-red-400 bg-red-50 dark:bg-red-900/10' : 'border-gray-300 dark:border-gray-600');
    switch (type) {
      case 'select': {
        var options = settings.options || [];
        return (<div key={fid}><select value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} className={baseClass}><option value="">Select...</option>{options.map(function(o: any) { return <option key={o.value} value={o.value}>{o.label || o.value}</option>; })}</select>{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      }
      case 'multi_select': {
        var msOptions = settings.options || [];
        var selected = value ? value.split(',') : [];
        return (<div key={fid}><div className="flex flex-wrap gap-1 p-2 border rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 min-h-[38px]">{msOptions.map(function(o: any) { var checked = selected.includes(o.value); return (<label key={o.value} className={'flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] cursor-pointer ' + (checked ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500')}><input type="checkbox" checked={checked} onChange={function(e) { var newSel = e.target.checked ? selected.concat([o.value]) : selected.filter(function(v: string) { return v !== o.value; }); onFieldChange(fid, newSel.join(',')); }} className="w-3 h-3" /><span>{o.label || o.value}</span></label>); })}</div>{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      }
      case 'number':
        return (<div key={fid}><input type="number" value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} placeholder={colName || ''} className={baseClass} />{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      case 'currency':
        return (<div key={fid}><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-semibold">$</span><input type="number" step="0.01" value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} placeholder="0.00" className={baseClass + ' pl-7'} /></div>{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      case 'percent':
        return (<div key={fid}><div className="relative"><input type="number" min="0" max="100" value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} placeholder="0" className={baseClass + ' pr-7'} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-semibold">%</span></div>{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      case 'date':
        return (<div key={fid}><input type="date" value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} className={baseClass} />{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      case 'datetime':
        return (<div key={fid}><input type="datetime-local" value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} className={baseClass} />{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      case 'checkbox':
        return (<div key={fid} className="flex items-center py-2"><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={value === 'true' || String(value) === 'true'} onChange={function(e) { onFieldChange(fid, e.target.checked ? 'true' : 'false'); }} className="w-4 h-4 rounded border-gray-300 text-blue-600" /><span className="text-sm text-gray-700 dark:text-gray-300">Yes</span></label></div>);
      case 'email':
        return (<div key={fid}><input type="email" value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} placeholder="email@example.com" className={baseClass} />{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      case 'phone':
        return (<div key={fid}><input type="tel" value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} placeholder="(555) 123-4567" className={baseClass} />{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      case 'url':
        return (<div key={fid}><input type="url" value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} placeholder="https://..." className={baseClass} />{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      case 'long_text': case 'textarea':
        return (<div key={fid}><textarea value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} placeholder={colName || ''} rows={2} className={baseClass + ' resize-none'} />{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
      case 'rating': {
        var maxRating = settings.max || 5;
        var numVal = parseInt(value || '0');
        return (<div key={fid} className="flex items-center space-x-1 py-1">{Array.from({ length: maxRating }, function(_, i) { return i + 1; }).map(function(n) { return (<button key={n} type="button" onClick={function() { onFieldChange(fid, String(n)); }} className={'w-7 h-7 rounded-full text-sm font-medium transition-colors ' + (numVal >= n ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200')}>★</button>); })}{numVal > 0 && <button type="button" onClick={function() { onFieldChange(fid, '0'); }} className="text-[9px] text-gray-400 hover:text-red-500 ml-1">✕</button>}</div>);
      }
      case 'color':
        return (<div key={fid} className="flex items-center space-x-2"><input type="color" value={value || '#3B82F6'} onChange={function(e) { onFieldChange(fid, e.target.value); }} className="w-8 h-8 rounded border border-gray-300 cursor-pointer" /><span className="text-xs text-gray-500">{value || '#3B82F6'}</span></div>);
      case 'formula':
        return (<div key={fid} className="w-full px-3 py-2 text-sm border-2 border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-medium">{value || '—'}<span className="text-[8px] text-purple-400 ml-2">ƒ formula</span></div>);
      default:
        return (<div key={fid}><input type="text" value={value || ''} onChange={function(e) { onFieldChange(fid, e.target.value); }} onBlur={function() { onFieldBlur(fid); }} placeholder={colName || ''} className={baseClass} />{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
    }
  }

  return (
    <div className="border-2 border-teal-200 dark:border-teal-800 rounded-lg p-4 bg-teal-50/30 dark:bg-teal-900/10 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-teal-700 dark:text-teal-400">{field.label}</span>
        <span className="text-xs text-teal-500">{visibleCount} of {maxRows} rows</span>
      </div>
     
      {(field.rows || []).slice(0, visibleCount).map(function(row: any, ri: number) {
        return (
          <div key={ri} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800/50 space-y-3">
            <div className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase">Row {ri + 1}</div>
            {(row.fields || []).map(function(fid: string, ci: number) {
              var colName = cols[ci];
              var formula = formulas[colName];
              var fieldError = touched[fid] ? errors[fid] : null;
              var fieldType = row.fieldTypes ? row.fieldTypes[ci] : null;
              if (formula && formula.operations && formula.operations.length > 0) {
                var calcResult = calcRowFormula(formula, row, cols, values);
                var prefix = formula.format === 'currency' ? (formula.prefix || '$') : '';
                var suffix = formula.format === 'percent' ? '%' : '';
                var decimals = formula.decimals ?? 2;
                var displayVal = calcResult !== null ? calcResult.toFixed(decimals) : '0.' + '0'.repeat(decimals);
                if (values[fid] !== prefix + displayVal + suffix) {
                  setTimeout(function() { onCalcUpdate(fid, calcResult !== null ? String(calcResult) : '0'); }, 0);
                }
                return (
                  <div key={fid}>
                    <label className="block text-xs font-medium text-orange-500 mb-1">{colName} (auto)</label>
                    <div className="w-full px-3 py-2 text-sm border-2 border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 font-semibold">
                      {prefix}{displayVal}{suffix}
                    </div>
                  </div>
                );
              }
              var isReqCol = requiredCols.includes(colName) && requireMode !== 'none';
              return (<div key={fid}><label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{colName}{isReqCol ? <span className="text-red-500 ml-0.5">*</span> : null}</label>{renderTypedInput(fid, colName, fieldType, values[fid] || '', fieldError)}</div>);
            })}
          </div>
        );
      })}
      <div className="flex items-center space-x-3">
        {visibleCount < maxRows && (
          <button type="button" onClick={onAddRow} className="text-sm text-teal-600 dark:text-teal-400 hover:text-teal-800 font-medium">+ Add Row</button>
        )}
        {visibleCount > (field.defaultVisibleRows || 1) && (
          <button type="button" onClick={onRemoveRow} className="text-xs text-gray-400 hover:text-red-500">- Remove Row</button>
        )}
      </div>
    </div>
  );
}

function CustomRgBlock(props: any) {
  var field = props.field;
  var rows = props.rows || [];
  var maxRows = props.maxRows || 10;
  var errors = props.errors || {};
  var touched = props.touched || {};
  var onChange = props.onChange;
  var onAddRow = props.onAddRow;
  var onRemoveRow = props.onRemoveRow;
  var cols = field.customColumns || [];
  var reqCols = field.rgRequiredColumns || [];
  var reqMode = field.rgRequireMode || 'none';

  function updateCell(rowIndex: number, colId: string, value: any) {
    var nr = rows.slice();
    nr[rowIndex] = Object.assign({}, nr[rowIndex], { [colId]: value });
    onChange(nr);
  }

  function renderCustomInput(col: any, value: any, rowIndex: number) {
    var errKey = field.columnId + '__' + rowIndex + '__' + col.id;
    var fieldError = touched[errKey] ? errors[errKey] : null;
    var baseClass = 'w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ' + (fieldError ? 'border-red-400 bg-red-50 dark:bg-red-900/10' : 'border-gray-300 dark:border-gray-600');
    var input = null;
    switch (col.type) {
      case 'textarea':
        input = <textarea value={value || ''} onChange={function(e) { updateCell(rowIndex, col.id, e.target.value); }} placeholder={col.placeholder || col.label} rows={2} className={baseClass} />;
        break;
      case 'number': case 'currency': case 'percent':
        input = <input type="number" value={value || ''} onChange={function(e) { updateCell(rowIndex, col.id, e.target.value); }} placeholder={col.placeholder || col.label} className={baseClass} />;
        break;
      case 'date':
        input = <input type="date" value={value || ''} onChange={function(e) { updateCell(rowIndex, col.id, e.target.value); }} className={baseClass} />;
        break;
      case 'email':
        input = <input type="email" value={value || ''} onChange={function(e) { updateCell(rowIndex, col.id, e.target.value); }} placeholder={col.placeholder || 'email@example.com'} className={baseClass} />;
        break;
      case 'phone':
        input = <input type="tel" value={value || ''} onChange={function(e) { updateCell(rowIndex, col.id, e.target.value); }} placeholder={col.placeholder || '(555) 123-4567'} className={baseClass} />;
        break;
      case 'select':
        input = <select value={value || ''} onChange={function(e) { updateCell(rowIndex, col.id, e.target.value); }} className={baseClass}><option value="">Select...</option>{(col.options || []).map(function(opt: string) { return <option key={opt} value={opt}>{opt}</option>; })}</select>;
        break;
      case 'checkbox':
        input = <label className="flex items-center space-x-2 cursor-pointer py-2"><input type="checkbox" checked={!!value} onChange={function(e) { updateCell(rowIndex, col.id, e.target.checked); }} className="w-4 h-4 rounded border-gray-300 text-blue-600" /><span className="text-sm text-gray-700 dark:text-gray-300">Yes</span></label>;
        break;
      default:
        input = <input type="text" value={value || ''} onChange={function(e) { updateCell(rowIndex, col.id, e.target.value); }} placeholder={col.placeholder || col.label} className={baseClass} />;
    }
    return (<div key={col.id}>{input}{fieldError && <p className="text-[9px] text-red-500 mt-0.5">{fieldError}</p>}</div>);
  }

  return (
    <div className="border-2 border-teal-200 dark:border-teal-800 rounded-lg p-4 bg-teal-50/30 dark:bg-teal-900/10 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-teal-700 dark:text-teal-400">{field.label}</span>
        <span className="text-xs text-teal-500">{rows.length} of {maxRows} rows</span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: cols.map(function(c: string, ci: number) { var ft = (field.rows && field.rows[0] && field.rows[0].fieldTypes) ? field.rows[0].fieldTypes[ci] : null; var t = ft?.type || 'text'; return (t === 'text' || t === 'long_text' || t === 'textarea') ? '2fr' : '1fr'; }).join(' ') }}>
        {cols.map(function(col: any) {
          var isReq = (col.required || reqCols.includes(col.label)) && reqMode !== 'none';
          return <span key={col.id} className="text-[10px] font-semibold uppercase text-gray-500">{col.label}{isReq ? ' *' : ''}</span>;
        })}
      </div>
      {rows.map(function(row: any, ri: number) {
        return (
          <div key={ri} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800/50 space-y-2">
            <div className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase">Row {ri + 1}</div>
            {cols.map(function(col: any) { return renderCustomInput(col, row[col.id], ri); })}
          </div>
        );
      })}
      <div className="flex items-center space-x-3">
        {rows.length < maxRows && (
          <button type="button" onClick={onAddRow} className="text-sm text-teal-600 dark:text-teal-400 hover:text-teal-800 font-medium">+ Add Row</button>
        )}
        {rows.length > (field.defaultVisibleRows || 1) && (
          <button type="button" onClick={onRemoveRow} className="text-xs text-gray-400 hover:text-red-500">- Remove Row</button>
        )}
      </div>
    </div>
  );
}

export default function PublicFormPage(pageProps: any) {
  var params = pageProps.params;
  var formState = useState<any>(null);
  var form = formState[0]; var setForm = formState[1];
  var valuesState = useState<any>({});
  var values = valuesState[0]; var setValues = valuesState[1];
  var errorsState = useState<any>({});
  var errors = errorsState[0]; var setErrors = errorsState[1];
  var touchedState = useState<any>({});
  var touched = touchedState[0]; var setTouched = touchedState[1];
  var loadingState = useState(true);
  var loading = loadingState[0]; var setLoading = loadingState[1];
  var submittingState = useState(false);
  var submitting = submittingState[0]; var setSubmitting = submittingState[1];
  var submittedState = useState(false);
  var submitted = submittedState[0]; var setSubmitted = submittedState[1];
  var tyMsgState = useState('');
  var thankYouMessage = tyMsgState[0]; var setThankYouMessage = tyMsgState[1];
  var feState = useState('');
  var formError = feState[0]; var setFormError = feState[1];
  var cpState = useState(0);
  var currentPage = cpState[0]; var setCurrentPage = cpState[1];
  var peState = useState<any>({});
  var pageErrors = peState[0]; var setPageErrors = peState[1];
  var scState = useState(false);
  var showConfirm = scState[0]; var setShowConfirm = scState[1];
  var rgState = useState<any>({});
  var rgRows = rgState[0]; var setRgRows = rgState[1];
  var crgState = useState<any>({});
  var customRgData = crgState[0]; var setCustomRgData = crgState[1];

  useEffect(function() {
    fetch('/api/public/forms/' + params.slug)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.error) { setFormError(data.error); return; }
        var f = data.form;
        if (!f.pages) { f.pages = [{ id: 'page_1', title: 'Page 1', description: '' }]; f.fields = (f.fields || []).map(function(fld: any) { return Object.assign({}, fld, { pageId: 'page_1' }); }); }
        setForm(f);
        var initial: any = {};
        var rgInit: any = {};
        var crgInit: any = {};
        for (var i = 0; i < f.fields.length; i++) {
          var field = f.fields[i];
          if (field.type === 'repeating_group') {
            rgInit[field.columnId] = field.defaultVisibleRows || 1;
            if (field.rgType === 'custom') {
              var defRows = field.defaultVisibleRows || 1;
              var emptyRows: any[] = [];
              for (var dr = 0; dr < defRows; dr++) {
                var emptyRow: any = {};
                (field.customColumns || []).forEach(function(cc: any) {
                  emptyRow[cc.id] = cc.type === 'checkbox' ? false : '';
                });
                emptyRows.push(emptyRow);
              }
              crgInit[field.columnId] = emptyRows;
            } else {
              for (var ri = 0; ri < (field.rows || []).length; ri++) {
                var row = field.rows[ri];
                for (var fi = 0; fi < (row.fields || []).length; fi++) {
                  initial[row.fields[fi]] = '';
                }
              }
            }
            continue;
          }
          var colDefault = field.settings?.defaultValue;
          if (field.type === 'checkbox' || field.columnType === 'checkbox') {
            initial[field.columnId] = colDefault === 'true' ? true : false;
          } else if (colDefault) {
            var val = colDefault;
            if (val === '__today') {
              val = field.columnType === 'datetime' ? new Date().toISOString().slice(0, 16) : new Date().toISOString().split('T')[0];
            }
            initial[field.columnId] = val;
          } else {
            initial[field.columnId] = '';
          }
        }
        setValues(initial);
        setRgRows(rgInit);
        setCustomRgData(crgInit);
      })
      .catch(function() { setFormError('Failed to load form'); })
      .finally(function() { setLoading(false); });
  }, [params.slug]);

  var pages = form?.pages || [];
  var isMultiPage = pages.length > 1;
  var currentPageObj = pages[currentPage];

  function getVisibleFieldsForPage(pageIndex: number) {
    if (!form) return [];
    var page = pages[pageIndex];
    return form.fields.filter(function(f: any) {
      if (f.pageId !== page.id) return false;
      if (f.visible === false) return false;
      if (f.type === 'section_header' || f.type === 'divider' || f.type === 'calculated') return true;
      if (f.type === 'repeating_group') return evaluateConditions(f, values);
      return evaluateConditions(f, values);
    });
  }

  function validatePage(pageIndex: number) {
    var visibleFields = getVisibleFieldsForPage(pageIndex).filter(function(f: any) { return f.type !== 'section_header' && f.type !== 'divider' && f.type !== 'repeating_group'; });
    var newErrors: any = {};
    visibleFields.forEach(function(field: any) {
      var err = validateField(field, values[field.columnId]);
      if (err) newErrors[field.columnId] = err;
    });
    var rgFields = getVisibleFieldsForPage(pageIndex).filter(function(f: any) { return f.type === 'repeating_group'; });
    rgFields.forEach(function(rgField: any) {
      var mode = rgField.rgRequireMode;
      if (!mode || mode === 'none') return;
      var requiredCols = rgField.rgRequiredColumns || [];
      if (requiredCols.length === 0 && !(rgField.rgType === 'custom')) return;
      if (rgField.rgType === 'custom') {
        var cRows = customRgData[rgField.columnId] || [];
        var customCols = rgField.customColumns || [];
        var cMaxRow = mode === 'first' ? 1 : cRows.length;
        for (var cri = 0; cri < cMaxRow && cri < cRows.length; cri++) {
          for (var cci = 0; cci < customCols.length; cci++) {
            var cc = customCols[cci];
            var isReq = cc.required || requiredCols.includes(cc.label);
            if (!isReq) continue;
            var cval = cRows[cri][cc.id];
            if (!cval || (typeof cval === 'string' && !cval.trim())) {
              newErrors[rgField.columnId + '__' + cri + '__' + cc.id] = cc.label + ' is required (Row ' + (cri + 1) + ')';
            }
          }
        }
      } else {
        if (requiredCols.length === 0) return;
        var cols = rgField.columnsPerRow || [];
        var rows = rgField.rows || [];
        var visibleCount = rgRows[rgField.columnId] || rgField.defaultVisibleRows || 1;
        var maxRow = mode === 'first' ? 1 : visibleCount;
        for (var ri = 0; ri < maxRow && ri < rows.length; ri++) {
          var row = rows[ri];
          for (var ci = 0; ci < cols.length; ci++) {
            var colName = cols[ci];
            if (!requiredCols.includes(colName)) continue;
            var fid = row.fields[ci];
            if (!fid) continue;
            var val = values[fid];
            if (!val || (typeof val === 'string' && !val.trim())) {
              newErrors[fid] = colName + ' is required (Row ' + (ri + 1) + ')';
            }
          }
        }
      }
    });
    return newErrors;
  }

  function handleChange(fieldId: string, val: any) {
    setValues(function(prev: any) { return Object.assign({}, prev, { [fieldId]: val }); });
    setTouched(function(prev: any) { return Object.assign({}, prev, { [fieldId]: true }); });
    if (touched[fieldId]) {
      var field = form.fields.find(function(f: any) { return f.columnId === fieldId; });
      if (field) {
        var err = validateField(field, val);
        setErrors(function(prev: any) { var n = Object.assign({}, prev); if (err) n[fieldId] = err; else delete n[fieldId]; return n; });
      }
    }
  }

  function handleCalcUpdate(fieldId: string, val: string) {
    setValues(function(prev: any) {
      if (prev[fieldId] === val) return prev;
      return Object.assign({}, prev, { [fieldId]: val });
    });
  }

  function handleBlur(fieldId: string) {
    setTouched(function(prev: any) { return Object.assign({}, prev, { [fieldId]: true }); });
    var field = form.fields.find(function(f: any) { return f.columnId === fieldId; });
    if (field) {
      var err = validateField(field, values[fieldId]);
      setErrors(function(prev: any) { var n = Object.assign({}, prev); if (err) n[fieldId] = err; else delete n[fieldId]; return n; });
    }
  }

  function goToPage(pageIndex: number) {
    if (pageIndex > currentPage) {
      var errs = validatePage(currentPage);
      var touchAll: any = {};
      getVisibleFieldsForPage(currentPage).forEach(function(f: any) {
        touchAll[f.columnId] = true;
        if (f.type === 'repeating_group') {
          if (f.rgType === 'custom') {
            var cRows = customRgData[f.columnId] || [];
            var cMaxRow = f.rgRequireMode === 'first' ? 1 : cRows.length;
            for (var cri = 0; cri < cMaxRow && cri < cRows.length; cri++) {
              (f.customColumns || []).forEach(function(cc: any) { touchAll[f.columnId + '__' + cri + '__' + cc.id] = true; });
            }
          } else if (f.rows) {
            var vc = rgRows[f.columnId] || f.defaultVisibleRows || 1;
            var maxRow = f.rgRequireMode === 'first' ? 1 : vc;
            for (var ri = 0; ri < maxRow && ri < f.rows.length; ri++) {
              var row = f.rows[ri];
              for (var fi = 0; fi < (row.fields || []).length; fi++) { touchAll[row.fields[fi]] = true; }
            }
          }
        }
      });
      setTouched(function(prev: any) { return Object.assign({}, prev, touchAll); });
      setErrors(function(prev: any) { return Object.assign({}, prev, errs); });
      var pe = Object.assign({}, pageErrors);
      pe[currentPage] = Object.keys(errs).length;
      setPageErrors(pe);
      if (Object.keys(errs).length > 0) {
        var firstErr = getVisibleFieldsForPage(currentPage).find(function(f: any) { return errs[f.columnId]; });
        if (firstErr) { var el = document.getElementById('field-' + firstErr.columnId); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      }
    }
    setCurrentPage(pageIndex);
  }

  function computeRgAggregate(rgFieldId: string, columnName: string, aggregation: string): number {
    if (!form) return 0;
    var rgField = form.fields.find(function(f: any) { return f.columnId === rgFieldId && f.type === 'repeating_group'; });
    if (!rgField) return 0;
    var cols = rgField.columnsPerRow || [];
    var colIndex = cols.indexOf(columnName);
    if (colIndex === -1) return 0;
    var formulas = rgField.columnFormulas || {};
    var colFormula = formulas[columnName];
    var rowValues: number[] = [];
    var rows = rgField.rows || [];
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      var fid = row.fields[colIndex];
      if (!fid) continue;
      var rowVal = 0;
      if (colFormula && colFormula.operations && colFormula.operations.length > 0) {
        var calcResult = calcRowFormula(colFormula, row, cols, values);
        rowVal = calcResult !== null ? calcResult : 0;
      } else { rowVal = parseFloat(values[fid]) || 0; }
      rowValues.push(rowVal);
    }
    if (rowValues.length === 0) return 0;
    switch (aggregation) {
      case 'sum': { var sum = 0; for (var si = 0; si < rowValues.length; si++) sum = sum + rowValues[si]; return sum; }
      case 'avg': { var total = 0; for (var ai = 0; ai < rowValues.length; ai++) total = total + rowValues[ai]; return total / rowValues.length; }
      case 'min': { var mn = rowValues[0]; for (var mi = 1; mi < rowValues.length; mi++) { if (rowValues[mi] < mn) mn = rowValues[mi]; } return mn; }
      case 'max': { var mx = rowValues[0]; for (var mxi = 1; mxi < rowValues.length; mxi++) { if (rowValues[mxi] > mx) mx = rowValues[mxi]; } return mx; }
      case 'count': { var cnt = 0; for (var ci = 0; ci < rowValues.length; ci++) { if (rowValues[ci] !== 0) cnt = cnt + 1; } return cnt; }
      default: { var defSum = 0; for (var di = 0; di < rowValues.length; di++) defSum = defSum + rowValues[di]; return defSum; }
    }
  }

  function evaluateFormula(field: any): number | null {
    var formula = field.formula;
    if (!formula?.operations?.length) return null;
    var result: number | null = null;
    for (var i = 0; i < formula.operations.length; i++) {
      var op = formula.operations[i];
      var operandValue = 0;
      if (op.type === 'rg_aggregate') { operandValue = computeRgAggregate(op.rgFieldId, op.columnName, op.aggregation || 'sum'); }
      else if (op.fieldId === '__constant') { operandValue = op.constantValue || 0; }
      else if (op.fieldId) {
        var refField = form.fields.find(function(f: any) { return f.columnId === op.fieldId; });
        if (refField?.type === 'calculated' || refField?.calculated) { operandValue = evaluateFormula(refField) ?? 0; }
        else { operandValue = parseFloat(values[op.fieldId]) || 0; }
      }
      if (result === null) { result = operandValue; } else {
        switch (op.operator) {
          case '+': result = result + operandValue; break;
          case '-': result = result - operandValue; break;
          case '*': result = result * operandValue; break;
          case '/': result = operandValue !== 0 ? result / operandValue : 0; break;
          default: result = result + operandValue;
        }
      }
    }
    return result;
  }

  function handleSubmit(e?: any) {
    if (e) e.preventDefault();
    setShowConfirm(false); setFormError('');
    var allErrors: any = {}; var allTouched: any = {}; var pe: any = {};
    pages.forEach(function(_: any, pi: number) {
      var errs = validatePage(pi);
      Object.assign(allErrors, errs);
      getVisibleFieldsForPage(pi).forEach(function(f: any) {
        allTouched[f.columnId] = true;
        if (f.type === 'repeating_group') {
          if (f.rgType === 'custom') {
            var cRows = customRgData[f.columnId] || [];
            var cMaxRow = f.rgRequireMode === 'first' ? 1 : cRows.length;
            for (var cri = 0; cri < cMaxRow && cri < cRows.length; cri++) { (f.customColumns || []).forEach(function(cc: any) { allTouched[f.columnId + '__' + cri + '__' + cc.id] = true; }); }
          } else if (f.rows) {
            var vc = rgRows[f.columnId] || f.defaultVisibleRows || 1;
            var maxRow = f.rgRequireMode === 'first' ? 1 : vc;
            for (var ri = 0; ri < maxRow && ri < f.rows.length; ri++) { var row = f.rows[ri]; for (var fi = 0; fi < (row.fields || []).length; fi++) { allTouched[row.fields[fi]] = true; } }
          }
        }
      });
      pe[pi] = Object.keys(errs).length;
    });
    setTouched(allTouched); setErrors(allErrors); setPageErrors(pe);
    if (Object.keys(allErrors).length > 0) {
      var firstErrorPage = pages.findIndex(function(_: any, pi: number) { return pe[pi] > 0; });
      if (firstErrorPage >= 0) setCurrentPage(firstErrorPage);
      return;
    }
    setSubmitting(true);
    var submitValues: any = {};
    Object.keys(values).forEach(function(key) {
      var field = form.fields.find(function(f: any) { return f.columnId === key; });
      if (field?.type !== 'calculated') submitValues[key] = values[key];
    });
    form.fields.filter(function(f: any) { return f.calculated && f.columnId; }).forEach(function(f: any) {
      var result = evaluateFormula(f);
      if (result !== null) submitValues[f.columnId] = String(result);
    });
    form.fields.filter(function(f: any) { return f.type === 'repeating_group' && f.rgType === 'custom'; }).forEach(function(f: any) {
      var cRows = customRgData[f.columnId] || [];
      var nonEmpty = cRows.filter(function(row: any) { return Object.values(row).some(function(v: any) { return v !== '' && v !== false; }); });
      if (nonEmpty.length > 0) submitValues[f.columnId] = nonEmpty;
    });
    fetch('/api/public/forms/' + params.slug, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitValues) })
      .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
      .then(function(r) { if (!r.ok) { setFormError(r.data.error || 'Submission failed'); return; } setThankYouMessage(r.data.message); setSubmitted(true); })
      .catch(function() { setFormError('Submission failed.'); })
      .finally(function() { setSubmitting(false); });
  }

  function renderField(field: any) {
    var value = values[field.columnId];
    var fieldError = touched[field.columnId] ? errors[field.columnId] : null;
    var onChange = function(val: any) { handleChange(field.columnId, val); };
    var onBlur = function() { handleBlur(field.columnId); };
    var isReadOnly = field.readOnly === true;
    var base = 'w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base ' + (isReadOnly ? 'bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 cursor-not-allowed ' : 'bg-white dark:bg-gray-800 dark:text-gray-200 ') + (fieldError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600');
    if (field.calculated) {
      var result = evaluateFormula(field); var formula = field.formula || {}; var decimals = formula.decimals ?? 2;
      var prefix = formula.format === 'currency' ? (formula.prefix || '$') : (formula.prefix || ''); var suffix = formula.format === 'percent' ? '%' : '';
      var displayValue = result !== null ? result.toFixed(decimals) : '0.' + '0'.repeat(decimals);
      return (<div className="w-full px-4 py-3 border-2 border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 font-bold text-lg">{prefix}{displayValue}{suffix}</div>);
    }
    switch (field.columnType || field.type) {
      case 'calculated': { var r2 = evaluateFormula(field); var f2 = field.formula || {}; var d2 = f2.decimals ?? 2; var p2 = f2.format === 'currency' ? (f2.prefix || '$') : (f2.prefix || ''); var s2 = f2.format === 'percent' ? '%' : ''; var dv2 = r2 !== null ? r2.toFixed(d2) : '0.' + '0'.repeat(d2); return (<div className="w-full px-4 py-3 border-2 border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 font-bold text-lg">{p2}{dv2}{s2}</div>); }
      case 'textarea': case 'long_text': return <textarea value={value || ''} onChange={function(e) { onChange(e.target.value); }} onBlur={onBlur} placeholder={field.placeholder || ''} rows={4} className={base} />;
      case 'number': case 'currency': case 'percent': return <input type="number" value={value || ''} onChange={function(e) { if (!isReadOnly) onChange(e.target.value ? Number(e.target.value) : ''); }} onBlur={onBlur} placeholder={field.placeholder || ''} readOnly={isReadOnly} className={base} />;
      case 'date': return <input type="date" value={value || ''} onChange={function(e) { onChange(e.target.value); }} onBlur={onBlur} className={base} />;
      case 'datetime': return <input type="datetime-local" value={value || ''} onChange={function(e) { onChange(e.target.value); }} onBlur={onBlur} className={base} />;
      case 'select': { var opts = field.settings?.options || []; return <select value={value || ''} onChange={function(e) { onChange(e.target.value); }} onBlur={onBlur} className={base}><option value="">Select...</option>{opts.map(function(o: any) { return <option key={o.value} value={o.value}>{o.label || o.value}</option>; })}</select>; }
      case 'multi_select': { var opts2 = field.settings?.options || []; var sel = Array.isArray(value) ? value : []; return <div className="space-y-2">{opts2.map(function(o: any) { return (<label key={o.value} className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" checked={sel.includes(o.value)} onChange={function(e) { onChange(e.target.checked ? sel.concat([o.value]) : sel.filter(function(v: string) { return v !== o.value; })); }} className="w-5 h-5 rounded border-gray-300 text-blue-600" /><span className="text-gray-700 dark:text-gray-300">{o.label || o.value}</span></label>); })}</div>; }
      case 'checkbox': return <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" checked={!!value} onChange={function(e) { onChange(e.target.checked); }} className="w-5 h-5 rounded border-gray-300 text-blue-600" /><span className="text-gray-700 dark:text-gray-300">Yes</span></label>;
      case 'rating': { var max = field.settings?.max || 5; return <div className="flex space-x-2">{Array.from({ length: max }, function(_, i) { return i + 1; }).map(function(n) { return (<button key={n} type="button" onClick={function() { onChange(n); }} className={'w-10 h-10 rounded-full text-lg font-medium transition-colors ' + (value >= n ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200')}>*</button>); })}</div>; }
      case 'email': return <input type="email" value={value || ''} onChange={function(e) { onChange(e.target.value); }} onBlur={onBlur} placeholder={field.placeholder || 'email@example.com'} className={base} />;
      case 'phone': return <input type="tel" value={value || ''} onChange={function(e) { onChange(e.target.value); }} onBlur={onBlur} placeholder={field.placeholder || '(555) 123-4567'} className={base} />;
      case 'url': return <input type="url" value={value || ''} onChange={function(e) { onChange(e.target.value); }} onBlur={onBlur} placeholder={field.placeholder || 'https://...'} className={base} />;
      default: return <input type="text" value={value || ''} onChange={function(e) { if (!isReadOnly) onChange(e.target.value); }} onBlur={onBlur} placeholder={field.placeholder || ''} readOnly={isReadOnly} className={base} />;
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (formError && !form) return <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center"><div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8 max-w-md text-center"><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Form Not Available</h1><p className="text-gray-500">{formError}</p></div></div>;
  if (submitted) return <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center"><div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8 max-w-md text-center"><h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Submitted!</h1><p className="text-gray-600 dark:text-gray-400">{thankYouMessage}</p><p className="text-xs text-gray-400 mt-6 flex items-center justify-center space-x-1.5"><span>Powered by</span><span className="font-medium">Agora</span></p></div></div>;

  var visibleFields = getVisibleFieldsForPage(currentPage);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-900 rounded-t-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 border-b-0">
          <div className="flex items-center space-x-2 mb-4">
            <svg width="28" height="28" viewBox="0 0 512 512"><circle cx="256" cy="256" r="220" fill="#1E3A5F"/><polygon points="256,100 360,380 300,380 276,310 236,310 212,380 152,380" fill="white"/></svg>
            <span className="text-sm font-semibold text-gray-400">Agora</span>
          </div>
          <div className="border-l-4 border-blue-600 pl-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{form.name}</h1>
            {form.description && <p className="mt-2 text-gray-600 dark:text-gray-400">{form.description}</p>}
          </div>
        </div>
        {isMultiPage && (
          <div className="bg-white dark:bg-gray-900 border-x border-gray-200 dark:border-gray-700 px-8 py-4">
            <div className="flex items-center justify-center flex-wrap gap-2">
              {pages.map(function(page: any, pi: number) {
                return (<button key={page.id} onClick={function() { goToPage(pi); }} className={'inline-flex items-center space-x-1.5 px-4 py-2 rounded-full text-sm transition-colors ' + (pi === currentPage ? 'bg-blue-600 text-white shadow-sm' : pi < currentPage ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200')}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-white/20">{pi < currentPage ? '\u2713' : pi + 1}</span>
                      <span className="text-xs font-medium">{page.title}</span>
                      {(pageErrors[pi] || 0) > 0 && (<span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">{pageErrors[pi]}</span>)}
                    </button>);
              })}
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit}className="bg-white dark:bg-gray-900 rounded-b-xl shadow-sm border border-gray-200 dark:border-gray-700 border-t-0">
          <div className="p-8 space-y-6">
            {formError && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">{formError}</div>}
            {isMultiPage && currentPageObj && (<div className="mb-2"><h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{currentPageObj.title}</h2>{currentPageObj.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{currentPageObj.description}</p>}</div>)}
            {visibleFields.map(function(field: any, fi: number) {
              if (field.type === 'repeating_group') {
                if (field.rgType === 'custom') {
                  var cRows = customRgData[field.columnId] || []; var cMax = field.maxRows || 10;
                  return <CustomRgBlock key={fi} field={field} rows={cRows} maxRows={cMax} errors={errors} touched={touched} onChange={function(newRows: any) { setCustomRgData(function(p: any) { return Object.assign({}, p, { [field.columnId]: newRows }); }); }} onAddRow={function() { var nr = cRows.slice(); var empty: any = {}; (field.customColumns || []).forEach(function(cc: any) { empty[cc.id] = cc.type === 'checkbox' ? false : ''; }); nr.push(empty); setCustomRgData(function(p: any) { return Object.assign({}, p, { [field.columnId]: nr }); }); }} onRemoveRow={function() { if (cRows.length > (field.defaultVisibleRows || 1)) { var nr = cRows.slice(0, -1); setCustomRgData(function(p: any) { return Object.assign({}, p, { [field.columnId]: nr }); }); } }} />;
                }
                var vc = rgRows[field.columnId] || field.defaultVisibleRows || 1; var mx = field.rows?.length || 0;
                return <RgBlock key={fi} field={field} values={values} visibleCount={vc} errors={errors} touched={touched} onFieldChange={handleChange} onFieldBlur={handleBlur} onCalcUpdate={handleCalcUpdate} onAddRow={function() { setRgRows(function(p: any) { return Object.assign({}, p, { [field.columnId]: Math.min(vc + 1, mx) }); }); }} onRemoveRow={function() { setRgRows(function(p: any) { return Object.assign({}, p, { [field.columnId]: vc - 1 }); }); }} />;
              }
              if (field.type === 'divider') return <hr key={fi} className="border-gray-200 dark:border-gray-700" />;
              if (field.type === 'section_header') return (<div key={fi} className="pt-2"><h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{field.label}</h3>{field.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{field.description}</p>}</div>);
              var fieldError = touched[field.columnId] ? errors[field.columnId] : null;
              return (<div key={fi} id={'field-' + field.columnId} className="space-y-1.5"><label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</label>{field.description && <p className="text-xs text-gray-500 dark:text-gray-400">{field.description}</p>}{renderField(field)}{fieldError && <p className="text-xs text-red-500 flex items-center space-x-1"><span>{fieldError}</span></p>}</div>);
            })}
          </div>
          <div className="px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-xl border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              {isMultiPage && currentPage > 0 ? (<button type="button" onClick={function() { goToPage(currentPage - 1); }} className="px-6 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Back</button>) : <div />}
              {isMultiPage && currentPage < pages.length - 1 ? (<button type="button" onClick={function(e) { e.preventDefault(); e.stopPropagation(); goToPage(currentPage + 1); }} className="px-6 py-3 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">Next</button>) : (<button type="button" disabled={submitting} onClick={function() { setShowConfirm(true); }} className="px-8 py-3 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{submitting ? 'Submitting...' : form.submitButtonText || 'Submit'}</button>)}
            </div>
            {isMultiPage && (<p className="text-center text-xs text-gray-400 mt-3">Page {currentPage + 1} of {pages.length}</p>)}
          </div>
        </form>
        {showConfirm && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={function() { setShowConfirm(false); }}><div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={function(e) { e.stopPropagation(); }}><div className="text-center"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Ready to submit?</h3><p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{isMultiPage ? 'Please review all ' + pages.length + ' pages before submitting.' : 'Please review all fields before submitting.'}</p></div><div className="flex items-center space-x-3 pt-2"><button type="button" onClick={function() { setShowConfirm(false); }} className="flex-1 px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Go Back</button><button type="button" onClick={function() { handleSubmit(); }} disabled={submitting} className="flex-1 px-4 py-3 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{submitting ? 'Submitting...' : 'Yes, Submit'}</button></div></div></div>)}
        <p className="text-center text-xs text-gray-400 mt-4 flex items-center justify-center space-x-1.5"><span>Powered by</span><svg width="14" height="14" viewBox="0 0 512 512"><circle cx="256" cy="256" r="220" fill="#9CA3AF"/><polygon points="256,100 360,380 300,380 276,310 236,310 212,380 152,380" fill="white"/></svg><span className="font-medium">Agora</span></p>
      </div>
    </div>
  );
}