// ============================================================
// app/automations/AutomationsManager.tsx
// Full automation management UI — with sidebar, user picker,
// duplicate, test run, run detail, error display
// ============================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { RunHistoryPanel } from './RunHistoryPanel';
import { AutomationAnalytics } from './AutomationAnalytics';

// ---- Types ----

interface AutomationAction {
  id?: string;
  actionType: string;
  actionConfig: Record<string, any>;
  conditionExpr?: string;
  sortOrder: number;
}

interface Automation {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggerType: string;
  triggerConfig: Record<string, any>;
  webhookSlug?: string;
  workspaceId?: string;
  actions: any[];
  _count?: { runs: number };
  runs?: any[];
  createdAt: string;
  creatorName?: string;
  creatorEmail?: string;
  workspaceName?: string;
  workspaceIcon?: string;
  sharedTableName?: string;
  sharedTableIcon?: string;
  tableId?: string;
  isOwner?: boolean;
  maxRetries?: number;
  retryDelaySec?: number;
}

interface WorkspaceOption {
  id: string;
  name: string;
  icon?: string;
}

interface ColumnInfo {
  id: string;
  name: string;
  type: string;
  settings?: any;
}

interface TableOption {
  id: string;
  name: string;
  columns: ColumnInfo[];
}

interface UserInfo {
  id: string;
  name: string | null;
  email: string;
}

// ---- Constants ----

var TRIGGER_TYPES = [
  { value: 'row_created', label: 'Row Created', icon: '+', desc: 'When a new row is added' },
  { value: 'row_updated', label: 'Row Updated', icon: '✎', desc: 'When a row is modified' },
  { value: 'row_deleted', label: 'Row Deleted', icon: '✕', desc: 'When a row is removed' },
  { value: 'column_match', label: 'Column Match', icon: '⊜', desc: 'When a column equals a value' },
  { value: 'form_submit', label: 'Form Submitted', icon: '📋', desc: 'When a form is submitted' },
  { value: 'scheduled', label: 'Scheduled', icon: '⏱', desc: 'Run on a cron schedule' },
  { value: 'webhook', label: 'Webhook', icon: '⚡', desc: 'Triggered by HTTP request' },
  { value: 'manual', label: 'For Selected Row', icon: '👆', desc: 'Run manually on selected rows' },
  { value: 'approval_completed', label: 'Approval Completed', icon: '✅', desc: 'When an approval is fully approved' },
  { value: 'approval_denied', label: 'Approval Denied', icon: '❌', desc: 'When an approval is denied' },
];

var ACTION_TYPES = [
  { value: 'update_field', label: 'Update Field', icon: '✎' },
  { value: 'create_row', label: 'Create Row', icon: '+' },
  { value: 'send_email', label: 'Send Email', icon: '✉' },
  { value: 'webhook', label: 'Send Webhook', icon: '⚡' },
  { value: 'lock_row', label: 'Lock Row', icon: '🔒' },
  { value: 'unlock_row', label: 'Unlock Row', icon: '🔓' },
  { value: 'notify', label: 'Notify', icon: '🔔' },
  { value: 'trigger_approval', label: 'Trigger Approval', icon: '✅' },
  { value: 'push_to_sharepoint', label: 'Push to SharePoint', icon: '📤' },
  { value: 'generate_record_export', label: 'Generate Record Export', icon: '📄' },
  { value: 'generate_audit_trail', label: 'Generate Audit Trail', icon: '🔏' },
  { value: 'push_to_google_sheets', label: 'Push to Google Sheets', icon: '📗' },
  { value: 'delay', label: 'Delay', icon: '⏳' },
  { value: 'condition', label: 'IF / Condition', icon: '🔀' },
];

var CRON_PRESETS = [
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 8am', value: '0 8 * * *' },
  { label: 'Weekly (Monday 8am)', value: '0 8 * * 1' },
  { label: 'Monthly (1st at 8am)', value: '0 8 1 * *' },
];

var READ_ONLY_TYPES = ['formula', 'lookup', 'rollup', 'linked_record', 'attachment'];

// ---- Style class strings ----
var inputCls = "w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 text-[13px] placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent box-border";
var selectCls = "w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 text-[13px] outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent box-border cursor-pointer";
var labelCls = "block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1";
var iconBtnCls = "bg-transparent border-none text-gray-400 dark:text-gray-500 cursor-pointer text-sm p-1";
var addBtnCls = "bg-transparent border border-dashed border-gray-300 dark:border-gray-600 rounded-md text-gray-400 dark:text-gray-500 cursor-pointer text-xs px-3 py-1.5 w-full hover:bg-gray-50 dark:hover:bg-gray-800";
var cardCls = "bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-[10px] p-4";
var btnPrimaryCls = "bg-blue-600 text-white border-none rounded-lg px-5 py-2.5 text-[13px] font-semibold cursor-pointer hover:bg-blue-700";
var btnSecondaryCls = "bg-transparent border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 px-4 py-2 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800";

// ---- Dynamic Value Fallback ----
function DynamicFallback({ value, onChange, triggerColumns, label }: { value: string; onChange: (val: string) => void; triggerColumns: ColumnInfo[]; label: string }) {
  var [isOpen, setIsOpen] = useState(false);
  if (triggerColumns.length === 0) return null;
  return (<div>
    <button onClick={function() { setIsOpen(!isOpen); }} className="bg-transparent border-none text-indigo-500 dark:text-indigo-400 text-[11px] cursor-pointer py-0.5 flex items-center gap-1">
      <span className="text-[10px]">{isOpen ? '▼' : '▶'}</span> {label}
    </button>
    {isOpen && (<div className="flex flex-wrap gap-1 p-2 bg-violet-50 dark:bg-violet-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-md mt-1">
      {triggerColumns.filter(function(c) { return READ_ONLY_TYPES.indexOf(c.type) === -1; }).map(function(col) {
        return (<button key={col.id} onClick={function() { onChange(value ? value + '{{row.' + col.name + '}}' : '{{row.' + col.name + '}}'); setIsOpen(false); }}
          className="bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-500/30 rounded text-[11px] px-2 py-[3px] text-indigo-700 dark:text-indigo-300 cursor-pointer font-mono">
          {col.name}
        </button>);
      })}
      <span className="text-[10px] text-gray-400 dark:text-gray-500 w-full mt-1">Click to insert value from triggering row</span>
    </div>)}
  </div>);
}

