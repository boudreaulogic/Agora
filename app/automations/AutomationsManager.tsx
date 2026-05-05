// ============================================================
// app/automations/AutomationsManager.tsx
// Full automation management UI — with sidebar, user picker,
// duplicate, test run, run detail, error display
// ============================================================

'use client';

import { useState, useEffect, useCallback } from 'react';

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

// ---- Styles ----
var inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#111827', fontSize: '13px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };
var selectStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#111827', fontSize: '13px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, cursor: 'pointer' };
var labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' };
var iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '14px', padding: '4px' };
var addBtnStyle: React.CSSProperties = { background: 'none', border: '1px dashed #d1d5db', borderRadius: '6px', color: '#9ca3af', cursor: 'pointer', fontSize: '12px', padding: '6px 12px', width: '100%' };
var cardStyle: React.CSSProperties = { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' };
var btnPrimary: React.CSSProperties = { background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' };
var btnSecondary: React.CSSProperties = { background: 'none', border: '1px solid #d1d5db', borderRadius: '8px', color: '#6b7280', padding: '8px 16px', fontSize: '12px', cursor: 'pointer' };

// ---- Dynamic Value Fallback ----
function DynamicFallback({ value, onChange, triggerColumns, label }: { value: string; onChange: (val: string) => void; triggerColumns: ColumnInfo[]; label: string }) {
  var [isOpen, setIsOpen] = useState(false);
  if (triggerColumns.length === 0) return null;
  return (<div>
    <button onClick={function() { setIsOpen(!isOpen); }} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '11px', cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontSize: '10px' }}>{isOpen ? '▼' : '▶'}</span> {label}
    </button>
    {isOpen && (<div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '4px', padding: '8px', background: '#f5f3ff', border: '1px solid #e0e7ff', borderRadius: '6px', marginTop: '4px' }}>
      {triggerColumns.filter(function(c) { return READ_ONLY_TYPES.indexOf(c.type) === -1; }).map(function(col) {
        return (<button key={col.id} onClick={function() { onChange(value ? value + '{{row.' + col.name + '}}' : '{{row.' + col.name + '}}'); setIsOpen(false); }}
          style={{ background: '#ffffff', border: '1px solid #c7d2fe', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', color: '#4338ca', cursor: 'pointer', fontFamily: 'monospace' }}>
          {col.name}
        </button>);
      })}
      <span style={{ fontSize: '10px', color: '#9ca3af', width: '100%', marginTop: '4px' }}>Click to insert value from triggering row</span>
    </div>)}
  </div>);
}

