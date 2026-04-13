'use client';

import { useState } from 'react';
import { FormFieldSettings } from './FormFieldSettings';
import { FormPreview } from './FormPreview';

export function FormEditor({ form, tableColumns = [], onUpdate, onCopyLink, onCopyEmbed, copiedSlug }: { form: any; tableColumns?: any[]; onUpdate: (updates: any) => void; onCopyLink: () => void; onCopyEmbed: () => void; copiedSlug: string | null; }) {
  var ns = useState(form.name); var name = ns[0]; var setName = ns[1];
  var ds = useState(form.description || ''); var description = ds[0]; var setDescription = ds[1];
  var sbts = useState(form.submitButtonText || 'Submit'); var submitButtonText = sbts[0]; var setSubmitButtonText = sbts[1];
  var tys = useState(form.thankYouMessage || 'Thank you for your submission!'); var thankYouMessage = tys[0]; var setThankYouMessage = tys[1];
  var ps = useState<any[]>(form.pages || [{ id: 'page_1', title: 'Page 1', description: '' }]); var pages = ps[0]; var setPages = ps[1];
  var fs = useState<any[]>(function() { return (form.fields || []).map(function(f: any) { return Object.assign({}, f, { pageId: f.pageId || 'page_1' }); }); }); var fields = fs[0]; var setFields = fs[1];
  var aps = useState(pages[0]?.id || 'page_1'); var activePageId = aps[0]; var setActivePageId = aps[1];
  var afis = useState<number | null>(null); var activeFieldIndex = afis[0]; var setActiveFieldIndex = afis[1];
  var sfss = useState(false); var showFieldSettings = sfss[0]; var setShowFieldSettings = sfss[1];
  var srgs = useState(false); var showRgSettings = srgs[0]; var setShowRgSettings = srgs[1];
  var sas = useState(false); var saving = sas[0]; var setSaving = sas[1];
  var sds = useState(false); var saved = sds[0]; var setSaved = sds[1];
  var safs = useState(false); var showAddField = safs[0]; var setShowAddField = safs[1];
  var fss = useState(''); var fieldSearch = fss[0]; var setFieldSearch = fss[1];
  var srgss = useState(false); var showRepeatingGroupSetup = srgss[0]; var setShowRepeatingGroupSetup = srgss[1];
  var rms = useState<'choose'|'manual'|'auto'>('choose'); var rgMode = rms[0]; var setRgMode = rms[1];
  var rls = useState('Line Items'); var rgLabel = rls[0]; var setRgLabel = rls[1];
  var rmrs = useState(5); var rgMaxRows = rmrs[0]; var setRgMaxRows = rmrs[1];
  var rdvs = useState(1); var rgDefaultVisible = rdvs[0]; var setRgDefaultVisible = rdvs[1];
  // Manual mode: column slots define the row template, manualRows maps each row to real columns
  var mslots = useState<string[]>([]); var manualSlots = mslots[0]; var setManualSlots = mslots[1];
  var mrows = useState<string[][]>([]); var manualRows = mrows[0]; var setManualRows = mrows[1];
  // Auto mode state
  var rcprs = useState<string[]>([]); var rgColumnsPerRow = rcprs[0]; var setRgColumnsPerRow = rcprs[1];
  var rrcs = useState(5); var rgRowCount = rrcs[0]; var setRgRowCount = rrcs[1];
  var rcss = useState(''); var rgColumnSearch = rcss[0]; var setRgColumnSearch = rcss[1];

  async function handleSave() { setSaving(true); try { await onUpdate({ name: name, description: description, submitButtonText: submitButtonText, thankYouMessage: thankYouMessage, fields: fields, pages: pages }); setSaved(true); setTimeout(function() { setSaved(false); }, 2000); } finally { setSaving(false); } }
  function updateField(index: number, updates: any) { setFields(function(prev) { return prev.map(function(f, i) { return i === index ? Object.assign({}, f, updates) : f; }); }); }
  function moveField(index: number, direction: 'up' | 'down') { var gi = fields.map(function(f, i) { return f.pageId === activePageId ? i : -1; }).filter(function(i) { return i !== -1; }); var li = gi.indexOf(index); var ni = direction === 'up' ? li - 1 : li + 1; if (ni < 0 || ni >= gi.length) return; var nf = fields.slice(); var t = nf[gi[li]]; nf[gi[li]] = nf[gi[ni]]; nf[gi[ni]] = t; setFields(nf); setActiveFieldIndex(gi[ni]); }
  function removeField(index: number) { setFields(function(prev) { return prev.filter(function(_, i) { return i !== index; }); }); setActiveFieldIndex(null); setShowFieldSettings(false); setShowRgSettings(false); }
  function addSectionHeader() { setFields(function(prev) { return prev.concat([{ columnId: 'section_' + Date.now(), label: 'Section Header', type: 'section_header', visible: true, required: false, order: prev.length, description: '', pageId: activePageId }]); }); }
  function addDivider() { setFields(function(prev) { return prev.concat([{ columnId: 'divider_' + Date.now(), label: '', type: 'divider', visible: true, required: false, order: prev.length, pageId: activePageId }]); }); }

  function openRepeatingGroupSetup() { setRgMode('choose'); setRgLabel('Line Items'); setRgMaxRows(5); setRgDefaultVisible(1); setManualSlots([]); setManualRows([]); setRgColumnsPerRow([]); setRgRowCount(5); setRgColumnSearch(''); setShowRepeatingGroupSetup(true); }

  function addManualRepeatingGroup() {
    if (manualSlots.length === 0 || manualRows.length === 0) return;
    var colNames = manualSlots.map(function(slotLabel) { return slotLabel; });
    var rows = manualRows.map(function(rowCols, ri) {
      return { rowNum: ri + 1, fields: rowCols, labels: rowCols.map(function(cid) { var col = tableColumns.find(function(c) { return c.id === cid; }); return col ? col.name : cid; }) };
    });
    setFields(function(prev) { return prev.concat([{ columnId: 'rg_' + Date.now(), label: rgLabel, type: 'repeating_group', rgType: 'mapped', visible: true, required: false, order: prev.length, pageId: activePageId, defaultVisibleRows: rgDefaultVisible, columnsPerRow: colNames, rows: rows, columnFormulas: {}, rgRequireMode: 'none', rgRequiredColumns: [] }]); });
    setShowRepeatingGroupSetup(false);
  }

  function addAutoRepeatingGroup() {
    if (rgColumnsPerRow.length === 0) return;
    var amc = tableColumns.filter(function(c) { var bn = c.name.replace(/^Line\s+\d+\s+/i, '').trim(); return rgColumnsPerRow.includes(bn); });
    var rows: any[] = []; var grouped: Record<string, any[]> = {};
    amc.forEach(function(c) { var m = c.name.match(/^Line\s+(\d+)\s+/i); if (m) { if (!grouped[m[1]]) grouped[m[1]] = []; grouped[m[1]].push(c); } });
    var sk = Object.keys(grouped).sort(function(a, b) { return parseInt(a) - parseInt(b); });
    var mr = Math.min(sk.length, rgRowCount);
    for (var i = 0; i < mr; i++) { var cs = grouped[sk[i]]; cs.sort(function(a: any, b: any) { return rgColumnsPerRow.indexOf(a.name.replace(/^Line\s+\d+\s+/i, '').trim()) - rgColumnsPerRow.indexOf(b.name.replace(/^Line\s+\d+\s+/i, '').trim()); }); rows.push({ rowNum: i + 1, fields: cs.map(function(c: any) { return c.id; }), labels: cs.map(function(c: any) { return c.name; }) }); }
    setFields(function(prev) { return prev.concat([{ columnId: 'rg_' + Date.now(), label: rgLabel, type: 'repeating_group', rgType: 'mapped', visible: true, required: false, order: prev.length, pageId: activePageId, defaultVisibleRows: rgDefaultVisible, columnsPerRow: rgColumnsPerRow, rows: rows, columnFormulas: {}, rgRequireMode: 'none', rgRequiredColumns: [] }]); });
    setShowRepeatingGroupSetup(false);
  }

  function addManualSlot() { setManualSlots(function(prev) { return prev.concat(['Column ' + (prev.length + 1)]); }); setManualRows(function(prev) { return prev.map(function(r) { return r.concat(['']); }); }); }
  function removeManualSlot(si: number) { setManualSlots(function(prev) { return prev.filter(function(_, i) { return i !== si; }); }); setManualRows(function(prev) { return prev.map(function(r) { return r.filter(function(_, i) { return i !== si; }); }); }); }
  function updateManualSlotLabel(si: number, label: string) { setManualSlots(function(prev) { var n = prev.slice(); n[si] = label; return n; }); }
  function addManualRow() { setManualRows(function(prev) { return prev.concat([manualSlots.map(function() { return ''; })]); }); }
  function removeManualRow(ri: number) { setManualRows(function(prev) { return prev.filter(function(_, i) { return i !== ri; }); }); }
  function setManualRowCol(ri: number, si: number, colId: string) { setManualRows(function(prev) { var n = prev.map(function(r) { return r.slice(); }); n[ri][si] = colId; return n; }); }

  function addCalculatedField() { setFields(function(prev) { return prev.concat([{ columnId: 'calc_' + Date.now(), label: 'Total', type: 'calculated', columnType: 'calculated', visible: true, required: false, order: prev.length, pageId: activePageId, formula: { operations: [], format: 'number', decimals: 2, prefix: '', suffix: '' } }]); }); }
  function addColumnField(column: any) { setFields(function(prev) { return prev.concat([{ columnId: column.id, label: column.name, columnType: column.type, settings: column.settings || {}, required: column.required || column.settings?.required || false, placeholder: '', order: prev.length, visible: true, pageId: activePageId }]); }); setShowAddField(false); }

  var skipTypes = ['formula', 'lookup', 'rollup', 'linked_record'];
  var rgColIds = new Set(fields.filter(function(f) { return f.type === 'repeating_group'; }).flatMap(function(f: any) { return (f.rows || []).flatMap(function(r: any) { return r.fields || []; }); }));
  var existIds = new Set(fields.map(function(f) { return f.columnId; }).concat(Array.from(rgColIds)));
  var availableColumns = tableColumns.filter(function(c) { return !skipTypes.includes(c.type) && !existIds.has(c.id); });
  var hasLinePattern = tableColumns.some(function(c) { return /^Line\s+\d+\s+/i.test(c.name); });

  function addPage() { var nid = 'page_' + Date.now(); setPages(function(prev) { return prev.concat([{ id: nid, title: 'Page ' + (prev.length + 1), description: '' }]); }); setActivePageId(nid); }
  function removePage(pid: string) { if (pages.length <= 1) return; if (!confirm('Delete this page? Fields will be moved to the first page.')) return; var fp = pages.find(function(p) { return p.id !== pid; })?.id; setFields(function(prev) { return prev.map(function(f) { return f.pageId === pid ? Object.assign({}, f, { pageId: fp }) : f; }); }); setPages(function(prev) { return prev.filter(function(p) { return p.id !== pid; }); }); if (activePageId === pid) setActivePageId(fp!); }

  function getFieldBadges(field: any) { var b: { label: string; color: string }[] = []; if (field.required) b.push({ label: '*', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' }); if (field.conditions?.length > 0) b.push({ label: 'IF', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' }); if (field.validation && Object.keys(field.validation).some(function(k) { var v = field.validation[k]; return v !== undefined && v !== '' && v !== false && v !== 'none'; })) b.push({ label: '\u2713', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' }); return b; }

  var pageFields = fields.map(function(f, i) { return Object.assign({}, f, { _globalIndex: i }); }).filter(function(f) { return f.pageId === activePageId; });
  var activeField = activeFieldIndex !== null ? fields[activeFieldIndex] : null;

  return (
    <div className="flex h-[calc(92vh-52px)] overflow-hidden">
      <div className={'flex flex-col border-r border-gray-200 dark:border-gray-700 transition-all ' + (showFieldSettings || showRgSettings ? 'w-[260px]' : 'w-[320px]')}>
        {/* Form settings */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2 flex-shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Form Name</label><input type="text" value={name} onChange={function(e) { setName(e.target.value); }} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" /></div>
            <div><label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Submit Button</label><input type="text" value={submitButtonText} onChange={function(e) { setSubmitButtonText(e.target.value); }} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" /></div>
          </div>
          <div><label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Description</label><input type="text" value={description} onChange={function(e) { setDescription(e.target.value); }} placeholder="Optional..." className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" /></div>
          <div><label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Thank You Message</label><input type="text" value={thankYouMessage} onChange={function(e) { setThankYouMessage(e.target.value); }} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" /></div>
        </div>
        {/* Page tabs */}
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-2 py-1.5 flex-shrink-0 overflow-x-auto space-x-1">
          {pages.map(function(page: any, pi: number) { return (<button key={page.id} onClick={function() { setActivePageId(page.id); setActiveFieldIndex(null); setShowFieldSettings(false); setShowRgSettings(false); }} className={'flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap ' + (activePageId === page.id ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800')}><span className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 text-[9px] flex items-center justify-center font-bold">{pi + 1}</span><span className="max-w-[70px] truncate">{page.title}</span>{pages.length > 1 && activePageId === page.id && (<button onClick={function(e) { e.stopPropagation(); removePage(page.id); }} className="text-gray-400 hover:text-red-500 ml-0.5"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>)}</button>); })}
          <button onClick={addPage} className="px-2 py-1 text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded whitespace-nowrap">+ Page</button>
        </div>
        {/* Active page settings */}
        <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-1">
          <input type="text" value={pages.find(function(p: any) { return p.id === activePageId; })?.title || ''} onChange={function(e) { setPages(function(prev) { return prev.map(function(p) { return p.id === activePageId ? Object.assign({}, p, { title: e.target.value }) : p; }); }); }} className="w-full px-2 py-1 text-xs font-medium border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-transparent dark:text-gray-200" placeholder="Page title..." />
          <input type="text" value={pages.find(function(p: any) { return p.id === activePageId; })?.description || ''} onChange={function(e) { setPages(function(prev) { return prev.map(function(p) { return p.id === activePageId ? Object.assign({}, p, { description: e.target.value }) : p; }); }); }} className="w-full px-2 py-0.5 text-[10px] border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-transparent text-gray-500 dark:text-gray-400" placeholder="Page description..." />
        </div>
        {/* Add elements */}
        <div className="flex items-center space-x-1.5 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 relative">
          <div className="relative">
            <button onClick={function() { setShowAddField(!showAddField); }} className={'text-[9px] px-2 py-0.5 rounded ' + (availableColumns.length > 0 ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100' : 'bg-gray-50 text-gray-300 cursor-not-allowed')} disabled={availableColumns.length === 0}>+ Field {availableColumns.length > 0 && <span className="text-[8px]">({availableColumns.length})</span>}</button>
            {showAddField && availableColumns.length > 0 && (<><div className="fixed inset-0 z-10" onClick={function() { setShowAddField(false); setFieldSearch(''); }} /><div className="absolute left-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-1 z-20 max-h-64 overflow-hidden flex flex-col"><div className="px-2 py-1.5 border-b border-gray-100 dark:border-gray-700"><input type="text" value={fieldSearch} onChange={function(e) { setFieldSearch(e.target.value); }} placeholder="Search columns..." className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-200" autoFocus /></div><div className="overflow-y-auto max-h-48">{availableColumns.filter(function(c) { return c.name.toLowerCase().includes(fieldSearch.toLowerCase()) || c.type.toLowerCase().includes(fieldSearch.toLowerCase()); }).map(function(col) { return (<button key={col.id} onClick={function() { addColumnField(col); }} className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2"><span className="text-[10px] text-gray-400">{getTypeIcon(col.type)}</span><span>{col.name}</span><span className="text-[9px] text-gray-400 ml-auto">{col.type}</span></button>); })}{availableColumns.filter(function(c) { return c.name.toLowerCase().includes(fieldSearch.toLowerCase()); }).length === 0 && (<div className="px-3 py-3 text-xs text-gray-400 text-center">No columns match</div>)}</div></div></>)}
          </div>
          <button onClick={addSectionHeader} className="text-[9px] px-2 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded hover:bg-purple-100">+ Section</button>
          <button onClick={addDivider} className="text-[9px] px-2 py-0.5 bg-gray-50 dark:bg-gray-800 text-gray-500 rounded hover:bg-gray-100">+ Divider</button>
          <button onClick={openRepeatingGroupSetup} className="text-[9px] px-2 py-0.5 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded hover:bg-teal-100">+ Repeat Group</button>
        </div>
        {/* Field list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {pageFields.length === 0 && (<div className="text-center py-8 text-xs text-gray-400">No fields on this page.</div>)}
          {pageFields.map(function(field) {
            var gi = field._globalIndex; var isActive = activeFieldIndex === gi; var isDivider = field.type === 'divider'; var isSection = field.type === 'section_header'; var badges = getFieldBadges(field);
            if (field.type === 'repeating_group') {
              var hf = field.columnFormulas && Object.keys(field.columnFormulas).length > 0;
              var cn = (field.columnsPerRow || []);
              var ri = ((field.rows?.length || 0) + ' rows');
              return (<div key={field.columnId || gi} onClick={function() { setActiveFieldIndex(gi); setShowFieldSettings(false); setShowRgSettings(false); }} className={'px-2.5 py-2 rounded cursor-pointer transition-colors border-l-4 border-teal-400 ' + (isActive ? 'bg-teal-50 dark:bg-teal-900/20 ring-1 ring-teal-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}><div className="flex items-center justify-between"><div className="flex items-center space-x-1.5"><div className="flex flex-col mr-1 space-y-0.5"><button onClick={function(e) { e.stopPropagation(); moveField(gi, 'up'); }} className="text-gray-300 hover:text-gray-500"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg></button><button onClick={function(e) { e.stopPropagation(); moveField(gi, 'down'); }} className="text-gray-300 hover:text-gray-500"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button></div><span className="text-xs font-bold text-teal-700 dark:text-teal-400">{field.label}</span><span className="text-[8px] font-bold px-1 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">REPEAT</span>{hf && <span className="text-[8px] font-bold px-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">f</span>}</div><div className="flex items-center space-x-1">{isActive && (<button onClick={function(e) { e.stopPropagation(); setShowRgSettings(true); setShowFieldSettings(false); }} className="text-[9px] px-1.5 py-0.5 bg-teal-600 text-white rounded hover:bg-teal-700">Settings</button>)}<button onClick={function(e) { e.stopPropagation(); removeField(gi); }} className="text-gray-300 hover:text-red-500"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div></div><div className="mt-1 text-[9px] text-gray-400">{cn.join(', ')} | {ri}, {field.defaultVisibleRows} visible</div></div>);
            }
            if (isDivider) { return (<div key={field.columnId || gi} onClick={function() { setActiveFieldIndex(gi); setShowFieldSettings(false); setShowRgSettings(false); }} className={'flex items-center px-3 py-1.5 rounded cursor-pointer transition-colors ' + (isActive ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}><div className="flex flex-col mr-1.5 space-y-0.5"><button onClick={function(e) { e.stopPropagation(); moveField(gi, 'up'); }} className="text-gray-300 hover:text-gray-500"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg></button><button onClick={function(e) { e.stopPropagation(); moveField(gi, 'down'); }} className="text-gray-300 hover:text-gray-500"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button></div><div className="flex-1 border-b border-gray-300 dark:border-gray-600" /><span className="text-[9px] text-gray-400 mx-2">divider</span><div className="flex-1 border-b border-gray-300 dark:border-gray-600" /><button onClick={function(e) { e.stopPropagation(); removeField(gi); }} className="ml-1 text-gray-400 hover:text-red-500"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>); }
            return (<div key={field.columnId || gi} onClick={function() { setActiveFieldIndex(gi); setShowFieldSettings(false); setShowRgSettings(false); }} className={'flex items-center px-2.5 py-2 rounded cursor-pointer transition-colors ' + (isActive ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700' : field.visible === false ? 'opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}><div className="flex flex-col mr-1.5 space-y-0.5"><button onClick={function(e) { e.stopPropagation(); moveField(gi, 'up'); }} className="text-gray-300 hover:text-gray-500"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg></button><button onClick={function(e) { e.stopPropagation(); moveField(gi, 'down'); }} className="text-gray-300 hover:text-gray-500"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button></div><div className="flex-1 min-w-0"><div className="flex items-center space-x-1.5"><span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{isSection ? '\u00A7 ' : ''}{field.label}</span>{badges.map(function(b, bi) { return <span key={bi} className={'text-[8px] font-bold px-1 rounded ' + b.color}>{b.label}</span>; })}</div>{!isSection && field.columnType && <span className="text-[9px] text-gray-400">{field.type === 'calculated' ? 'f calculated' : field.columnType}</span>}</div><div className="flex items-center space-x-1 ml-1">{isActive && (<button onClick={function(e) { e.stopPropagation(); setShowFieldSettings(true); setShowRgSettings(false); }} className="text-[9px] px-1.5 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700">Settings</button>)}<button onClick={function(e) { e.stopPropagation(); updateField(gi, { visible: field.visible === false ? true : false }); }} className={'text-[10px] ' + (field.visible !== false ? 'text-green-500' : 'text-gray-300')}>{field.visible !== false ? '\u25C9' : '\u25CB'}</button><button onClick={function(e) { e.stopPropagation(); removeField(gi); }} className="text-gray-300 hover:text-red-500"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div></div>);
          })}
        </div>
        {/* Save bar */}
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-1.5">
            <button onClick={onCopyLink} className="text-[9px] text-gray-500 hover:text-blue-600 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded">{copiedSlug === form.slug ? '\u2713' : '\u{1F517}'}</button>
            <button onClick={onCopyEmbed} className="text-[9px] text-gray-500 hover:text-blue-600 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded">{copiedSlug === form.slug + '-embed' ? '\u2713' : '\u{1F4CB}'}</button>
          </div>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">{saving ? '...' : saved ? '\u2713 Saved!' : 'Save Form'}</button>
        </div>
      </div>

      {showFieldSettings && activeField && activeField.type !== 'repeating_group' && (<FormFieldSettings field={activeField} fieldIndex={activeFieldIndex!} allFields={fields} onUpdate={updateField} onClose={function() { setShowFieldSettings(false); }} />)}
      {showRgSettings && activeField && activeField.type === 'repeating_group' && (<RgSettingsPanel field={activeField} fieldIndex={activeFieldIndex!} tableColumns={tableColumns} onUpdate={updateField} onClose={function() { setShowRgSettings(false); }} />)}

      {/* Repeating Group Setup Modal */}
      {showRepeatingGroupSetup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={function() { setShowRepeatingGroupSetup(false); }}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={function(e) { e.stopPropagation(); }}>
            {rgMode === 'choose' && (<>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Create Repeating Group</h3>
              <p className="text-[10px] text-gray-500">Choose how to assign columns to your repeating rows.</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={function() { setRgMode('manual'); setManualSlots([]); setManualRows([]); }} className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-teal-400 dark:hover:border-teal-600 transition-colors text-left space-y-2">
                  <div className="flex items-center space-x-2"><span className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center text-sm font-bold">{'\u270B'}</span><span className="text-xs font-bold text-gray-900 dark:text-gray-100">Manual</span></div>
                  <p className="text-[10px] text-gray-500">Pick columns yourself for each row slot. Full control.</p>
                </button>
                <button onClick={function() { if (hasLinePattern) setRgMode('auto'); }} className={'p-4 rounded-xl border-2 transition-colors text-left space-y-2 ' + (hasLinePattern ? 'border-gray-200 dark:border-gray-700 hover:border-blue-400' : 'border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed')}>
                  <div className="flex items-center space-x-2"><span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold">{'\u26A1'}</span><span className="text-xs font-bold text-gray-900 dark:text-gray-100">Auto-Detect</span></div>
                  <p className="text-[10px] text-gray-500">Auto-detect Line 1, Line 2... patterns from your table.</p>
                  {!hasLinePattern && <p className="text-[9px] text-gray-400">No Line N patterns found</p>}
                </button>
              </div>
              <div className="flex justify-end pt-2"><button onClick={function() { setShowRepeatingGroupSetup(false); }} className="px-4 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button></div>
            </>)}

            {rgMode === 'manual' && (<>
              <div className="flex items-center space-x-2">
                <button onClick={function() { setRgMode('choose'); }} className="text-gray-400 hover:text-gray-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></button>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Manual Column Mapping</h3>
              </div>
              <p className="text-[10px] text-gray-500">Define column slots for each row, then assign table columns to each slot per row.</p>
              <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Group Label</label><input type="text" value={rgLabel} onChange={function(e) { setRgLabel(e.target.value); }} className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" /></div>

              {/* Step 1: Define column slots */}
              <div>
                <div className="flex items-center justify-between mb-2"><label className="text-[10px] font-bold text-gray-500 uppercase">Step 1 — Column Slots</label><button onClick={addManualSlot} className="text-[9px] px-2 py-0.5 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded hover:bg-teal-100 font-medium">+ Add Slot</button></div>
                <p className="text-[9px] text-gray-400 mb-2">Name each column in a row (e.g. QTY, Description, Unit Price, Amount)</p>
                {manualSlots.length === 0 && (<div className="text-center py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg"><p className="text-xs text-gray-400">Click "+ Add Slot" to define columns per row.</p></div>)}
                <div className="space-y-1">
                  {manualSlots.map(function(slot, si) {
                    return (<div key={si} className="flex items-center space-x-2">
                      <span className="text-[9px] text-gray-400 w-4 text-right">{si + 1}.</span>
                      <input type="text" value={slot} onChange={function(e) { updateManualSlotLabel(si, e.target.value); }} className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200" placeholder="Column name..." />
                      <button onClick={function() { removeManualSlot(si); }} className="text-gray-300 hover:text-red-500"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>);
                  })}
                </div>
              </div>

              {/* Step 2: Assign columns per row */}
              {manualSlots.length > 0 && (<div>
                <div className="flex items-center justify-between mb-2"><label className="text-[10px] font-bold text-gray-500 uppercase">Step 2 — Assign Columns Per Row</label><button onClick={addManualRow} className="text-[9px] px-2 py-0.5 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded hover:bg-teal-100 font-medium">+ Add Row</button></div>
                <p className="text-[9px] text-gray-400 mb-2">For each row, pick which table column fills each slot.</p>
                {manualRows.length === 0 && (<div className="text-center py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg"><p className="text-xs text-gray-400">Click "+ Add Row" to start mapping.</p></div>)}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {manualRows.map(function(rowCols, ri) {
                    return (<div key={ri} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-bold text-gray-500">Row {ri + 1}</span>
                        <button onClick={function() { removeManualRow(ri); }} className="text-[8px] text-gray-400 hover:text-red-500">Remove</button>
                      </div>
                      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(' + manualSlots.length + ', 1fr)' }}>
                        {manualSlots.map(function(slotLabel, si) {
                          return (<div key={si}>
                            <span className="text-[8px] text-gray-400 block mb-0.5">{slotLabel}</span>
                            <select value={rowCols[si] || ''} onChange={function(e) { setManualRowCol(ri, si, e.target.value); }} className="w-full px-1 py-0.5 text-[9px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200">
                              <option value="">Select...</option>
                              {tableColumns.filter(function(c) { return !skipTypes.includes(c.type); }).map(function(col) {
                                return <option key={col.id} value={col.id}>{col.name}</option>;
                              })}
                            </select>
                          </div>);
                        })}
                      </div>
                    </div>);
                  })}
                </div>
              </div>)}

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Visible by Default</label><input type="number" value={rgDefaultVisible} onChange={function(e) { setRgDefaultVisible(parseInt(e.target.value) || 1); }} min={1} max={manualRows.length || 1} className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" /></div>
                <div className="flex items-end"><span className="text-[10px] text-gray-400 pb-2">{manualRows.length} rows, {manualSlots.length} columns</span></div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button onClick={function() { setShowRepeatingGroupSetup(false); }} className="px-4 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={addManualRepeatingGroup} disabled={manualSlots.length === 0 || manualRows.length === 0} className="px-4 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium">Create Group</button>
              </div>
            </>)}

            {rgMode === 'auto' && (<>
              <div className="flex items-center space-x-2"><button onClick={function() { setRgMode('choose'); }} className="text-gray-400 hover:text-gray-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></button><h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Auto-Detect Column Pattern</h3></div>
              <p className="text-[10px] text-gray-500">Group columns that repeat (e.g. Line 1 QTY, Line 2 QTY...) into expandable rows.</p>
              <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Group Label</label><input type="text" value={rgLabel} onChange={function(e) { setRgLabel(e.target.value); }} className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" /></div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Select Column Pattern</label>
                <input type="text" value={rgColumnSearch} onChange={function(e) { setRgColumnSearch(e.target.value); }} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded mb-2 bg-white dark:bg-gray-800 dark:text-gray-200" />
                <div className="max-h-32 overflow-y-auto space-y-1">{(function() { var bn = new Set<string>(); tableColumns.forEach(function(c) { var m = c.name.match(/^Line\s+\d+\s+(.+)/i); if (m) bn.add(m[1].trim()); }); return Array.from(bn).filter(function(n) { return n.toLowerCase().includes(rgColumnSearch.toLowerCase()); }).map(function(baseName) { return (<label key={baseName} className="flex items-center space-x-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"><input type="checkbox" checked={rgColumnsPerRow.includes(baseName)} onChange={function(e) { if (e.target.checked) setRgColumnsPerRow(function(p) { return p.concat([baseName]); }); else setRgColumnsPerRow(function(p) { return p.filter(function(n) { return n !== baseName; }); }); }} className="w-3.5 h-3.5 rounded border-gray-300 text-teal-600" /><span className="text-xs text-gray-700 dark:text-gray-300">{baseName}</span></label>); }); })()}</div>
                {rgColumnsPerRow.length > 0 && (<div className="mt-2 flex flex-wrap gap-1">{rgColumnsPerRow.map(function(n) { return <span key={n} className="text-[9px] px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded-full">{n}</span>; })}</div>)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Max Rows</label><input type="number" value={rgRowCount} onChange={function(e) { setRgRowCount(parseInt(e.target.value) || 1); }} min={1} max={50} className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" /></div>
                <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Visible by Default</label><input type="number" value={rgDefaultVisible} onChange={function(e) { setRgDefaultVisible(parseInt(e.target.value) || 1); }} min={1} max={rgRowCount} className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" /></div>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button onClick={function() { setShowRepeatingGroupSetup(false); }} className="px-4 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={addAutoRepeatingGroup} disabled={rgColumnsPerRow.length === 0} className="px-4 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium">Create Group</button>
              </div>
            </>)}
          </div>
        </div>
      )}

      <FormPreview name={name} description={description} submitButtonText={submitButtonText} pages={pages} fields={fields} formSlug={form.slug} />
    </div>
  );
}

function RgSettingsPanel({ field, fieldIndex, tableColumns, onUpdate, onClose }: { field: any; fieldIndex: number; tableColumns: any[]; onUpdate: (index: number, updates: any) => void; onClose: () => void }) {
  var cols = field.columnsPerRow || [];
  var formulas = field.columnFormulas || {};
  function updateRg(updates: any) { onUpdate(fieldIndex, updates); }
  function setColumnFormula(colName: string, formula: any) { var nf = Object.assign({}, formulas); if (formula === null) delete nf[colName]; else nf[colName] = formula; updateRg({ columnFormulas: nf }); }
  function handleRowCountChange(newCount: number) {
    var cr = field.rows || []; var cc = cr.length; if (newCount === cc || newCount < 1) return;
    if (newCount < cc) { updateRg({ rows: cr.slice(0, newCount) }); return; }
    var nr = cr.slice(); var cpr = field.columnsPerRow || []; var grouped: Record<string, any[]> = {};
    tableColumns.forEach(function(c) { var m = c.name.match(/^Line\s+(\d+)\s+/i); if (m) { var bn = c.name.replace(/^Line\s+\d+\s+/i, '').trim(); if (cpr.includes(bn)) { if (!grouped[m[1]]) grouped[m[1]] = []; grouped[m[1]].push(c); } } });
    var used = new Set<string>(); cr.forEach(function(r: any) { if (r.fields?.[0]) { var col = tableColumns.find(function(c: any) { return c.id === r.fields[0]; }); if (col) { var m = col.name.match(/^Line\s+(\d+)\s+/i); if (m) used.add(m[1]); } } });
    var avail = Object.keys(grouped).filter(function(n) { return !used.has(n); }).sort(function(a, b) { return parseInt(a) - parseInt(b); });
    var toAdd = newCount - cc; for (var i = 0; i < toAdd && i < avail.length; i++) { var lc = grouped[avail[i]]; lc.sort(function(a: any, b: any) { return cpr.indexOf(a.name.replace(/^Line\s+\d+\s+/i, '').trim()) - cpr.indexOf(b.name.replace(/^Line\s+\d+\s+/i, '').trim()); }); nr.push({ rowNum: cc + i + 1, fields: lc.map(function(c: any) { return c.id; }), labels: lc.map(function(c: any) { return c.name; }) }); }
    updateRg({ rows: nr });
  }
  var maxP = 50; var aln = new Set<string>(); tableColumns.forEach(function(c) { var m = c.name.match(/^Line\s+(\d+)\s+/i); if (m) { var bn = c.name.replace(/^Line\s+\d+\s+/i, '').trim(); if (cols.includes(bn)) aln.add(m[1]); } }); if (aln.size > 0) maxP = aln.size;
  var totalRows = field.rows?.length || 0;

  return (
    <div className="w-[280px] border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-800/50">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-2 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></button>
        <span className="text-xs font-bold text-teal-700 dark:text-teal-400 truncate">{field.label}</span>
        <span className="text-[8px] font-bold px-1 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">REPEAT</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div><label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Group Label</label><input type="text" value={field.label} onChange={function(e) { updateRg({ label: e.target.value }); }} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-teal-500 bg-white dark:bg-gray-800 dark:text-gray-200" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Default Rows</label><input type="number" value={field.defaultVisibleRows || 1} onChange={function(e) { updateRg({ defaultVisibleRows: parseInt(e.target.value) || 1 }); }} min={1} max={totalRows} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-teal-500 bg-white dark:bg-gray-800 dark:text-gray-200" /></div>
          <div><label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Total Rows</label><input type="number" value={totalRows} onChange={function(e) { handleRowCountChange(parseInt(e.target.value) || 1); }} min={1} max={maxP || 50} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-teal-500 bg-white dark:bg-gray-800 dark:text-gray-200" />{maxP > 0 && (<p className="text-[8px] text-gray-400 mt-0.5">Max: {maxP}</p>)}</div>
        </div>
        {/* Validation */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <h5 className="text-[9px] font-bold text-gray-400 uppercase mb-1.5">Validation</h5>
          <label className="flex items-center space-x-1.5 cursor-pointer"><input type="checkbox" checked={field.rgRequireMode === 'first' || field.rgRequireMode === 'all'} onChange={function(e) { if (e.target.checked) updateRg({ rgRequireMode: 'first' }); else updateRg({ rgRequireMode: 'none', rgRequiredColumns: [] }); }} className="w-3 h-3 rounded border-gray-300 text-red-600" /><span className="text-[10px] text-gray-700 dark:text-gray-300">Require fields</span></label>
          {(field.rgRequireMode === 'first' || field.rgRequireMode === 'all') && (
            <div className="ml-4 mt-1.5 space-y-1.5">
              <select value={field.rgRequireMode || 'first'} onChange={function(e) { updateRg({ rgRequireMode: e.target.value }); }} className="w-full px-2 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200"><option value="first">First row only</option><option value="all">All visible rows</option></select>
              <div className="flex items-center justify-between"><span className="text-[8px] font-bold text-gray-400 uppercase">Required columns</span><button onClick={function() { var nc = cols.filter(function(c: string) { return !formulas[c]; }); var ac = nc.every(function(c: string) { return (field.rgRequiredColumns || []).includes(c); }); updateRg({ rgRequiredColumns: ac ? [] : nc }); }} className="text-[8px] text-red-500 hover:text-red-700 font-medium">{cols.filter(function(c: string) { return !formulas[c]; }).every(function(c: string) { return (field.rgRequiredColumns || []).includes(c); }) ? 'Uncheck all' : 'Check all'}</button></div>
              {cols.map(function(colName: string) { if (formulas[colName]) return null; var ir = (field.rgRequiredColumns || []).includes(colName); return (<label key={colName} className="flex items-center space-x-1.5 cursor-pointer"><input type="checkbox" checked={ir} onChange={function(e) { var cur = field.rgRequiredColumns || []; updateRg({ rgRequiredColumns: e.target.checked ? cur.concat([colName]) : cur.filter(function(c: string) { return c !== colName; }) }); }} className="w-3 h-3 rounded border-gray-300 text-red-600" /><span className="text-[10px] text-gray-700 dark:text-gray-300">{colName}</span></label>); })}
            </div>
          )}
        </div>
        {/* Column formulas */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700"><h5 className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Columns</h5><p className="text-[8px] text-gray-400 mb-2">Configure per-column formulas.</p></div>
          {cols.map(function(colName: string) { var hf = !!formulas[colName]; return (<div key={colName} className={'rounded-lg p-2 border mb-2 ' + (hf ? 'border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10' : 'border-gray-200 dark:border-gray-700')}><div className="flex items-center justify-between mb-1"><span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">{colName}</span><label className="flex items-center space-x-1 cursor-pointer"><input type="checkbox" checked={hf} onChange={function(e) { if (e.target.checked) setColumnFormula(colName, { operations: [], format: 'currency', decimals: 2, prefix: '$' }); else setColumnFormula(colName, null); }} className="w-3 h-3 rounded border-gray-300 text-orange-600" /><span className="text-[8px] text-gray-500">Calc</span></label></div>
            {hf && (<div className="space-y-1.5"><div className="space-y-1">{(formulas[colName].operations || []).map(function(op: any, oi: number) { return (<div key={oi} className="flex items-center space-x-1">{oi > 0 && (<select value={op.operator || '+'} onChange={function(e) { var ops = (formulas[colName].operations || []).slice(); ops[oi] = Object.assign({}, ops[oi], { operator: e.target.value }); setColumnFormula(colName, Object.assign({}, formulas[colName], { operations: ops })); }} className="w-8 px-0.5 py-0.5 text-[9px] border border-orange-300 dark:border-orange-700 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-center font-bold"><option value="+">+</option><option value="-">-</option><option value="*">x</option><option value="/">/</option></select>)}<select value={op.columnIndex !== undefined ? String(op.columnIndex) : ''} onChange={function(e) { var ops = (formulas[colName].operations || []).slice(); var v = e.target.value; if (v === '__constant') ops[oi] = Object.assign({}, ops[oi], { columnIndex: undefined, constantValue: op.constantValue || 0, isConstant: true }); else ops[oi] = Object.assign({}, ops[oi], { columnIndex: parseInt(v), isConstant: false }); setColumnFormula(colName, Object.assign({}, formulas[colName], { operations: ops })); }} className="flex-1 px-1 py-0.5 text-[9px] border border-orange-300 dark:border-orange-700 rounded bg-white dark:bg-gray-800 dark:text-gray-200"><option value="">Select...</option>{cols.filter(function(c: string) { return c !== colName; }).map(function(c: string) { return <option key={c} value={String(cols.indexOf(c))}>{c}</option>; })}<option value="__constant">Constant</option></select>{op.isConstant && (<input type="number" value={op.constantValue ?? ''} onChange={function(e) { var ops = (formulas[colName].operations || []).slice(); ops[oi] = Object.assign({}, ops[oi], { constantValue: parseFloat(e.target.value) || 0 }); setColumnFormula(colName, Object.assign({}, formulas[colName], { operations: ops })); }} className="w-12 px-1 py-0.5 text-[9px] border border-orange-300 dark:border-orange-700 rounded bg-white dark:bg-gray-800 dark:text-gray-200" placeholder="0" />)}<button onClick={function() { var ops = (formulas[colName].operations || []).filter(function(_: any, i: number) { return i !== oi; }); setColumnFormula(colName, Object.assign({}, formulas[colName], { operations: ops })); }} className="text-orange-400 hover:text-red-500"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>); })}</div>
              <button onClick={function() { var ops = (formulas[colName].operations || []).concat([{ columnIndex: undefined, operator: '*', isConstant: false }]); setColumnFormula(colName, Object.assign({}, formulas[colName], { operations: ops })); }} className="text-[8px] text-orange-600 dark:text-orange-400 hover:text-orange-800 font-medium">+ Add operand</button>
              <div className="grid grid-cols-2 gap-1 pt-1 border-t border-orange-200 dark:border-orange-700"><select value={formulas[colName].format || 'number'} onChange={function(e) { setColumnFormula(colName, Object.assign({}, formulas[colName], { format: e.target.value, prefix: e.target.value === 'currency' ? '$' : '' })); }} className="px-1 py-0.5 text-[8px] border border-orange-300 dark:border-orange-700 rounded bg-white dark:bg-gray-800 dark:text-gray-200"><option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percent</option></select><input type="number" value={formulas[colName].decimals ?? 2} onChange={function(e) { setColumnFormula(colName, Object.assign({}, formulas[colName], { decimals: parseInt(e.target.value) || 0 })); }} min={0} max={6} className="px-1 py-0.5 text-[8px] border border-orange-300 dark:border-orange-700 rounded bg-white dark:bg-gray-800 dark:text-gray-200" placeholder="Decimals" /></div></div>)}
          </div>); })}
      </div>
    </div>
  );
}

function getTypeIcon(type: string): string { var i: Record<string, string> = { text: 'T', number: '#', currency: '$', percent: '%', date: 'D', datetime: 'DT', email: '@', phone: 'Ph', url: 'U', select: 'S', multi_select: 'MS', checkbox: 'CB', rating: '*', textarea: 'P', color: 'C' }; return i[type] || 'T'; }