// ---- Dynamic Value Input ----
function DynamicValueInput({ column, value, onChange, triggerColumns }: { column: ColumnInfo; value: string; onChange: (val: string) => void; triggerColumns: ColumnInfo[] }) {
  var colType = column.type;
  var settings = column.settings || {};

  if (colType === 'select' && settings.options) {
    return (<div className="flex flex-col gap-1">
      <select value={value || ''} onChange={function(e) { onChange(e.target.value); }} className={selectCls}>
        <option value="">— Pick an option —</option>
        {settings.options.map(function(opt: any) { return <option key={opt.value} value={opt.value}>{opt.label}</option>; })}
      </select>
      <DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" />
    </div>);
  }
  if (colType === 'multi_select' && settings.options) {
    var currentVals = value ? value.split(',') : [];
    return (<div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5 p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md">
        {settings.options.map(function(opt: any) { var checked = currentVals.indexOf(opt.value) !== -1;
          return (<label key={opt.value} className={"flex items-center gap-1 text-xs cursor-pointer px-1.5 py-0.5 rounded " + (checked ? "bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300")}>
            <input type="checkbox" checked={checked} onChange={function() { var nv = checked ? currentVals.filter(function(v) { return v !== opt.value; }) : currentVals.concat([opt.value]); onChange(nv.join(',')); }} /> {opt.label}
          </label>); })}
      </div>
      <DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" />
    </div>);
  }
  if (colType === 'checkbox') {
    return (<label className="flex items-center gap-1.5 text-[13px] text-gray-700 dark:text-gray-300 cursor-pointer">
      <input type="checkbox" checked={value === 'true'} onChange={function(e) { onChange(e.target.checked ? 'true' : 'false'); }} />
      {value === 'true' ? '☑️ Checked' : '☐ Unchecked'}
    </label>);
  }
  if (colType === 'rating') {
    return (<div className="flex items-center gap-1">
      {[0,1,2,3,4,5].map(function(n) { var active = parseInt(value||'0') >= n && n > 0;
        return (<button key={n} onClick={function() { onChange(String(n)); }} className={"bg-transparent border-none text-xl cursor-pointer p-0.5 " + (n===0 ? "opacity-40" : "opacity-100")}>{n===0?'✕':(active?'⭐':'☆')}</button>); })}
      <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-2">{value ? value+'/5' : 'No rating'}</span>
    </div>);
  }
  if (colType === 'progress') {
    return (<div className="flex items-center gap-2">
      <input type="range" min="0" max="100" value={value||'0'} onChange={function(e) { onChange(e.target.value); }} className="flex-1" />
      <span className="text-xs text-gray-700 dark:text-gray-300 font-medium min-w-[36px]">{value||'0'}%</span>
    </div>);
  }
  if (colType === 'number') { return (<div className="flex flex-col gap-1"><input type="number" value={value||''} onChange={function(e) { onChange(e.target.value); }} className={inputCls} placeholder="Enter number" /><DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" /></div>); }
  if (colType === 'currency') { return (<div className="flex flex-col gap-1"><div className="flex items-center gap-1"><span className="text-sm text-gray-700 dark:text-gray-300 font-semibold">$</span><input type="number" step="0.01" value={value||''} onChange={function(e) { onChange(e.target.value); }} className={inputCls + " flex-1"} placeholder="0.00" /></div><DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" /></div>); }
  if (colType === 'percent') { return (<div className="flex flex-col gap-1"><div className="flex items-center gap-1"><input type="number" min="0" max="100" value={value||''} onChange={function(e) { onChange(e.target.value); }} className={inputCls + " flex-1"} placeholder="0" /><span className="text-sm text-gray-700 dark:text-gray-300 font-semibold">%</span></div><DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" /></div>); }
  if (colType === 'date') { return (<div className="flex flex-col gap-1"><input type="date" value={value||''} onChange={function(e) { onChange(e.target.value); }} className={inputCls} /><DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" /></div>); }
  if (colType === 'datetime') { return (<div className="flex flex-col gap-1"><input type="datetime-local" value={value||''} onChange={function(e) { onChange(e.target.value); }} className={inputCls} /><DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" /></div>); }
  if (colType === 'color') { return (<div className="flex items-center gap-2"><input type="color" value={value||'#3B82F6'} onChange={function(e) { onChange(e.target.value); }} className="w-10 h-8 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer" /><span className="text-xs text-gray-500 dark:text-gray-400">{value||'#3B82F6'}</span></div>); }
  // Text fallback
  return (<div className="flex flex-col gap-1">
    {colType === 'long_text' ? <textarea value={value||''} onChange={function(e) { onChange(e.target.value); }} className={inputCls + " min-h-[60px] resize-y"} placeholder="Enter text" />
    : <input type="text" value={value||''} onChange={function(e) { onChange(e.target.value); }} className={inputCls} placeholder={colType==='email'?'email@example.com':colType==='url'?'https://...':colType==='phone'?'(555) 555-5555':'Enter value'} />}
    <DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or insert dynamic value" />
  </div>);
}

// ---- User Picker for Notify ----
function UserPicker({ selectedIds, onChange, users }: { selectedIds: string[]; onChange: (ids: string[]) => void; users: UserInfo[] }) {
  return (<div className="flex flex-col gap-1.5">
    {selectedIds.length > 0 && (<div className="flex flex-wrap gap-1">
      {selectedIds.map(function(uid) {
        var user = users.find(function(u) { return u.id === uid; });
        return (<span key={uid} className="inline-flex items-center gap-1 px-2 py-[3px] bg-blue-100 dark:bg-blue-500/20 rounded-xl text-[11px] text-blue-800 dark:text-blue-300">
          {user ? (user.name || user.email) : uid}
          <button onClick={function() { onChange(selectedIds.filter(function(id) { return id !== uid; })); }} className="bg-transparent border-none cursor-pointer text-blue-500 dark:text-blue-400 text-xs p-0">✕</button>
        </span>);
      })}
    </div>)}
    <select value="" onChange={function(e) { if (e.target.value && selectedIds.indexOf(e.target.value) === -1) { onChange(selectedIds.concat([e.target.value])); } }} className={selectCls}>
      <option value="">— Add user —</option>
      {users.filter(function(u) { return selectedIds.indexOf(u.id) === -1; }).map(function(u) {
        return <option key={u.id} value={u.id}>{u.name ? u.name + ' (' + u.email + ')' : u.email}</option>;
      })}
    </select>
  </div>);
}

// ---- Status Badge ----
function StatusBadge({ status }: { status: string }) {
  var cm: Record<string,string> = {
    success: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
    failed: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
    running: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
    pending: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
    skipped: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
  };
  var c = cm[status] || cm.pending;
  return <span className={"px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide uppercase " + c}>{status}</span>;
}

// ---- Main Component ----
export default function AutomationsManager() {
  var [automations, setAutomations] = useState<Automation[]>([]);
  var [tables, setTables] = useState<TableOption[]>([]);
  var [users, setUsers] = useState<UserInfo[]>([]);
  var [forms, setForms] = useState<Record<string, any[]>>({});
  var [approvalWorkflows, setApprovalWorkflows] = useState<Record<string, any[]>>({});
  var [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  var [loading, setLoading] = useState(true);
  var [view, setView] = useState<'list'|'builder'|'detail'|'analytics'>('list');
  var [selectedAutomation, setSelectedAutomation] = useState<Automation|null>(null);
  var [selectedId, setSelectedId] = useState<string|null>(null);
  var [builderName, setBuilderName] = useState('');
  var [builderDesc, setBuilderDesc] = useState('');
  var [builderTrigger, setBuilderTrigger] = useState('row_created');
  var [builderTriggerConfig, setBuilderTriggerConfig] = useState<Record<string,any>>({});
  var [builderActions, setBuilderActions] = useState<AutomationAction[]>([]);
  var [saving, setSaving] = useState(false);
  var [editingId, setEditingId] = useState<string|null>(null);
  var [builderWorkspaceId, setBuilderWorkspaceId] = useState<string|null>(null);
  var [builderTableId, setBuilderTableId] = useState<string|null>(null);
  var [builderMaxRetries, setBuilderMaxRetries] = useState(0);
  var [builderRetryDelaySec, setBuilderRetryDelaySec] = useState(0);
  var [testing, setTesting] = useState(false);
  var [testResult, setTestResult] = useState<any>(null);

  var fetchAutomations = useCallback(async function() { try { var r = await fetch('/api/automations'); if (r.ok) setAutomations(await r.json()); } catch(e) { console.error(e); } }, []);
  var fetchTables = useCallback(async function() { try { var r = await fetch('/api/tables'); if (r.ok) { var d = await r.json(); setTables(d.map(function(t:any) { return { id:t.id, name:t.name, columns:(t.columns||[]).map(function(c:any) { return { id:c.id, name:c.name, type:c.type, settings:c.settings }; }) }; })); } } catch(e) { console.error(e); } }, []);
  var fetchUsers = useCallback(async function() { try { var r = await fetch('/api/users'); if (r.ok) { var d = await r.json(); setUsers(d.users || []); } } catch(e) { console.error(e); } }, []);
  var fetchWorkspaces = useCallback(async function() { try { var r = await fetch('/api/workspaces'); if (r.ok) { var d = await r.json(); setWorkspaces((d.workspaces || d || []).map(function(w: any) { return { id: w.id, name: w.name, icon: w.icon }; })); } } catch(e) { console.error(e); } }, []);

  var fetchFormsForTable = useCallback(async function(tableId: string) {
    if (forms[tableId]) return;
    try { var r = await fetch("/api/tables/" + tableId + "/forms"); if (r.ok) { var d = await r.json(); setForms(function(prev) { var next = Object.assign({}, prev); next[tableId] = d.forms || []; return next; }); } } catch(e) { console.error(e); }
  }, [forms]);

  var fetchApprovalWorkflows = useCallback(async function(tableId: string) {
    if (approvalWorkflows[tableId]) return;
    try { var r = await fetch("/api/tables/" + tableId + "/approvals"); if (r.ok) { var d = await r.json(); setApprovalWorkflows(function(prev) { var next = Object.assign({}, prev); next[tableId] = d ? [d] : []; return next; }); } } catch(e) { console.error(e); }
  }, [approvalWorkflows]);

  useEffect(function() { Promise.all([fetchAutomations(), fetchTables(), fetchUsers(), fetchWorkspaces()]).then(function() { setLoading(false); }); }, [fetchAutomations, fetchTables, fetchUsers, fetchWorkspaces]);

  function getTriggerLabel(type:string) { var t = TRIGGER_TYPES.find(function(t) { return t.value===type; }); return t ? t.icon+' '+t.label : type; }
  function getActionLabel(type:string) { var a = ACTION_TYPES.find(function(a) { return a.value===type; }); return a ? a.icon+' '+a.label : type; }
  function getTableColumns(id:string):ColumnInfo[] { var t = tables.find(function(t) { return t.id===id; }); return t ? t.columns : []; }
  function getSettableColumns(id:string):ColumnInfo[] { return getTableColumns(id).filter(function(c) { return READ_ONLY_TYPES.indexOf(c.type)===-1; }); }
  function getColumnByName(tid:string, name:string):ColumnInfo|undefined { return getTableColumns(tid).find(function(c) { return c.name===name; }); }
  function getTriggerTableColumns():ColumnInfo[] { return builderTriggerConfig.tableId ? getTableColumns(builderTriggerConfig.tableId) : []; }
  function getTableName(id:string) { var t = tables.find(function(t) { return t.id===id; }); return t ? t.name : id; }

  async function loadDetail(id:string) { try { var r = await fetch('/api/automations/'+id); if (r.ok) { setSelectedAutomation(await r.json()); setSelectedId(id); setView('detail'); } } catch(e) { console.error(e); } }
  async function toggleEnabled(id:string, cur:boolean) { await fetch('/api/automations/'+id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({enabled:!cur}) }); fetchAutomations(); if (selectedId===id) loadDetail(id); }
  async function deleteAutomation(id:string) { if (!confirm('Delete this automation?')) return; await fetch('/api/automations/'+id, {method:'DELETE'}); if (selectedId===id) { setView('list'); setSelectedId(null); } fetchAutomations(); }

  async function duplicateAutomation(auto:Automation) {
    var payload = { name: auto.name + ' (copy)', description: auto.description, triggerType: auto.triggerType, triggerConfig: auto.triggerConfig,
      actions: auto.actions.map(function(a:any) { return { actionType: a.actionType||a.actiontype, actionConfig: a.actionConfig||a.actionconfig||{}, conditionExpr: a.conditionExpr||a.conditionexpr }; }) };
    var r = await fetch('/api/automations', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if (r.ok) { fetchAutomations(); }
  }

  async function testAutomation(id: string) { setTesting(true); setTestResult(null); try { var r = await fetch("/api/automations/" + id + "/test", { method: "POST" }); if (r.ok) { setTestResult(await r.json()); } else { var e = await r.json(); setTestResult({ error: e.error || "Test failed" }); } } catch(e) { setTestResult({ error: "Network error" }); } finally { setTesting(false); } }

  function openBuilder(auto?:Automation) {
    if (auto) {
      setEditingId(auto.id); setBuilderName(auto.name); setBuilderDesc(auto.description||'');
      setBuilderTrigger(auto.triggerType); setBuilderTriggerConfig(auto.triggerConfig||{});
      setBuilderActions(auto.actions.map(function(a:any,i:number) { return { actionType:a.actionType||a.actiontype, actionConfig:a.actionConfig||a.actionconfig||{}, conditionExpr:a.conditionExpr||a.conditionexpr, sortOrder:i }; }));
      setBuilderWorkspaceId(auto.workspaceId || null);
      setBuilderTableId(auto.tableId || null);
      setBuilderMaxRetries(auto.maxRetries||0);
      setBuilderRetryDelaySec(auto.retryDelaySec||0);
    } else { setEditingId(null); setBuilderName(''); setBuilderDesc(''); setBuilderTrigger('row_created'); setBuilderTriggerConfig({}); setBuilderActions([]); setBuilderWorkspaceId(null); setBuilderTableId(null); setBuilderMaxRetries(0); setBuilderRetryDelaySec(0); }
    setView('builder');
  }

  function addAction() { setBuilderActions(function(p) { return p.concat([{actionType:'update_field',actionConfig:{},sortOrder:p.length}]); }); }
  function updateAction(i:number, u:Partial<AutomationAction>) { setBuilderActions(function(p) { var c=p.slice(); c[i]=Object.assign({},c[i],u); return c; }); }
  function removeAction(i:number) { setBuilderActions(function(p) { return p.filter(function(_,j) { return j!==i; }); }); }
  function moveAction(i:number, d:number) { setBuilderActions(function(p) { var c=p.slice(); var t=i+d; if(t<0||t>=c.length) return p; var tmp=c[i]; c[i]=c[t]; c[t]=tmp; return c.map(function(a,j) { return Object.assign({},a,{sortOrder:j}); }); }); }

  async function saveAutomation() {
    if (!builderName.trim()) { alert('Name is required'); return; }
    setSaving(true);
    try {
      var url = editingId ? '/api/automations/'+editingId : '/api/automations';
      var r = await fetch(url, { method:editingId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:builderName, description:builderDesc||null, triggerType:builderTrigger, triggerConfig:builderTriggerConfig, actions:builderActions, workspaceId:builderWorkspaceId, tableId:builderTableId, maxRetries:builderMaxRetries, retryDelaySec:builderRetryDelaySec }) });
      if (r.ok) { await fetchAutomations(); setView('list'); } else { var e = await r.json(); alert('Error: '+(e.error||'Unknown')); }
    } catch(e) { console.error(e); } finally { setSaving(false); }
  }

  // ---- Trigger Config ----
  function TriggerConfigEditor() {
    var needsTable = ['row_created','row_updated','row_deleted','column_match','form_submit'].indexOf(builderTrigger)!==-1;
    return (<div className="flex flex-col gap-3">
      {needsTable && (<div><label className={labelCls}>Table</label>
        <select value={builderTriggerConfig.tableId||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{tableId:e.target.value}); }); }} className={selectCls}>
          <option value="">— Select table —</option>
          {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
        </select></div>)}
      {builderTrigger==='column_match' && builderTriggerConfig.tableId && (<>
        <div><label className={labelCls}>Column</label>
          <select value={builderTriggerConfig.column||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{column:e.target.value,value:''}); }); }} className={selectCls}>
            <option value="">— Select column —</option>
            {getSettableColumns(builderTriggerConfig.tableId).map(function(c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
          </select></div>
        {builderTriggerConfig.column && (function() {
          var col = getTableColumns(builderTriggerConfig.tableId).find(function(c) { return c.id === builderTriggerConfig.column; });
          if (!col) return <div><label className={labelCls}>Equals Value</label><input type="text" value={builderTriggerConfig.value||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{value:e.target.value}); }); }} className={inputCls} /></div>;
          return <div><label className={labelCls}>Equals Value</label><DynamicValueInput column={col} value={builderTriggerConfig.value||''} onChange={function(v) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{value:v}); }); }} triggerColumns={[]} /></div>;
        })()}
      </>)}
      {builderTrigger==="form_submit" && builderTriggerConfig.tableId && (function() {
        fetchFormsForTable(builderTriggerConfig.tableId);
        var tableForms = forms[builderTriggerConfig.tableId] || [];
        return (<div><label className={labelCls}>Form</label>
          <select value={builderTriggerConfig.formId||""} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{formId:e.target.value}); }); }} className={selectCls}>
            <option value="">— Any form on this table —</option>
            {tableForms.map(function(f:any) { return <option key={f.id} value={f.id}>{f.name}</option>; })}
          </select>
          {tableForms.length===0 && <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 block">No forms found for this table</span>}
        </div>);
      })()}
      {builderTrigger==='scheduled' && (<div><label className={labelCls}>Schedule</label>
        <select value={CRON_PRESETS.find(function(p) { return p.value===builderTriggerConfig.cron; }) ? builderTriggerConfig.cron : 'custom'} onChange={function(e) { if(e.target.value!=='custom') setBuilderTriggerConfig(function(p) { return Object.assign({},p,{cron:e.target.value}); }); }} className={selectCls}>
          {CRON_PRESETS.map(function(p) { return <option key={p.value} value={p.value}>{p.label}</option>; })}
          <option value="custom">Custom...</option>
        </select>
        <input type="text" value={builderTriggerConfig.cron||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{cron:e.target.value}); }); }} className={inputCls + " mt-2"} placeholder="*/5 * * * *" />
      </div>)}
      {builderTrigger==='webhook' && (<div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-200 dark:border-blue-500/20">
        <span className="text-xs text-blue-700 dark:text-blue-300">A unique webhook URL will be generated when saved.</span>
      </div>)}
	  {builderTrigger==='manual' && (<div className="flex flex-col gap-3">
        <div><label className={labelCls}>Table</label>
          <select value={builderTriggerConfig.tableId||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{tableId:e.target.value}); }); }} className={selectCls}>
            <option value="">— Select table —</option>
            {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
          </select>
        </div>
        <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-200 dark:border-amber-500/20">
          <span className="text-xs text-amber-700 dark:text-amber-300">👆 This automation will appear in the "Run Action" menu when users select rows in the table. It will not run automatically.</span>
        </div>
      </div>)}
      {(builderTrigger==='approval_completed' || builderTrigger==='approval_denied') && (<div className="flex flex-col gap-3">
        <div><label className={labelCls}>Table</label>
          <select value={builderTriggerConfig.tableId||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{tableId:e.target.value}); }); }} className={selectCls}>
            <option value="">— Select table —</option>
            {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
          </select>
        </div>
        <div className={"p-3 rounded-lg border " + (builderTrigger==='approval_completed' ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20" : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20")}>
          <span className={"text-xs " + (builderTrigger==='approval_completed' ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300")}>
            {builderTrigger==='approval_completed' ? '✅ This automation fires when an approval workflow on this table is fully approved. Use it to send emails, update fields, fire webhooks, etc.' : '❌ This automation fires when an approval workflow on this table is denied. Use it to notify the requester, update status fields, etc.'}
          </span>
        </div>
      </div>)}
    </div>);
  }

 // ---- Action Config ----
  // NOTE: This is rendered INLINE (not as a component) to prevent re-mount on keystroke
  function renderActionConfig(action: AutomationAction, index: number) {
    var config = action.actionConfig||{};
    var triggerCols = getTriggerTableColumns();
    function setConfig(k:string,v:any) { updateAction(index, { actionConfig: Object.assign({},config,{[k]:v}) }); }
    var targetTableId = config.targetTableId || builderTriggerConfig.tableId || '';
    var targetColumns = getSettableColumns(targetTableId);

    // Dynamic content panel — renders for text/email fields
    function DynamicContentPanel({ value, onChange, showMeta }: { value: string; onChange: (val: string) => void; showMeta?: boolean }) {
      if (triggerCols.length === 0 && !showMeta) return null;
      return (<div className="p-2.5 bg-violet-50 dark:bg-violet-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-lg mt-1.5">
        <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">INSERT DYNAMIC CONTENT</div>
        {triggerCols.length > 0 && (<div className="flex flex-wrap gap-1 mb-2">
          {triggerCols.filter(function(c) { return READ_ONLY_TYPES.indexOf(c.type) === -1; }).map(function(col) {
            return (<button key={col.id} onClick={function() { onChange(value + '{{row.' + col.name + '}}'); }}
              className="bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-500/30 rounded text-[11px] px-2 py-[3px] text-indigo-700 dark:text-indigo-300 cursor-pointer font-mono">
              {col.name}
            </button>);
          })}
        </div>)}
        {showMeta && (<>
          <div className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1 mt-1">Metadata</div>
          <div className="flex flex-wrap gap-1 mb-1">
            {[
              { label:'Date', val:'{{meta.date}}' },
              { label:'Time', val:'{{meta.time}}' },
              { label:'Timestamp', val:'{{meta.timestamp}}' },
              { label:'Row ID', val:'{{meta.rowId}}' },
              { label:'Table ID', val:'{{meta.tableId}}' },
              { label:'Automation', val:'{{meta.automationName}}' },
            ].map(function(m) {
              return (<button key={m.val} onClick={function() { onChange(value + m.val); }}
                className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded text-[10px] px-2 py-[3px] text-green-700 dark:text-green-300 cursor-pointer font-mono">
                {m.label}
              </button>);
            })}
          </div>
        </>)}
        {(builderTrigger === 'approval_completed' || builderTrigger === 'approval_denied') && (<>
          <div className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1 mt-1">Approval Data</div>
          <div className="flex flex-wrap gap-1">
            {[
              { label:'Workflow Name', val:'{{approval.workflowName}}' },
              { label:'Request ID', val:'{{approval.requestId}}' },
              { label:'Approved/Denied By', val: builderTrigger === 'approval_completed' ? '{{approval.approvedBy}}' : '{{approval.deniedBy}}' },
              { label:'Workflow ID', val:'{{approval.workflowId}}' },
            ].concat(builderTrigger === 'approval_denied' ? [{ label:'Reason', val:'{{approval.reason}}' }] : []).map(function(m) {
              return (<button key={m.val} onClick={function() { onChange(value + m.val); }}
                className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded text-[10px] px-2 py-[3px] text-red-700 dark:text-red-300 cursor-pointer font-mono">
                {m.label}
              </button>);
            })}
          </div>
        </>)}
        {triggerCols.length > 0 && (<div className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1 mt-2">Operators</div>)}
        {triggerCols.length > 0 && (<div className="flex flex-wrap gap-1">
          {['==','!=','>','<','>=','<=','contains','startsWith','isEmpty'].map(function(op) {
            return (<button key={op} onClick={function() { onChange(value + ' ' + op + ' '); }}
              className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded text-[10px] px-2 py-0.5 text-orange-700 dark:text-orange-300 cursor-pointer font-mono">
              {op}
            </button>);
          })}
        </div>)}
      </div>);
    }

    return (<div className="flex flex-col gap-2.5 mt-2">
      {['update_field','create_row','lock_row','unlock_row'].indexOf(action.actionType)!==-1 && (<div><label className={labelCls}>Target Table</label>
        <select value={config.targetTableId||''} onChange={function(e) { setConfig('targetTableId',e.target.value); }} className={selectCls}>
          <option value="">— Select table —</option>
          {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
        </select></div>)}

      {['update_field','create_row'].indexOf(action.actionType)!==-1 && (<div><label className={labelCls}>Set Field Values</label>
        {(config.fieldMappings||[]).map(function(mapping:any, fi:number) {
          var selectedCol = targetColumns.find(function(c) { return c.name===mapping.column; });
          return (<div key={fi} className="mb-2.5 p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex justify-between items-center mb-1.5">
              <select value={mapping.column||''} onChange={function(e) { var m=(config.fieldMappings||[]).slice(); m[fi]={column:e.target.value,value:''}; setConfig('fieldMappings',m); }} className={selectCls + " flex-1"}>
                <option value="">— Select column —</option>
                {targetColumns.map(function(c) { return <option key={c.id} value={c.name}>{c.name} ({c.type})</option>; })}
              </select>
              <button onClick={function() { setConfig('fieldMappings',(config.fieldMappings||[]).filter(function(_:any,i:number) { return i!==fi; })); }} className={iconBtnCls + " text-red-500 ml-2"}>✕</button>
            </div>
            {mapping.column && selectedCol ? <DynamicValueInput column={selectedCol} value={mapping.value||''} onChange={function(v) { var m=(config.fieldMappings||[]).slice(); m[fi]=Object.assign({},m[fi],{value:v}); setConfig('fieldMappings',m); }} triggerColumns={triggerCols} />
            : mapping.column ? (<div><input type="text" value={mapping.value||''} onChange={function(e) { var m=(config.fieldMappings||[]).slice(); m[fi]=Object.assign({},m[fi],{value:e.target.value}); setConfig('fieldMappings',m); }} className={inputCls} placeholder="Enter value or use dynamic content below" /><DynamicContentPanel value={mapping.value||''} onChange={function(v) { var m=(config.fieldMappings||[]).slice(); m[fi]=Object.assign({},m[fi],{value:v}); setConfig('fieldMappings',m); }} showMeta={true} /></div>) : null}
          </div>);
        })}
        <button onClick={function() { setConfig('fieldMappings',(config.fieldMappings||[]).concat([{column:'',value:''}])); }} className={addBtnCls}>+ Add Field</button>
      </div>)}

      {['update_field','lock_row','unlock_row'].indexOf(action.actionType)!==-1 && (<div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
        <label className={labelCls + " text-gray-400 dark:text-gray-500 text-[10px]"}>Row ID (advanced — leave blank for triggering row)</label>
        <input type="text" value={config.targetRowId||''} onChange={function(e) { setConfig('targetRowId',e.target.value); }} className={inputCls + " bg-gray-50 dark:bg-gray-800 text-xs"} placeholder="Leave blank" />
      </div>)}

      {action.actionType==='send_email' && (<>
        <div><label className={labelCls}>To (comma-separated for multiple)</label>
          <input type="text" value={config.to||''} onChange={function(e) { setConfig('to',e.target.value); }} className={inputCls} placeholder="email@example.com, {{row.Contact Email}}" />
          <DynamicContentPanel value={config.to||''} onChange={function(v) { setConfig('to',v); }} />
        </div>
        <div><label className={labelCls}>Subject</label>
          <input type="text" value={config.subject||''} onChange={function(e) { setConfig('subject',e.target.value); }} className={inputCls} placeholder="Your request has been {{row.Status}}" />
          <DynamicContentPanel value={config.subject||''} onChange={function(v) { setConfig('subject',v); }} showMeta={true} />
        </div>
        <div><label className={labelCls}>Body (HTML)</label>
          <textarea value={config.body||''} onChange={function(e) { setConfig('body',e.target.value); }} className={inputCls + " min-h-[100px] resize-y"} placeholder="Hi {{row.Contact Name}},&#10;&#10;Your purchase order for {{row.Total}} has been processed." />
          <DynamicContentPanel value={config.body||''} onChange={function(v) { setConfig('body',v); }} showMeta={true} />
        </div>
      </>)}

      {action.actionType==='webhook' && (<>
        <div><label className={labelCls}>URL</label>
          <input type="text" value={config.url||''} onChange={function(e) { setConfig('url',e.target.value); }} className={inputCls} placeholder="https://..." />
        </div>
        <div><label className={labelCls}>Method</label>
          <select value={config.method||'POST'} onChange={function(e) { setConfig('method',e.target.value); }} className={selectCls}>
            <option value="POST">POST</option><option value="PUT">PUT</option><option value="PATCH">PATCH</option><option value="DELETE">DELETE</option>
          </select>
        </div>
        {config.url && (<div>
          <label className={labelCls}>Retry on failure (5xx errors)</label>
          <select value={config.retryCount||'0'} onChange={function(e) { setConfig('retryCount',e.target.value); }} className={selectCls}>
            <option value="0">No retry</option>
            <option value="1">1 retry</option>
            <option value="2">2 retries</option>
            <option value="3">3 retries (exponential backoff)</option>
          </select>
        </div>)}
      </>)}

      {action.actionType==='notify' && (<>
        <div><label className={labelCls}>Notify Users</label>
          <UserPicker selectedIds={config.userIds||[]} onChange={function(ids) { setConfig('userIds',ids); }} users={users} />
        </div>
        <div><label className={labelCls}>Title</label>
          <input type="text" value={config.title||''} onChange={function(e) { setConfig('title',e.target.value); }} className={inputCls} placeholder="Notification title" />
          <DynamicContentPanel value={config.title||''} onChange={function(v) { setConfig('title',v); }} />
        </div>
        <div><label className={labelCls}>Message</label>
          <input type="text" value={config.message||''} onChange={function(e) { setConfig('message',e.target.value); }} className={inputCls} placeholder="Notification message" />
          <DynamicContentPanel value={config.message||''} onChange={function(v) { setConfig('message',v); }} showMeta={true} />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
          <input type="checkbox" checked={config.sendEmail||false} onChange={function(e) { setConfig('sendEmail',e.target.checked); }} />
          Also send as email notification
        </label>
      </>)}

      {action.actionType==='trigger_approval' && (function() {
        var approvalTableId = config.targetTableId || builderTriggerConfig.tableId || '';
        if (approvalTableId) fetchApprovalWorkflows(approvalTableId);
        var workflows = approvalWorkflows[approvalTableId] || [];
        return (<div className="flex flex-col gap-2.5">
          <div><label className={labelCls}>Table</label>
            <select value={config.targetTableId||''} onChange={function(e) { setConfig('targetTableId',e.target.value); setConfig('workflowId',''); }} className={selectCls}>
              <option value="">— Use trigger table —</option>
              {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
            </select>
          </div>
          <div><label className={labelCls}>Approval Workflow</label>
            {workflows.length === 0 ? (
              <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 rounded-md border border-amber-200 dark:border-amber-500/20">
                <span className="text-[11px] text-amber-700 dark:text-amber-300">No approval workflows found. Install from Marketplace first.</span>
              </div>
            ) : (
              <select value={config.workflowId||''} onChange={function(e) { setConfig('workflowId',e.target.value); }} className={selectCls}>
                <option value="">— Select workflow —</option>
                {workflows.map(function(wf: any) { return <option key={wf.id} value={wf.id}>{wf.name} ({(wf.stages||[]).length} stage{(wf.stages||[]).length!==1?'s':''})</option>; })}
              </select>
            )}
          </div>
          <div className="p-2.5 bg-green-50 dark:bg-green-500/10 rounded-md border border-green-200 dark:border-green-500/20">
            <span className="text-[11px] text-green-700 dark:text-green-300">✅ Submits the row into the approval workflow, locks the row, and notifies approvers.</span>
          </div>
        </div>);
      })()}

      {action.actionType==='unlock_row' && (<div className="p-2.5 bg-green-50 dark:bg-green-500/10 rounded-md border border-green-200 dark:border-green-500/20">
        <span className="text-[11px] text-green-700 dark:text-green-300">🔓 Unlocks the row, allowing it to be edited again.</span>
      </div>)}

	  {action.actionType==='push_to_sharepoint' && (<div className="flex flex-col gap-2.5">
        <div className="p-2.5 bg-sky-50 dark:bg-sky-500/10 rounded-md border border-sky-200 dark:border-sky-500/20">
          <span className="text-[11px] text-sky-700 dark:text-sky-300">Pushes the current row data to the linked SharePoint list. The table must have SharePoint sync configured in the admin panel. Columns marked as "Agora Only" will be excluded from the push.</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={config.includeAttachments||false} onChange={function(e) { setConfig('includeAttachments',e.target.checked); }} />
          Include row attachments (PDFs, images, etc.) - uploads to SharePoint list item
        </label>
        {config.includeAttachments && (
          <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 rounded-md border border-amber-200 dark:border-amber-500/20">
            <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1">One-time SharePoint setup required</div>
            <div className="text-[11px] text-amber-700 dark:text-amber-300 leading-normal">
              Before this can attach files, you (or your SP admin) must add a <strong>Hyperlink</strong> column to the target SharePoint list with the name <code className="bg-orange-50 dark:bg-orange-500/10 px-[5px] py-px rounded-[3px] border border-orange-200 dark:border-orange-500/20 font-mono">SupportDocs</code> (no space, capital S and D).
              <br /><br />
              Agora tries to create this column automatically, but some SharePoint tenants block API-driven column creation. If you see <code className="bg-orange-50 dark:bg-orange-500/10 px-1 py-px rounded-[3px] font-mono">accessDenied</code> in your logs, that's why - create it manually one time in your SharePoint list settings and Agora will populate it on every push.
              <br /><br />
              Files will still be uploaded to the SharePoint document library at <code className="bg-orange-50 dark:bg-orange-500/10 px-1 py-px rounded-[3px] font-mono">Shared Documents/Agora Attachments/</code> either way - the SupportDocs column just adds a clickable link on the list item.
            </div>
          </div>
        )}
      </div>)}

	  {action.actionType==='generate_record_export' && (<div className="flex flex-col gap-2.5">
        <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 rounded-md border border-amber-200 dark:border-amber-500/20">
          <span className="text-[11px] text-amber-700 dark:text-amber-300">📄 Generates a Record Export PDF using the table's template and attaches it to the row. The table must have a Record Export template configured.</span>
        </div>
        <div><label className={labelCls}>After attaching, update column (optional)</label>
          <select value={config.updateColumnId||''} onChange={function(e) { setConfig('updateColumnId',e.target.value); }} className={selectCls}>
            <option value="">— None —</option>
            {targetColumns.map(function(c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
          </select>
        </div>
        {config.updateColumnId && (<div><label className={labelCls}>Set value to</label>
          <input type="text" value={config.updateValue||''} onChange={function(e) { setConfig('updateValue',e.target.value); }} className={inputCls} placeholder="e.g. true or Exported" />
        </div>)}
      </div>)}
      {action.actionType==='generate_audit_trail' && (<div className="flex flex-col gap-2.5">
        <div className="p-2.5 bg-purple-50 dark:bg-purple-500/10 rounded-md border border-purple-200 dark:border-purple-500/20">
          <span className="text-[11px] text-purple-700 dark:text-purple-300">🔏 Generates a standalone Audit Trail PDF with the approval chain and SHA-256 ledger, then attaches it to the row. Requires an approved approval request on this row.</span>
        </div>
        <div><label className={labelCls}>After attaching, update column (optional)</label>
          <select value={config.updateColumnId||''} onChange={function(e) { setConfig('updateColumnId',e.target.value); }} className={selectCls}>
            <option value="">— None —</option>
            {targetColumns.map(function(c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
          </select>
        </div>
        {config.updateColumnId && (<div><label className={labelCls}>Set value to</label>
          <input type="text" value={config.updateValue||''} onChange={function(e) { setConfig('updateValue',e.target.value); }} className={inputCls} placeholder="e.g. true or Audit Attached" />
        </div>)}
      </div>)}
      {action.actionType==='push_to_google_sheets' && (<div className="flex flex-col gap-2.5">
        <div className="p-2.5 bg-green-50 dark:bg-green-500/10 rounded-md border border-green-200 dark:border-green-500/20">
          <span className="text-[11px] text-green-700 dark:text-green-300">📗 Pushes the current row data to the connected Google Sheet. The table must have a Google Sheet connection configured. Columns marked as "Agora Only" will be excluded.</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={config.includeAttachments||false} onChange={function(e) { setConfig('includeAttachments',e.target.checked); }} />
          📎 Include attachments — merges PDFs, uploads to Google Drive, adds hyperlink in sheet
        </label>
      </div>)}

      {action.actionType==='delay' && (<div className="flex flex-col gap-2.5">
        <div className="flex gap-2.5 items-end">
          <div className="flex-1"><label className={labelCls}>Hours</label>
            <input type="number" min="0" max="24" value={config.delayHours||'0'} onChange={function(e) { setConfig('delayHours',e.target.value); }} className={inputCls} />
          </div>
          <div className="flex-1"><label className={labelCls}>Minutes</label>
            <input type="number" min="0" max="59" value={config.delayMinutes||'0'} onChange={function(e) { setConfig('delayMinutes',e.target.value); }} className={inputCls} />
          </div>
          <div className="flex-1"><label className={labelCls}>Seconds</label>
            <input type="number" min="0" max="59" value={config.delaySeconds||'0'} onChange={function(e) { setConfig('delaySeconds',e.target.value); }} className={inputCls} />
          </div>
        </div>
        <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 rounded-md border border-amber-200 dark:border-amber-500/20">
          <span className="text-[11px] text-amber-700 dark:text-amber-300">⏳ Pauses before the next step. Maximum 1 hour.</span>
        </div>
      </div>)}

      {action.actionType==='condition' && (<div className="flex flex-col gap-2.5">
        <div><label className={labelCls}>IF Condition</label>
          <input type="text" value={config.conditionExpr||''} onChange={function(e) { setConfig('conditionExpr',e.target.value); }} className={inputCls} placeholder="e.g. {{row.Total}} > 500" />
          <DynamicContentPanel value={config.conditionExpr||''} onChange={function(v) { setConfig('conditionExpr',v); }} showMeta={true} />
        </div>
        <div className="p-2.5 bg-purple-50 dark:bg-purple-500/10 rounded-md border border-purple-200 dark:border-purple-500/20">
          <span className="text-[11px] text-purple-700 dark:text-purple-300">🔀 Steps after this run on the TRUE or FALSE branch. Set the condition on each step.</span>
        </div>
      </div>)}

      <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
        <label className={labelCls + " text-gray-400 dark:text-gray-500 text-[10px]"}>Step condition (leave blank to always run)</label>
        <input type="text" value={action.conditionExpr||''} onChange={function(e) { updateAction(index,{conditionExpr:e.target.value}); }} className={inputCls + " bg-gray-50 dark:bg-gray-800 text-xs"} placeholder="e.g. {{row.Status}} == 'Approved'" />
      </div>
    </div>);
  }
  if (loading) return <div className="p-10 text-center text-gray-400 dark:text-gray-500">Loading automations...</div>;

  // ==== LIST ====
  if (view==='list') {
    return (<div className="max-w-[960px] mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <div><h1 className="text-[22px] font-bold text-gray-900 dark:text-gray-100 m-0">⚡ Automations</h1><p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1 mb-0">Automate workflows across your tables</p></div>
        <div className="flex gap-2 items-center">
          <button onClick={function() { setView('analytics'); }} className={btnSecondaryCls}>Analytics</button>
          <button onClick={function() { openBuilder(); }} className={btnPrimaryCls}>+ New Automation</button>
        </div>
      </div>
      {automations.length===0 ? (
        <div className={cardCls + " text-center px-6 py-[60px] text-gray-500 dark:text-gray-400"}>
          <div className="text-[32px] mb-3">⚡</div>
          <p className="text-[15px] font-medium text-gray-700 dark:text-gray-300">No automations yet</p>
          <p className="text-[13px] mt-1">Create your first automation to start automating workflows.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {automations.map(function(auto) { return (
            <div key={auto.id} className={cardCls + " flex justify-between items-center cursor-pointer"} onClick={function() { loadDetail(auto.id); }}>
              <div className="flex-1">
                <div className="flex items-center gap-2.5">
                  <span className={"text-sm font-semibold " + (auto.enabled ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500")}>{auto.name}</span>
                  {!auto.enabled && <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-semibold">Disabled</span>}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex gap-4 flex-wrap">
                  <span>{getTriggerLabel(auto.triggerType)}</span>
                  <span>{auto.actions.length} action{auto.actions.length!==1?'s':''}</span>
                  {auto._count && <span>{auto._count.runs} run{auto._count.runs!==1?'s':''}</span>}
                  {auto.creatorName && <span className="text-gray-400 dark:text-gray-500">by {auto.creatorName}</span>}
                  {auto.workspaceName && <span className="px-1.5 py-px bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 rounded text-[10px] font-semibold">{auto.workspaceIcon || '📁'} {auto.workspaceName}</span>}
                  {auto.sharedTableName && <span className="px-1.5 py-px bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 rounded text-[10px] font-semibold">{auto.sharedTableIcon || '📊'} {auto.sharedTableName}</span>}
                  {auto.isOwner === false && <span className="px-1.5 py-px bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 rounded text-[10px] font-semibold">Shared</span>}
                </div>
              </div>
              <div className="flex gap-1.5 items-center">
                <button onClick={function(e) { e.stopPropagation(); toggleEnabled(auto.id,auto.enabled); }} className={iconBtnCls + " text-lg " + (auto.enabled ? "text-green-500" : "text-gray-300 dark:text-gray-600")} title={auto.enabled?'Disable':'Enable'}>{auto.enabled?'●':'○'}</button>
                <button onClick={function(e) { e.stopPropagation(); duplicateAutomation(auto); }} className={iconBtnCls} title="Duplicate">⧉</button>
                <button onClick={function(e) { e.stopPropagation(); openBuilder(auto); }} className={iconBtnCls} title="Edit">✎</button>
                <button onClick={function(e) { e.stopPropagation(); deleteAutomation(auto.id); }} className={iconBtnCls + " text-red-500"} title="Delete">✕</button>
              </div>
            </div>); })}
        </div>
      )}
    </div>);
  }

  // ==== ANALYTICS ====
  if (view==='analytics') {
    return (<div className="max-w-5xl mx-auto p-6">
      <button onClick={function() { setView('list'); }} className={btnSecondaryCls + " mb-4"}>← Back to list</button>
      <AutomationAnalytics />
    </div>);
  }

  // ==== BUILDER ====
  if (view==='builder') {
    return (<div className="max-w-[720px] mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 m-0">{editingId?'Edit Automation':'New Automation'}</h1>
        <button onClick={function() { setView('list'); }} className={btnSecondaryCls}>← Back to list</button>
      </div>

      <div className={cardCls + " mb-4"}>
        <div className="mb-3"><label className={labelCls}>Name</label><input type="text" value={builderName} onChange={function(e) { setBuilderName(e.target.value); }} className={inputCls} placeholder="e.g. Notify on approval" /></div>
        <div><label className={labelCls}>Description (optional)</label><input type="text" value={builderDesc} onChange={function(e) { setBuilderDesc(e.target.value); }} className={inputCls} placeholder="What does this automation do?" /></div>
        <div className="mt-3"><label className={labelCls}>Share with</label>
          <div className="flex flex-col gap-2">
            <div>
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Workspace</span>
              {workspaces.length > 0 ? (
                <select value={builderWorkspaceId||''} onChange={function(e) { setBuilderWorkspaceId(e.target.value||null); }} className={selectCls}>
                  <option value="">None</option>
                  {workspaces.map(function(ws) { return <option key={ws.id} value={ws.id}>{ws.icon || '📁'} {ws.name}</option>; })}
                </select>
              ) : (
                <div className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 text-[11px] text-gray-400 dark:text-gray-500">No workspaces — create one from the sidebar</div>
              )}
            </div>
            <div>
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Table</span>
              <select value={builderTableId||''} onChange={function(e) { setBuilderTableId(e.target.value||null); }} className={selectCls}>
                <option value="">None</option>
                {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
              </select>
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 block">
              {builderWorkspaceId && builderTableId ? 'Shared with workspace members and table members.' : builderWorkspaceId ? 'All workspace members can see this. Admins can edit.' : builderTableId ? 'Anyone with access to this table can see this automation.' : 'Private — only you and system admins.'}
            </span>
          </div>
        </div>
      </div>

      <div className={cardCls + " mb-4"}>
        <div className="flex items-center gap-2 mb-3"><span className="text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest">TRIGGER</span><span className="text-[11px] text-gray-400 dark:text-gray-500">When this happens...</span></div>
        <div className="grid gap-2 mb-4" style={{ gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {TRIGGER_TYPES.map(function(t) { var sel=builderTrigger===t.value; return (
            <button key={t.value} onClick={function() { setBuilderTrigger(t.value); setBuilderTriggerConfig({}); }}
              className={"rounded-lg px-3 py-2.5 cursor-pointer text-left text-xs border " + (sel ? "bg-blue-50 dark:bg-blue-500/15 border-blue-600 text-blue-700 dark:text-blue-300 font-semibold" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-normal")}>
              <span className="text-base">{t.icon}</span><div className="mt-1">{t.label}</div>
            </button>); })}
        </div>
        <TriggerConfigEditor />
      </div>

      <div className="text-center my-1"><div className="w-0.5 h-6 bg-gray-300 dark:bg-gray-600 mx-auto" /><span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">then</span><div className="w-0.5 h-6 bg-gray-300 dark:bg-gray-600 mx-auto" /></div>

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3"><span className="text-green-600 dark:text-green-400 font-bold text-xs uppercase tracking-widest">ACTIONS</span><span className="text-[11px] text-gray-400 dark:text-gray-500">Do these things...</span></div>
        {builderActions.map(function(action,idx) { return (<div key={idx}>
          <div className={cardCls + " mb-2"}>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400 text-[11px] font-semibold">Step {idx+1}</span>
                <select value={action.actionType} onChange={function(e) { updateAction(idx,{actionType:e.target.value,actionConfig:{}}); }} className={selectCls + " w-auto px-2 py-1 text-xs"}>
                  {ACTION_TYPES.map(function(a) { return <option key={a.value} value={a.value}>{a.icon} {a.label}</option>; })}
                </select>
              </div>
              <div className="flex gap-1">
                <button onClick={function() { moveAction(idx,-1); }} className={iconBtnCls}>↑</button>
                <button onClick={function() { moveAction(idx,1); }} className={iconBtnCls}>↓</button>
                <button onClick={function() { removeAction(idx); }} className={iconBtnCls + " text-red-500"}>✕</button>
              </div>
            </div>
            {renderActionConfig(action, idx)}
          </div>
          {idx<builderActions.length-1 && <div className="text-center my-0.5"><div className="w-0.5 h-4 bg-gray-300 dark:bg-gray-600 mx-auto" /></div>}
        </div>); })}
        <button onClick={addAction} className={addBtnCls + " mt-2 p-3"}>+ Add Action Step</button>
      </div>

      <div className={cardCls + " mb-4"}>
        <div className="flex items-center gap-2 mb-3"><span className="text-orange-600 dark:text-orange-400 font-bold text-xs uppercase tracking-widest">RETRY ON FAILURE</span></div>
        <div className="flex gap-2.5 items-end">
          <div className="flex-1"><label className={labelCls}>Max retries</label>
            <input type="number" min="0" max="10" value={builderMaxRetries} onChange={function(e) { setBuilderMaxRetries(parseInt(e.target.value)||0); }} className={inputCls} />
          </div>
          <div className="flex-1"><label className={labelCls}>Retry delay (seconds)</label>
            <input type="number" min="0" max="300" value={builderRetryDelaySec} onChange={function(e) { setBuilderRetryDelaySec(parseInt(e.target.value)||0); }} className={inputCls} />
          </div>
        </div>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 block mt-2">A failed step is retried this many times with linear backoff before the run fails.</span>
      </div>

      <div className="flex gap-3 justify-end mt-6">
        <button onClick={function() { setView('list'); }} className={btnSecondaryCls}>Cancel</button>
        <button onClick={saveAutomation} disabled={saving} className={btnPrimaryCls + (saving ? " opacity-70" : "")}>{saving?'Saving...':(editingId?'Save Changes':'Create Automation')}</button>
      </div>
    </div>);
  }

  // ==== DETAIL ====
  if (view==='detail' && selectedAutomation) {
    var auto = selectedAutomation;
    return (<div className="max-w-[720px] mx-auto px-6 py-8">
      <button onClick={function() { setView('list'); setSelectedAutomation(null); }} className={btnSecondaryCls + " mb-4"}>← Back to list</button>

      <div className={cardCls + " mb-4"}>
        <div className="flex justify-between items-center">
          <div><h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 m-0">{auto.name}</h2>{auto.description && <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1 mb-0">{auto.description}</p>}</div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={function() { openBuilder(auto); }} className={btnSecondaryCls}>Edit</button>
            <button onClick={function() { duplicateAutomation(auto); }} className={btnSecondaryCls}>Duplicate</button>
            <button onClick={function() { testAutomation(auto.id); }} disabled={testing} className={btnSecondaryCls + " text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-500/40"}>{testing?"Testing...":"Test Run"}</button>
            <button onClick={function() { toggleEnabled(auto.id,auto.enabled); }} className={btnSecondaryCls + " " + (auto.enabled ? "bg-green-100 dark:bg-green-500/15 border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-300" : "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400")}>{auto.enabled?'Enabled':'Disabled'}</button>
          </div>
        </div>
        <div className="mt-4 flex gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
          <span>{getTriggerLabel(auto.triggerType)}</span>
          {auto.triggerConfig && (auto.triggerConfig as any).tableId && <span>Table: {getTableName((auto.triggerConfig as any).tableId)}</span>}
          <span>{auto.actions.length} action{auto.actions.length!==1?'s':''}</span>
          {auto.webhookSlug && <span className="text-purple-600 dark:text-purple-400 font-mono text-[11px]">/api/automations/webhook/{auto.webhookSlug}</span>}
        </div>
      </div>

      {/* Flow */}
      <div className={cardCls + " mb-4"}>
        <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Flow</div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-md px-3 py-1.5 text-xs text-blue-700 dark:text-blue-300 font-medium">{getTriggerLabel(auto.triggerType)}</span>
          {auto.actions.map(function(a:any,i:number) { var at=a.actionType||a.actiontype; return (<span key={i} className="flex items-center gap-2"><span className="text-gray-300 dark:text-gray-600">→</span><span className="bg-green-100 dark:bg-green-500/15 border border-green-300 dark:border-green-500/20 rounded-md px-3 py-1.5 text-xs text-green-700 dark:text-green-300 font-medium">{getActionLabel(at)}</span></span>); })}
        </div>
      </div>

      {/* Test Results */}
      {testResult && (<div className={cardCls + " mb-4 " + (testResult.error ? "border-red-300 dark:border-red-500/30" : "border-green-300 dark:border-green-500/30")}>
        <div className="flex justify-between items-center mb-3">
          <div className={"text-[11px] font-semibold uppercase tracking-widest " + (testResult.error ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300")}>{testResult.error ? 'Test Failed' : 'Test Results (Dry Run)'}</div>
          <button onClick={function() { setTestResult(null); }} className={iconBtnCls + " text-xs"}>✕ Close</button>
        </div>
        {testResult.error ? (<p className="text-[13px] text-red-600 dark:text-red-400">{testResult.error}</p>) : (<div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{testResult.note}</p>
          {testResult.steps && testResult.steps.map(function(step:any) { return (<div key={step.stepNumber} className="p-2.5 mb-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Step {step.stepNumber}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{getActionLabel(step.actionType)}</span>
              {!step.conditionMet && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400">Would be skipped</span>}
              {step.conditionMet && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-500/15 rounded text-green-700 dark:text-green-300">Would execute</span>}
            </div>
            {step.conditionExpr && <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">Condition: {step.conditionResolved} = {step.conditionMet ? 'true' : 'false'}</div>}
            {step.resolvedValues && Object.keys(step.resolvedValues).length > 0 && (<pre className="text-[11px] text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-2 rounded overflow-auto m-0 whitespace-pre-wrap">{JSON.stringify(step.resolvedValues, null, 2)}</pre>)}
          </div>); })}
        </div>)}
      </div>)}

      {/* Analytics */}
      <div className={cardCls + " mb-4"}>
        <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Analytics</div>
        <AutomationAnalytics automationId={auto.id} />
      </div>

      {/* Run History */}
      <div className={cardCls}>
        <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Run History</div>
        <RunHistoryPanel automationId={auto.id} canRerun={auto.isOwner !== false} />
      </div>
    </div>);
  }

  return null;
}