// ---- Dynamic Value Input ----
function DynamicValueInput({ column, value, onChange, triggerColumns }: { column: ColumnInfo; value: string; onChange: (val: string) => void; triggerColumns: ColumnInfo[] }) {
  var colType = column.type;
  var settings = column.settings || {};

  if (colType === 'select' && settings.options) {
    return (<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <select value={value || ''} onChange={function(e) { onChange(e.target.value); }} style={selectStyle}>
        <option value="">— Pick an option —</option>
        {settings.options.map(function(opt: any) { return <option key={opt.value} value={opt.value}>{opt.label}</option>; })}
      </select>
      <DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" />
    </div>);
  }
  if (colType === 'multi_select' && settings.options) {
    var currentVals = value ? value.split(',') : [];
    return (<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px', padding: '8px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px' }}>
        {settings.options.map(function(opt: any) { var checked = currentVals.indexOf(opt.value) !== -1;
          return (<label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', background: checked ? '#dbeafe' : '#f3f4f6' }}>
            <input type="checkbox" checked={checked} onChange={function() { var nv = checked ? currentVals.filter(function(v) { return v !== opt.value; }) : currentVals.concat([opt.value]); onChange(nv.join(',')); }} /> {opt.label}
          </label>); })}
      </div>
      <DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" />
    </div>);
  }
  if (colType === 'checkbox') {
    return (<label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
      <input type="checkbox" checked={value === 'true'} onChange={function(e) { onChange(e.target.checked ? 'true' : 'false'); }} />
      {value === 'true' ? '☑️ Checked' : '☐ Unchecked'}
    </label>);
  }
  if (colType === 'rating') {
    return (<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {[0,1,2,3,4,5].map(function(n) { var active = parseInt(value||'0') >= n && n > 0;
        return (<button key={n} onClick={function() { onChange(String(n)); }} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', opacity: n===0?0.4:1, padding:'2px' }}>{n===0?'✕':(active?'⭐':'☆')}</button>); })}
      <span style={{ fontSize:'11px', color:'#9ca3af', marginLeft:'8px' }}>{value ? value+'/5' : 'No rating'}</span>
    </div>);
  }
  if (colType === 'progress') {
    return (<div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
      <input type="range" min="0" max="100" value={value||'0'} onChange={function(e) { onChange(e.target.value); }} style={{ flex:1 }} />
      <span style={{ fontSize:'12px', color:'#374151', fontWeight:500, minWidth:'36px' }}>{value||'0'}%</span>
    </div>);
  }
  if (colType === 'number') { return (<div style={{ display:'flex', flexDirection:'column', gap:'4px' }}><input type="number" value={value||''} onChange={function(e) { onChange(e.target.value); }} style={inputStyle} placeholder="Enter number" /><DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" /></div>); }
  if (colType === 'currency') { return (<div style={{ display:'flex', flexDirection:'column', gap:'4px' }}><div style={{ display:'flex', alignItems:'center', gap:'4px' }}><span style={{ fontSize:'14px', color:'#374151', fontWeight:600 }}>$</span><input type="number" step="0.01" value={value||''} onChange={function(e) { onChange(e.target.value); }} style={Object.assign({},inputStyle,{flex:1})} placeholder="0.00" /></div><DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" /></div>); }
  if (colType === 'percent') { return (<div style={{ display:'flex', flexDirection:'column', gap:'4px' }}><div style={{ display:'flex', alignItems:'center', gap:'4px' }}><input type="number" min="0" max="100" value={value||''} onChange={function(e) { onChange(e.target.value); }} style={Object.assign({},inputStyle,{flex:1})} placeholder="0" /><span style={{ fontSize:'14px', color:'#374151', fontWeight:600 }}>%</span></div><DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" /></div>); }
  if (colType === 'date') { return (<div style={{ display:'flex', flexDirection:'column', gap:'4px' }}><input type="date" value={value||''} onChange={function(e) { onChange(e.target.value); }} style={inputStyle} /><DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" /></div>); }
  if (colType === 'datetime') { return (<div style={{ display:'flex', flexDirection:'column', gap:'4px' }}><input type="datetime-local" value={value||''} onChange={function(e) { onChange(e.target.value); }} style={inputStyle} /><DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or use dynamic value" /></div>); }
  if (colType === 'color') { return (<div style={{ display:'flex', alignItems:'center', gap:'8px' }}><input type="color" value={value||'#3B82F6'} onChange={function(e) { onChange(e.target.value); }} style={{ width:'40px', height:'32px', border:'1px solid #d1d5db', borderRadius:'6px', cursor:'pointer' }} /><span style={{ fontSize:'12px', color:'#6b7280' }}>{value||'#3B82F6'}</span></div>); }
  // Text fallback
  return (<div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
    {colType === 'long_text' ? <textarea value={value||''} onChange={function(e) { onChange(e.target.value); }} style={Object.assign({},inputStyle,{minHeight:'60px',resize:'vertical' as const})} placeholder="Enter text" />
    : <input type="text" value={value||''} onChange={function(e) { onChange(e.target.value); }} style={inputStyle} placeholder={colType==='email'?'email@example.com':colType==='url'?'https://...':colType==='phone'?'(555) 555-5555':'Enter value'} />}
    <DynamicFallback value={value} onChange={onChange} triggerColumns={triggerColumns} label="Or insert dynamic value" />
  </div>);
}

// ---- User Picker for Notify ----
function UserPicker({ selectedIds, onChange, users }: { selectedIds: string[]; onChange: (ids: string[]) => void; users: UserInfo[] }) {
  return (<div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
    {selectedIds.length > 0 && (<div style={{ display:'flex', flexWrap:'wrap' as const, gap:'4px' }}>
      {selectedIds.map(function(uid) {
        var user = users.find(function(u) { return u.id === uid; });
        return (<span key={uid} style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'3px 8px', background:'#dbeafe', borderRadius:'12px', fontSize:'11px', color:'#1e40af' }}>
          {user ? (user.name || user.email) : uid}
          <button onClick={function() { onChange(selectedIds.filter(function(id) { return id !== uid; })); }} style={{ background:'none', border:'none', cursor:'pointer', color:'#3b82f6', fontSize:'12px', padding:0 }}>✕</button>
        </span>);
      })}
    </div>)}
    <select value="" onChange={function(e) { if (e.target.value && selectedIds.indexOf(e.target.value) === -1) { onChange(selectedIds.concat([e.target.value])); } }} style={selectStyle}>
      <option value="">— Add user —</option>
      {users.filter(function(u) { return selectedIds.indexOf(u.id) === -1; }).map(function(u) {
        return <option key={u.id} value={u.id}>{u.name ? u.name + ' (' + u.email + ')' : u.email}</option>;
      })}
    </select>
  </div>);
}

// ---- Status Badge ----
function StatusBadge({ status }: { status: string }) {
  var cm: Record<string,{bg:string;fg:string}> = { success:{bg:'#dcfce7',fg:'#166534'}, failed:{bg:'#fee2e2',fg:'#991b1b'}, running:{bg:'#dbeafe',fg:'#1e40af'}, pending:{bg:'#f3f4f6',fg:'#374151'}, skipped:{bg:'#f3f4f6',fg:'#6b7280'} };
  var c = cm[status] || cm.pending;
  return <span style={{ padding:'2px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase' as const, background:c.bg, color:c.fg }}>{status}</span>;
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
  var [view, setView] = useState<'list'|'builder'|'detail'>('list');
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
  var [expandedRunId, setExpandedRunId] = useState<string|null>(null);
  var [testing, setTesting] = useState(false);
  var [testResult, setTestResult] = useState<any>(null);
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
    } else { setEditingId(null); setBuilderName(''); setBuilderDesc(''); setBuilderTrigger('row_created'); setBuilderTriggerConfig({}); setBuilderActions([]); setBuilderWorkspaceId(null); setBuilderTableId(null); }
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
      var r = await fetch(url, { method:editingId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:builderName, description:builderDesc||null, triggerType:builderTrigger, triggerConfig:builderTriggerConfig, actions:builderActions, workspaceId:builderWorkspaceId, tableId:builderTableId }) });
      if (r.ok) { await fetchAutomations(); setView('list'); } else { var e = await r.json(); alert('Error: '+(e.error||'Unknown')); }
    } catch(e) { console.error(e); } finally { setSaving(false); }
  }

  // ---- Trigger Config ----
  function TriggerConfigEditor() {
    var needsTable = ['row_created','row_updated','row_deleted','column_match','form_submit'].indexOf(builderTrigger)!==-1;
    return (<div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
      {needsTable && (<div><label style={labelStyle}>Table</label>
        <select value={builderTriggerConfig.tableId||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{tableId:e.target.value}); }); }} style={selectStyle}>
          <option value="">— Select table —</option>
          {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
        </select></div>)}
      {builderTrigger==='column_match' && builderTriggerConfig.tableId && (<>
        <div><label style={labelStyle}>Column</label>
          <select value={builderTriggerConfig.column||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{column:e.target.value,value:''}); }); }} style={selectStyle}>
            <option value="">— Select column —</option>
            {getSettableColumns(builderTriggerConfig.tableId).map(function(c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
          </select></div>
        {builderTriggerConfig.column && (function() {
          var col = getTableColumns(builderTriggerConfig.tableId).find(function(c) { return c.id === builderTriggerConfig.column; });
          if (!col) return <div><label style={labelStyle}>Equals Value</label><input type="text" value={builderTriggerConfig.value||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{value:e.target.value}); }); }} style={inputStyle} /></div>;
          return <div><label style={labelStyle}>Equals Value</label><DynamicValueInput column={col} value={builderTriggerConfig.value||''} onChange={function(v) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{value:v}); }); }} triggerColumns={[]} /></div>;
        })()}
      </>)}
      {builderTrigger==="form_submit" && builderTriggerConfig.tableId && (function() {
        fetchFormsForTable(builderTriggerConfig.tableId);
        var tableForms = forms[builderTriggerConfig.tableId] || [];
        return (<div><label style={labelStyle}>Form</label>
          <select value={builderTriggerConfig.formId||""} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{formId:e.target.value}); }); }} style={selectStyle}>
            <option value="">— Any form on this table —</option>
            {tableForms.map(function(f:any) { return <option key={f.id} value={f.id}>{f.name}</option>; })}
          </select>
          {tableForms.length===0 && <span style={{ fontSize:"11px", color:"#9ca3af", marginTop:"4px", display:"block" }}>No forms found for this table</span>}
        </div>);
      })()}
      {builderTrigger==='scheduled' && (<div><label style={labelStyle}>Schedule</label>
        <select value={CRON_PRESETS.find(function(p) { return p.value===builderTriggerConfig.cron; }) ? builderTriggerConfig.cron : 'custom'} onChange={function(e) { if(e.target.value!=='custom') setBuilderTriggerConfig(function(p) { return Object.assign({},p,{cron:e.target.value}); }); }} style={selectStyle}>
          {CRON_PRESETS.map(function(p) { return <option key={p.value} value={p.value}>{p.label}</option>; })}
          <option value="custom">Custom...</option>
        </select>
        <input type="text" value={builderTriggerConfig.cron||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{cron:e.target.value}); }); }} style={Object.assign({},inputStyle,{marginTop:'8px'})} placeholder="*/5 * * * *" />
      </div>)}
      {builderTrigger==='webhook' && (<div style={{ padding:'12px', background:'#eff6ff', borderRadius:'8px', border:'1px solid #bfdbfe' }}>
        <span style={{ fontSize:'12px', color:'#1e40af' }}>A unique webhook URL will be generated when saved.</span>
      </div>)}
	  {builderTrigger==='manual' && (<div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
        <div><label style={labelStyle}>Table</label>
          <select value={builderTriggerConfig.tableId||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{tableId:e.target.value}); }); }} style={selectStyle}>
            <option value="">— Select table —</option>
            {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
          </select>
        </div>
        <div style={{ padding:'12px', background:'#fefce8', borderRadius:'8px', border:'1px solid #fde68a' }}>
          <span style={{ fontSize:'12px', color:'#92400e' }}>👆 This automation will appear in the "Run Action" menu when users select rows in the table. It will not run automatically.</span>
        </div>
      </div>)}
      {(builderTrigger==='approval_completed' || builderTrigger==='approval_denied') && (<div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
        <div><label style={labelStyle}>Table</label>
          <select value={builderTriggerConfig.tableId||''} onChange={function(e) { setBuilderTriggerConfig(function(p) { return Object.assign({},p,{tableId:e.target.value}); }); }} style={selectStyle}>
            <option value="">— Select table —</option>
            {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
          </select>
        </div>
        <div style={{ padding:'12px', background: builderTrigger==='approval_completed' ? '#f0fdf4' : '#fef2f2', borderRadius:'8px', border: builderTrigger==='approval_completed' ? '1px solid #bbf7d0' : '1px solid #fecaca' }}>
          <span style={{ fontSize:'12px', color: builderTrigger==='approval_completed' ? '#166534' : '#991b1b' }}>
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
      return (<div style={{ padding:'10px', background:'#f8f7ff', border:'1px solid #e0e7ff', borderRadius:'8px', marginTop:'6px' }}>
        <div style={{ fontSize:'10px', fontWeight:700, color:'#6b7280', textTransform:'uppercase' as const, letterSpacing:'0.5px', marginBottom:'6px' }}>INSERT DYNAMIC CONTENT</div>
        {triggerCols.length > 0 && (<div style={{ display:'flex', flexWrap:'wrap' as const, gap:'4px', marginBottom:'8px' }}>
          {triggerCols.filter(function(c) { return READ_ONLY_TYPES.indexOf(c.type) === -1; }).map(function(col) {
            return (<button key={col.id} onClick={function() { onChange(value + '{{row.' + col.name + '}}'); }}
              style={{ background:'#ffffff', border:'1px solid #c7d2fe', borderRadius:'4px', padding:'3px 8px', fontSize:'11px', color:'#4338ca', cursor:'pointer', fontFamily:'monospace' }}>
              {col.name}
            </button>);
          })}
        </div>)}
        {showMeta && (<>
          <div style={{ fontSize:'9px', fontWeight:600, color:'#9ca3af', textTransform:'uppercase' as const, marginBottom:'4px', marginTop:'4px' }}>Metadata</div>
          <div style={{ display:'flex', flexWrap:'wrap' as const, gap:'4px', marginBottom:'4px' }}>
            {[
              { label:'Date', val:'{{meta.date}}' },
              { label:'Time', val:'{{meta.time}}' },
              { label:'Timestamp', val:'{{meta.timestamp}}' },
              { label:'Row ID', val:'{{meta.rowId}}' },
              { label:'Table ID', val:'{{meta.tableId}}' },
              { label:'Automation', val:'{{meta.automationName}}' },
            ].map(function(m) {
              return (<button key={m.val} onClick={function() { onChange(value + m.val); }}
                style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'4px', padding:'3px 8px', fontSize:'10px', color:'#166534', cursor:'pointer', fontFamily:'monospace' }}>
                {m.label}
              </button>);
            })}
          </div>
        </>)}
        {(builderTrigger === 'approval_completed' || builderTrigger === 'approval_denied') && (<>
          <div style={{ fontSize:'9px', fontWeight:600, color:'#9ca3af', textTransform:'uppercase' as const, marginBottom:'4px', marginTop:'4px' }}>Approval Data</div>
          <div style={{ display:'flex', flexWrap:'wrap' as const, gap:'4px' }}>
            {[
              { label:'Workflow Name', val:'{{approval.workflowName}}' },
              { label:'Request ID', val:'{{approval.requestId}}' },
              { label:'Approved/Denied By', val: builderTrigger === 'approval_completed' ? '{{approval.approvedBy}}' : '{{approval.deniedBy}}' },
              { label:'Workflow ID', val:'{{approval.workflowId}}' },
            ].concat(builderTrigger === 'approval_denied' ? [{ label:'Reason', val:'{{approval.reason}}' }] : []).map(function(m) {
              return (<button key={m.val} onClick={function() { onChange(value + m.val); }}
                style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'4px', padding:'3px 8px', fontSize:'10px', color:'#991b1b', cursor:'pointer', fontFamily:'monospace' }}>
                {m.label}
              </button>);
            })}
          </div>
        </>)}
        {triggerCols.length > 0 && (<div style={{ fontSize:'9px', fontWeight:600, color:'#9ca3af', textTransform:'uppercase' as const, marginBottom:'4px', marginTop:'8px' }}>Operators</div>)}
        {triggerCols.length > 0 && (<div style={{ display:'flex', flexWrap:'wrap' as const, gap:'4px' }}>
          {['==','!=','>','<','>=','<=','contains','startsWith','isEmpty'].map(function(op) {
            return (<button key={op} onClick={function() { onChange(value + ' ' + op + ' '); }}
              style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:'4px', padding:'2px 8px', fontSize:'10px', color:'#c2410c', cursor:'pointer', fontFamily:'monospace' }}>
              {op}
            </button>);
          })}
        </div>)}
      </div>);
    }
 
    return (<div style={{ display:'flex', flexDirection:'column', gap:'10px', marginTop:'8px' }}>
      {['update_field','create_row','lock_row','unlock_row'].indexOf(action.actionType)!==-1 && (<div><label style={labelStyle}>Target Table</label>
        <select value={config.targetTableId||''} onChange={function(e) { setConfig('targetTableId',e.target.value); }} style={selectStyle}>
          <option value="">— Select table —</option>
          {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
        </select></div>)}
 
      {['update_field','create_row'].indexOf(action.actionType)!==-1 && (<div><label style={labelStyle}>Set Field Values</label>
        {(config.fieldMappings||[]).map(function(mapping:any, fi:number) {
          var selectedCol = targetColumns.find(function(c) { return c.name===mapping.column; });
          return (<div key={fi} style={{ marginBottom:'10px', padding:'10px', background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:'8px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
              <select value={mapping.column||''} onChange={function(e) { var m=(config.fieldMappings||[]).slice(); m[fi]={column:e.target.value,value:''}; setConfig('fieldMappings',m); }} style={Object.assign({},selectStyle,{flex:1})}>
                <option value="">— Select column —</option>
                {targetColumns.map(function(c) { return <option key={c.id} value={c.name}>{c.name} ({c.type})</option>; })}
              </select>
              <button onClick={function() { setConfig('fieldMappings',(config.fieldMappings||[]).filter(function(_:any,i:number) { return i!==fi; })); }} style={Object.assign({},iconBtnStyle,{color:'#ef4444',marginLeft:'8px'})}>✕</button>
            </div>
            {mapping.column && selectedCol ? <DynamicValueInput column={selectedCol} value={mapping.value||''} onChange={function(v) { var m=(config.fieldMappings||[]).slice(); m[fi]=Object.assign({},m[fi],{value:v}); setConfig('fieldMappings',m); }} triggerColumns={triggerCols} />
            : mapping.column ? (<div><input type="text" value={mapping.value||''} onChange={function(e) { var m=(config.fieldMappings||[]).slice(); m[fi]=Object.assign({},m[fi],{value:e.target.value}); setConfig('fieldMappings',m); }} style={inputStyle} placeholder="Enter value or use dynamic content below" /><DynamicContentPanel value={mapping.value||''} onChange={function(v) { var m=(config.fieldMappings||[]).slice(); m[fi]=Object.assign({},m[fi],{value:v}); setConfig('fieldMappings',m); }} showMeta={true} /></div>) : null}
          </div>);
        })}
        <button onClick={function() { setConfig('fieldMappings',(config.fieldMappings||[]).concat([{column:'',value:''}])); }} style={addBtnStyle}>+ Add Field</button>
      </div>)}
 
      {['update_field','lock_row','unlock_row'].indexOf(action.actionType)!==-1 && (<div style={{ padding:'8px', background:'#f3f4f6', borderRadius:'6px' }}>
        <label style={Object.assign({},labelStyle,{color:'#9ca3af',fontSize:'10px'})}>Row ID (advanced — leave blank for triggering row)</label>
        <input type="text" value={config.targetRowId||''} onChange={function(e) { setConfig('targetRowId',e.target.value); }} style={Object.assign({},inputStyle,{background:'#f9fafb',fontSize:'12px'})} placeholder="Leave blank" />
      </div>)}
 
      {action.actionType==='send_email' && (<>
        <div><label style={labelStyle}>To (comma-separated for multiple)</label>
          <input type="text" value={config.to||''} onChange={function(e) { setConfig('to',e.target.value); }} style={inputStyle} placeholder="email@example.com, {{row.Contact Email}}" />
          <DynamicContentPanel value={config.to||''} onChange={function(v) { setConfig('to',v); }} />
        </div>
        <div><label style={labelStyle}>Subject</label>
          <input type="text" value={config.subject||''} onChange={function(e) { setConfig('subject',e.target.value); }} style={inputStyle} placeholder="Your request has been {{row.Status}}" />
          <DynamicContentPanel value={config.subject||''} onChange={function(v) { setConfig('subject',v); }} showMeta={true} />
        </div>
        <div><label style={labelStyle}>Body (HTML)</label>
          <textarea value={config.body||''} onChange={function(e) { setConfig('body',e.target.value); }} style={Object.assign({},inputStyle,{minHeight:'100px',resize:'vertical' as const})} placeholder="Hi {{row.Contact Name}},&#10;&#10;Your purchase order for {{row.Total}} has been processed." />
          <DynamicContentPanel value={config.body||''} onChange={function(v) { setConfig('body',v); }} showMeta={true} />
        </div>
      </>)}
 
      {action.actionType==='webhook' && (<>
        <div><label style={labelStyle}>URL</label>
          <input type="text" value={config.url||''} onChange={function(e) { setConfig('url',e.target.value); }} style={inputStyle} placeholder="https://..." />
        </div>
        <div><label style={labelStyle}>Method</label>
          <select value={config.method||'POST'} onChange={function(e) { setConfig('method',e.target.value); }} style={selectStyle}>
            <option value="POST">POST</option><option value="PUT">PUT</option><option value="PATCH">PATCH</option><option value="DELETE">DELETE</option>
          </select>
        </div>
        {config.url && (<div>
          <label style={labelStyle}>Retry on failure (5xx errors)</label>
          <select value={config.retryCount||'0'} onChange={function(e) { setConfig('retryCount',e.target.value); }} style={selectStyle}>
            <option value="0">No retry</option>
            <option value="1">1 retry</option>
            <option value="2">2 retries</option>
            <option value="3">3 retries (exponential backoff)</option>
          </select>
        </div>)}
      </>)}
 
      {action.actionType==='notify' && (<>
        <div><label style={labelStyle}>Notify Users</label>
          <UserPicker selectedIds={config.userIds||[]} onChange={function(ids) { setConfig('userIds',ids); }} users={users} />
        </div>
        <div><label style={labelStyle}>Title</label>
          <input type="text" value={config.title||''} onChange={function(e) { setConfig('title',e.target.value); }} style={inputStyle} placeholder="Notification title" />
          <DynamicContentPanel value={config.title||''} onChange={function(v) { setConfig('title',v); }} />
        </div>
        <div><label style={labelStyle}>Message</label>
          <input type="text" value={config.message||''} onChange={function(e) { setConfig('message',e.target.value); }} style={inputStyle} placeholder="Notification message" />
          <DynamicContentPanel value={config.message||''} onChange={function(v) { setConfig('message',v); }} showMeta={true} />
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#6b7280', cursor:'pointer' }}>
          <input type="checkbox" checked={config.sendEmail||false} onChange={function(e) { setConfig('sendEmail',e.target.checked); }} />
          Also send as email notification
        </label>
      </>)}
 
      {action.actionType==='trigger_approval' && (function() {
        var approvalTableId = config.targetTableId || builderTriggerConfig.tableId || '';
        if (approvalTableId) fetchApprovalWorkflows(approvalTableId);
        var workflows = approvalWorkflows[approvalTableId] || [];
        return (<div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <div><label style={labelStyle}>Table</label>
            <select value={config.targetTableId||''} onChange={function(e) { setConfig('targetTableId',e.target.value); setConfig('workflowId',''); }} style={selectStyle}>
              <option value="">— Use trigger table —</option>
              {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
            </select>
          </div>
          <div><label style={labelStyle}>Approval Workflow</label>
            {workflows.length === 0 ? (
              <div style={{ padding:'10px', background:'#fefce8', borderRadius:'6px', border:'1px solid #fde68a' }}>
                <span style={{ fontSize:'11px', color:'#92400e' }}>No approval workflows found. Install from Marketplace first.</span>
              </div>
            ) : (
              <select value={config.workflowId||''} onChange={function(e) { setConfig('workflowId',e.target.value); }} style={selectStyle}>
                <option value="">— Select workflow —</option>
                {workflows.map(function(wf: any) { return <option key={wf.id} value={wf.id}>{wf.name} ({(wf.stages||[]).length} stage{(wf.stages||[]).length!==1?'s':''})</option>; })}
              </select>
            )}
          </div>
          <div style={{ padding:'10px', background:'#f0fdf4', borderRadius:'6px', border:'1px solid #bbf7d0' }}>
            <span style={{ fontSize:'11px', color:'#166534' }}>✅ Submits the row into the approval workflow, locks the row, and notifies approvers.</span>
          </div>
        </div>);
      })()}
 
      {action.actionType==='unlock_row' && (<div style={{ padding:'10px', background:'#f0fdf4', borderRadius:'6px', border:'1px solid #bbf7d0' }}>
        <span style={{ fontSize:'11px', color:'#166534' }}>🔓 Unlocks the row, allowing it to be edited again.</span>
      </div>)}
	  
	  {action.actionType==='push_to_sharepoint' && (<div style={{ padding:'10px', background:'#e0f2fe', borderRadius:'6px', border:'1px solid #7dd3fc' }}>
        <span style={{ fontSize:'11px', color:'#0c4a6e' }}>📤 Pushes the current row data to the linked SharePoint list. The table must have SharePoint sync configured in the admin panel. Columns marked as "Agora Only" will be excluded from the push.</span>
      </div>)}
 
      {action.actionType==='delay' && (<div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
        <div style={{ display:'flex', gap:'10px', alignItems:'flex-end' }}>
          <div style={{ flex:1 }}><label style={labelStyle}>Hours</label>
            <input type="number" min="0" max="24" value={config.delayHours||'0'} onChange={function(e) { setConfig('delayHours',e.target.value); }} style={inputStyle} />
          </div>
          <div style={{ flex:1 }}><label style={labelStyle}>Minutes</label>
            <input type="number" min="0" max="59" value={config.delayMinutes||'0'} onChange={function(e) { setConfig('delayMinutes',e.target.value); }} style={inputStyle} />
          </div>
          <div style={{ flex:1 }}><label style={labelStyle}>Seconds</label>
            <input type="number" min="0" max="59" value={config.delaySeconds||'0'} onChange={function(e) { setConfig('delaySeconds',e.target.value); }} style={inputStyle} />
          </div>
        </div>
        <div style={{ padding:'10px', background:'#fefce8', borderRadius:'6px', border:'1px solid #fde68a' }}>
          <span style={{ fontSize:'11px', color:'#92400e' }}>⏳ Pauses before the next step. Maximum 1 hour.</span>
        </div>
      </div>)}
 
      {action.actionType==='condition' && (<div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
        <div><label style={labelStyle}>IF Condition</label>
          <input type="text" value={config.conditionExpr||''} onChange={function(e) { setConfig('conditionExpr',e.target.value); }} style={inputStyle} placeholder="e.g. {{row.Total}} > 500" />
          <DynamicContentPanel value={config.conditionExpr||''} onChange={function(v) { setConfig('conditionExpr',v); }} showMeta={true} />
        </div>
        <div style={{ padding:'10px', background:'#ede9fe', borderRadius:'6px', border:'1px solid #c4b5fd' }}>
          <span style={{ fontSize:'11px', color:'#5b21b6' }}>🔀 Steps after this run on the TRUE or FALSE branch. Set the condition on each step.</span>
        </div>
      </div>)}
 
      <div style={{ padding:'8px', background:'#f3f4f6', borderRadius:'6px' }}>
        <label style={Object.assign({},labelStyle,{color:'#9ca3af',fontSize:'10px'})}>Step condition (leave blank to always run)</label>
        <input type="text" value={action.conditionExpr||''} onChange={function(e) { updateAction(index,{conditionExpr:e.target.value}); }} style={Object.assign({},inputStyle,{background:'#f9fafb',fontSize:'12px'})} placeholder="e.g. {{row.Status}} == 'Approved'" />
      </div>
    </div>);
  }
  if (loading) return <div style={{ padding:'40px', textAlign:'center', color:'#9ca3af' }}>Loading automations...</div>;

  // ==== LIST ====
  if (view==='list') {
    return (<div style={{ maxWidth:'960px', margin:'0 auto', padding:'32px 24px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div><h1 style={{ fontSize:'22px', fontWeight:700, color:'#111827', margin:0 }}>⚡ Automations</h1><p style={{ fontSize:'13px', color:'#6b7280', margin:'4px 0 0' }}>Automate workflows across your tables</p></div>
        <button onClick={function() { openBuilder(); }} style={btnPrimary}>+ New Automation</button>
      </div>
      {automations.length===0 ? (
        <div style={Object.assign({},cardStyle,{textAlign:'center' as const, padding:'60px 24px', color:'#6b7280'})}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>⚡</div>
          <p style={{ fontSize:'15px', fontWeight:500, color:'#374151' }}>No automations yet</p>
          <p style={{ fontSize:'13px', marginTop:'4px' }}>Create your first automation to start automating workflows.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {automations.map(function(auto) { return (
            <div key={auto.id} style={Object.assign({},cardStyle,{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'})} onClick={function() { loadDetail(auto.id); }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <span style={{ fontSize:'14px', fontWeight:600, color:auto.enabled?'#111827':'#9ca3af' }}>{auto.name}</span>
                  {!auto.enabled && <span style={{ fontSize:'10px', color:'#9ca3af', textTransform:'uppercase' as const, letterSpacing:'1px', fontWeight:600 }}>Disabled</span>}
                </div>
                <div style={{ fontSize:'12px', color:'#6b7280', marginTop:'4px', display:'flex', gap:'16px', flexWrap:'wrap' as const }}>
                  <span>{getTriggerLabel(auto.triggerType)}</span>
                  <span>{auto.actions.length} action{auto.actions.length!==1?'s':''}</span>
                  {auto._count && <span>{auto._count.runs} run{auto._count.runs!==1?'s':''}</span>}
                  {auto.creatorName && <span style={{ color:'#9ca3af' }}>by {auto.creatorName}</span>}
                  {auto.workspaceName && <span style={{ padding:'1px 6px', background:'#f3e8ff', color:'#7c3aed', borderRadius:'4px', fontSize:'10px', fontWeight:600 }}>{auto.workspaceIcon || '📁'} {auto.workspaceName}</span>}
                  {auto.sharedTableName && <span style={{ padding:'1px 6px', background:'#dbeafe', color:'#1e40af', borderRadius:'4px', fontSize:'10px', fontWeight:600 }}>{auto.sharedTableIcon || '📊'} {auto.sharedTableName}</span>}
                  {auto.isOwner === false && <span style={{ padding:'1px 6px', background:'#f0fdf4', color:'#166534', borderRadius:'4px', fontSize:'10px', fontWeight:600 }}>Shared</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                <button onClick={function(e) { e.stopPropagation(); toggleEnabled(auto.id,auto.enabled); }} style={Object.assign({},iconBtnStyle,{fontSize:'18px',color:auto.enabled?'#22c55e':'#d1d5db'})} title={auto.enabled?'Disable':'Enable'}>{auto.enabled?'●':'○'}</button>
                <button onClick={function(e) { e.stopPropagation(); duplicateAutomation(auto); }} style={iconBtnStyle} title="Duplicate">⧉</button>
                <button onClick={function(e) { e.stopPropagation(); openBuilder(auto); }} style={iconBtnStyle} title="Edit">✎</button>
                <button onClick={function(e) { e.stopPropagation(); deleteAutomation(auto.id); }} style={Object.assign({},iconBtnStyle,{color:'#ef4444'})} title="Delete">✕</button>
              </div>
            </div>); })}
        </div>
      )}
    </div>);
  }

  // ==== BUILDER ====
  if (view==='builder') {
    return (<div style={{ maxWidth:'720px', margin:'0 auto', padding:'32px 24px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <h1 style={{ fontSize:'18px', fontWeight:700, color:'#111827', margin:0 }}>{editingId?'Edit Automation':'New Automation'}</h1>
        <button onClick={function() { setView('list'); }} style={btnSecondary}>← Back to list</button>
      </div>

      <div style={Object.assign({},cardStyle,{marginBottom:'16px'})}>
        <div style={{ marginBottom:'12px' }}><label style={labelStyle}>Name</label><input type="text" value={builderName} onChange={function(e) { setBuilderName(e.target.value); }} style={inputStyle} placeholder="e.g. Notify on approval" /></div>
        <div><label style={labelStyle}>Description (optional)</label><input type="text" value={builderDesc} onChange={function(e) { setBuilderDesc(e.target.value); }} style={inputStyle} placeholder="What does this automation do?" /></div>
        <div style={{ marginTop:'12px' }}><label style={labelStyle}>Share with</label>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            <div>
              <span style={{ fontSize:'10px', fontWeight:600, color:'#9ca3af', textTransform:'uppercase' as const, letterSpacing:'0.5px' }}>Workspace</span>
              {workspaces.length > 0 ? (
                <select value={builderWorkspaceId||''} onChange={function(e) { setBuilderWorkspaceId(e.target.value||null); }} style={selectStyle}>
                  <option value="">None</option>
                  {workspaces.map(function(ws) { return <option key={ws.id} value={ws.id}>{ws.icon || '📁'} {ws.name}</option>; })}
                </select>
              ) : (
                <div style={{ padding:'6px 10px', background:'#f9fafb', borderRadius:'6px', border:'1px solid #e5e7eb', fontSize:'11px', color:'#9ca3af' }}>No workspaces — create one from the sidebar</div>
              )}
            </div>
            <div>
              <span style={{ fontSize:'10px', fontWeight:600, color:'#9ca3af', textTransform:'uppercase' as const, letterSpacing:'0.5px' }}>Table</span>
              <select value={builderTableId||''} onChange={function(e) { setBuilderTableId(e.target.value||null); }} style={selectStyle}>
                <option value="">None</option>
                {tables.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
              </select>
            </div>
            <span style={{ fontSize:'11px', color:'#9ca3af', display:'block' }}>
              {builderWorkspaceId && builderTableId ? 'Shared with workspace members and table members.' : builderWorkspaceId ? 'All workspace members can see this. Admins can edit.' : builderTableId ? 'Anyone with access to this table can see this automation.' : 'Private — only you and system admins.'}
            </span>
          </div>
        </div>
      </div>

      <div style={Object.assign({},cardStyle,{marginBottom:'16px'})}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}><span style={{ color:'#2563eb', fontWeight:700, fontSize:'12px', textTransform:'uppercase' as const, letterSpacing:'1px' }}>TRIGGER</span><span style={{ fontSize:'11px', color:'#9ca3af' }}>When this happens...</span></div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:'8px', marginBottom:'16px' }}>
          {TRIGGER_TYPES.map(function(t) { var sel=builderTrigger===t.value; return (
            <button key={t.value} onClick={function() { setBuilderTrigger(t.value); setBuilderTriggerConfig({}); }}
              style={{ background:sel?'#eff6ff':'#ffffff', border:sel?'1px solid #2563eb':'1px solid #e5e7eb', borderRadius:'8px', padding:'10px 12px', cursor:'pointer', textAlign:'left' as const, color:sel?'#1d4ed8':'#6b7280', fontSize:'12px', fontWeight:sel?600:400 }}>
              <span style={{ fontSize:'16px' }}>{t.icon}</span><div style={{ marginTop:'4px' }}>{t.label}</div>
            </button>); })}
        </div>
        <TriggerConfigEditor />
      </div>

      <div style={{ textAlign:'center', margin:'4px 0' }}><div style={{ width:'2px', height:'24px', background:'#d1d5db', margin:'0 auto' }} /><span style={{ fontSize:'10px', color:'#9ca3af', textTransform:'uppercase' as const }}>then</span><div style={{ width:'2px', height:'24px', background:'#d1d5db', margin:'0 auto' }} /></div>

      <div style={{ marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}><span style={{ color:'#16a34a', fontWeight:700, fontSize:'12px', textTransform:'uppercase' as const, letterSpacing:'1px' }}>ACTIONS</span><span style={{ fontSize:'11px', color:'#9ca3af' }}>Do these things...</span></div>
        {builderActions.map(function(action,idx) { return (<div key={idx}>
          <div style={Object.assign({},cardStyle,{marginBottom:'8px'})}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <span style={{ color:'#6b7280', fontSize:'11px', fontWeight:600 }}>Step {idx+1}</span>
                <select value={action.actionType} onChange={function(e) { updateAction(idx,{actionType:e.target.value,actionConfig:{}}); }} style={Object.assign({},selectStyle,{width:'auto',padding:'4px 8px',fontSize:'12px'})}>
                  {ACTION_TYPES.map(function(a) { return <option key={a.value} value={a.value}>{a.icon} {a.label}</option>; })}
                </select>
              </div>
              <div style={{ display:'flex', gap:'4px' }}>
                <button onClick={function() { moveAction(idx,-1); }} style={iconBtnStyle}>↑</button>
                <button onClick={function() { moveAction(idx,1); }} style={iconBtnStyle}>↓</button>
                <button onClick={function() { removeAction(idx); }} style={Object.assign({},iconBtnStyle,{color:'#ef4444'})}>✕</button>
              </div>
            </div>
            {renderActionConfig(action, idx)}
          </div>
          {idx<builderActions.length-1 && <div style={{ textAlign:'center', margin:'2px 0' }}><div style={{ width:'2px', height:'16px', background:'#d1d5db', margin:'0 auto' }} /></div>}
        </div>); })}
        <button onClick={addAction} style={Object.assign({},addBtnStyle,{marginTop:'8px',padding:'12px'})}>+ Add Action Step</button>
      </div>

      <div style={{ display:'flex', gap:'12px', justifyContent:'flex-end', marginTop:'24px' }}>
        <button onClick={function() { setView('list'); }} style={btnSecondary}>Cancel</button>
        <button onClick={saveAutomation} disabled={saving} style={Object.assign({},btnPrimary,{opacity:saving?0.7:1})}>{saving?'Saving...':(editingId?'Save Changes':'Create Automation')}</button>
      </div>
    </div>);
  }

  // ==== DETAIL ====
  if (view==='detail' && selectedAutomation) {
    var auto = selectedAutomation;
    return (<div style={{ maxWidth:'720px', margin:'0 auto', padding:'32px 24px' }}>
      <button onClick={function() { setView('list'); setSelectedAutomation(null); }} style={Object.assign({},btnSecondary,{marginBottom:'16px'})}>← Back to list</button>

      <div style={Object.assign({},cardStyle,{marginBottom:'16px'})}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h2 style={{ fontSize:'18px', fontWeight:700, color:'#111827', margin:0 }}>{auto.name}</h2>{auto.description && <p style={{ fontSize:'13px', color:'#6b7280', margin:'4px 0 0' }}>{auto.description}</p>}</div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' as const }}>
            <button onClick={function() { openBuilder(auto); }} style={btnSecondary}>Edit</button>
            <button onClick={function() { duplicateAutomation(auto); }} style={btnSecondary}>Duplicate</button>
            <button onClick={function() { testAutomation(auto.id); }} disabled={testing} style={Object.assign({},btnSecondary,{color:"#7c3aed",borderColor:"#c4b5fd"})}>{testing?"Testing...":"Test Run"}</button>
            <button onClick={function() { toggleEnabled(auto.id,auto.enabled); }} style={Object.assign({},btnSecondary,{ background:auto.enabled?'#dcfce7':'#f3f4f6', borderColor:auto.enabled?'#86efac':'#d1d5db', color:auto.enabled?'#166534':'#6b7280' })}>{auto.enabled?'Enabled':'Disabled'}</button>
          </div>
        </div>
        <div style={{ marginTop:'16px', display:'flex', gap:'16px', fontSize:'12px', color:'#6b7280', flexWrap:'wrap' as const }}>
          <span>{getTriggerLabel(auto.triggerType)}</span>
          {auto.triggerConfig && (auto.triggerConfig as any).tableId && <span>Table: {getTableName((auto.triggerConfig as any).tableId)}</span>}
          <span>{auto.actions.length} action{auto.actions.length!==1?'s':''}</span>
          {auto.webhookSlug && <span style={{ color:'#7c3aed', fontFamily:'monospace', fontSize:'11px' }}>/api/automations/webhook/{auto.webhookSlug}</span>}
        </div>
      </div>

      {/* Flow */}
      <div style={Object.assign({},cardStyle,{marginBottom:'16px'})}>
        <div style={{ fontSize:'11px', fontWeight:600, color:'#6b7280', textTransform:'uppercase' as const, letterSpacing:'1px', marginBottom:'12px' }}>Flow</div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' as const }}>
          <span style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'6px 12px', fontSize:'12px', color:'#1d4ed8', fontWeight:500 }}>{getTriggerLabel(auto.triggerType)}</span>
          {auto.actions.map(function(a:any,i:number) { var at=a.actionType||a.actiontype; return (<span key={i} style={{ display:'flex', alignItems:'center', gap:'8px' }}><span style={{ color:'#d1d5db' }}>→</span><span style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:'6px', padding:'6px 12px', fontSize:'12px', color:'#166534', fontWeight:500 }}>{getActionLabel(at)}</span></span>); })}
        </div>
      </div>

      {/* Test Results */}
      {testResult && (<div style={Object.assign({},cardStyle,{marginBottom:'16px', border: testResult.error ? '1px solid #fecaca' : '1px solid #86efac'})}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
          <div style={{ fontSize:'11px', fontWeight:600, color: testResult.error ? '#991b1b' : '#166534', textTransform:'uppercase' as const, letterSpacing:'1px' }}>{testResult.error ? 'Test Failed' : 'Test Results (Dry Run)'}</div>
          <button onClick={function() { setTestResult(null); }} style={Object.assign({},iconBtnStyle,{fontSize:'12px'})}>✕ Close</button>
        </div>
        {testResult.error ? (<p style={{ fontSize:'13px', color:'#dc2626' }}>{testResult.error}</p>) : (<div>
          <p style={{ fontSize:'12px', color:'#6b7280', marginBottom:'8px' }}>{testResult.note}</p>
          {testResult.steps && testResult.steps.map(function(step:any) { return (<div key={step.stepNumber} style={{ padding:'10px', marginBottom:'6px', background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:'6px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
              <span style={{ fontSize:'11px', fontWeight:600, color:'#374151' }}>Step {step.stepNumber}</span>
              <span style={{ fontSize:'12px', color:'#6b7280' }}>{getActionLabel(step.actionType)}</span>
              {!step.conditionMet && <span style={{ fontSize:'10px', padding:'2px 6px', background:'#f3f4f6', borderRadius:'4px', color:'#6b7280' }}>Would be skipped</span>}
              {step.conditionMet && <span style={{ fontSize:'10px', padding:'2px 6px', background:'#dcfce7', borderRadius:'4px', color:'#166534' }}>Would execute</span>}
            </div>
            {step.conditionExpr && <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'4px' }}>Condition: {step.conditionResolved} = {step.conditionMet ? 'true' : 'false'}</div>}
            {step.resolvedValues && Object.keys(step.resolvedValues).length > 0 && (<pre style={{ fontSize:'11px', color:'#374151', background:'#f9fafb', padding:'8px', borderRadius:'4px', overflow:'auto' as const, margin:0, whiteSpace:'pre-wrap' as const }}>{JSON.stringify(step.resolvedValues, null, 2)}</pre>)}
          </div>); })}
        </div>)}
      </div>)}
      {/* Run History */}
      <div style={cardStyle}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
          <div style={{ fontSize:'11px', fontWeight:600, color:'#6b7280', textTransform:'uppercase' as const, letterSpacing:'1px' }}>Run History</div>
        </div>
        {(!auto.runs || auto.runs.length===0) ? <p style={{ fontSize:'13px', color:'#9ca3af' }}>No runs yet. Trigger the automation to see results here.</p> : (
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            {auto.runs.map(function(run:any) {
              var st = run.startedAt||run.startedat; var et = run.completedAt||run.completedat; var em = run.errorMessage||run.errormessage;
              var steps = run.stepResults||run.stepresults||[];
              var isExpanded = expandedRunId===run.id;
              var duration = et ? Math.round(new Date(et).getTime()-new Date(st).getTime()) : null;
              return (<div key={run.id}>
                <div onClick={function() { setExpandedRunId(isExpanded?null:run.id); }} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:em?'#fef2f2':'#ffffff', border:'1px solid '+(em?'#fecaca':'#e5e7eb'), borderRadius:isExpanded?'6px 6px 0 0':'6px', fontSize:'12px', cursor:'pointer' }}>
                  <div style={{ display:'flex', gap:'12px', alignItems:'center' }}>
                    <StatusBadge status={run.status} />
                    <span style={{ color:'#6b7280' }}>{new Date(st).toLocaleString()}</span>
                    {duration!==null && <span style={{ color:'#9ca3af', fontSize:'11px' }}>{duration}ms</span>}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    {em && <span style={{ color:'#dc2626', fontSize:'11px', maxWidth:'250px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{em}</span>}
                    <span style={{ color:'#9ca3af', fontSize:'10px' }}>{isExpanded?'▼':'▶'}</span>
                  </div>
                </div>
                {isExpanded && steps.length>0 && (<div style={{ border:'1px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 6px 6px', padding:'12px', background:'#fafafa' }}>
                  <div style={{ fontSize:'10px', fontWeight:600, color:'#6b7280', textTransform:'uppercase' as const, marginBottom:'8px' }}>Step Details</div>
                  {steps.map(function(step:any, si:number) {
                    return (<div key={si} style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'8px', marginBottom:'4px', background:'#ffffff', borderRadius:'6px', border:'1px solid #e5e7eb' }}>
                      <StatusBadge status={step.status} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'12px', fontWeight:500, color:'#374151' }}>{getActionLabel(step.actionType)}</div>
                        {step.error && <div style={{ fontSize:'11px', color:'#dc2626', marginTop:'4px', padding:'6px 8px', background:'#fef2f2', borderRadius:'4px', wordBreak:'break-all' as const }}>{step.error}</div>}
                        {step.output && !step.error && <div style={{ fontSize:'11px', color:'#6b7280', marginTop:'4px' }}>
                          {step.output.updated && <span>Updated row: {step.output.updated}</span>}
                          {step.output.createdRowId && <span>Created row: {step.output.createdRowId}</span>}
                          {step.output.sent !== undefined && <span>Email sent: {step.output.sent ? 'Yes' : 'No'}</span>}
                          {step.output.locked && <span>Locked row: {step.output.locked}</span>}
                          {step.output.reason && <span>Skipped: {step.output.reason}</span>}
                        </div>}
                        <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'2px' }}>{step.durationMs}ms</div>
                      </div>
                    </div>);
                  })}
                </div>)}
              </div>);
            })}
          </div>
        )}
      </div>
    </div>);
  }

  return null;
}