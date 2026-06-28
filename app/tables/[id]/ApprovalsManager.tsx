'use client';

import { useState, useEffect } from 'react';

interface Stage {
  order: number;
  name: string;
  approverUserIds: string[];
  approverGroupIds: string[];
  dynamicApproverColumnId: string | null;
  requireAll: boolean;
  condition: { columnId: string; operator: string; value: string } | null;
}

export function ApprovalsManager({ tableId, columns, isOpen, onClose }: { tableId: string; columns: any[]; isOpen: boolean; onClose: () => void }) {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  const [name, setName] = useState('Approval Workflow');
  const [triggerColumnId, setTriggerColumnId] = useState('');
  const [triggerValue, setTriggerValue] = useState('');
  const [approveColumnId, setApproveColumnId] = useState('');
  const [approveValue, setApproveValue] = useState('');
  const [denyColumnId, setDenyColumnId] = useState('');
  const [denyValue, setDenyValue] = useState('');
  const [lockOnApprove, setLockOnApprove] = useState(true);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHours, setReminderHours] = useState(24);

  const [stages, setStages] = useState<Stage[]>([{
    order: 1, name: 'Approval', approverUserIds: [], approverGroupIds: [],
    dynamicApproverColumnId: null, requireAll: false, condition: null,
  }]);

  // Settable columns (exclude formula, lookup, rollup, etc.)
  const settableColumns = columns.filter(c => !['formula', 'lookup', 'rollup', 'linked_record', 'attachment'].includes(c.type));

  useEffect(() => {
    if (!isOpen) return;
    fetchWorkflows();
    fetchUsersAndGroups();
  }, [isOpen, tableId]);

  async function fetchWorkflows() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/approvals`);
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data ? [data] : []);
      }
    } catch {} finally { setLoading(false); }
  }

  async function fetchUsersAndGroups() {
    try {
      const res = await fetch(`/api/tables/${tableId}/members`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setGroups(data.groups || []);
      }
    } catch {}
  }

  function addStage() {
    setStages(prev => [...prev, {
      order: prev.length + 1, name: `Stage ${prev.length + 1}`, approverUserIds: [], approverGroupIds: [],
      dynamicApproverColumnId: null, requireAll: false, condition: null,
    }]);
  }

  function removeStage(order: number) {
    if (stages.length <= 1) return;
    setStages(prev => prev.filter(s => s.order !== order).map((s, i) => ({ ...s, order: i + 1 })));
  }

  function updateStage(order: number, updates: Partial<Stage>) {
    setStages(prev => prev.map(s => s.order === order ? { ...s, ...updates } : s));
  }

  function moveStage(order: number, direction: 'up' | 'down') {
    const idx = stages.findIndex(s => s.order === order);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= stages.length - 1) return;
    const newStages = [...stages];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newStages[idx], newStages[swapIdx]] = [newStages[swapIdx], newStages[idx]];
    setStages(newStages.map((s, i) => ({ ...s, order: i + 1 })));
  }

  async function saveWorkflow() {
    setCreating(true);
    try {
      const payload = {
        name,
        triggerColumnId: triggerColumnId || null,
        triggerValue: triggerValue || null,
        approveColumnId: approveColumnId || null,
        approveValue: approveValue || null,
        denyColumnId: denyColumnId || null,
        denyValue: denyValue || null,
        lockOnApprove, stages, reminderEnabled, reminderHours,
      };
      const url = editingWorkflowId ? `/api/tables/${tableId}/approvals/${editingWorkflowId}` : `/api/tables/${tableId}/approvals`;
      const res = await fetch(url, { method: editingWorkflowId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { setShowCreate(false); resetForm(); fetchWorkflows(); if (!editingWorkflowId) window.location.reload(); }
      else { const err = await res.json(); alert(err.error || 'Failed to save workflow'); }
    } catch {} finally { setCreating(false); }
  }

  function resetForm() {
    setEditingWorkflowId(null); setName('Approval Workflow'); setTriggerColumnId(''); setTriggerValue('');
    setApproveColumnId(''); setApproveValue(''); setDenyColumnId(''); setDenyValue('');
    setLockOnApprove(true); setReminderEnabled(false); setReminderHours(24);
    setStages([{ order: 1, name: 'Approval', approverUserIds: [], approverGroupIds: [], dynamicApproverColumnId: null, requireAll: false, condition: null }]);
  }

  function loadWorkflowForEdit(wf: any) {
    setEditingWorkflowId(wf.id); setName(wf.name); setTriggerColumnId(wf.triggerColumnId || '');
    setTriggerValue(wf.triggerValue || '');
    setApproveColumnId(wf.approveColumnId || '');
    setApproveValue(wf.approveValue || '');
    setDenyColumnId(wf.denyColumnId || '');
    setDenyValue(wf.denyValue || '');
    setLockOnApprove(wf.lockOnApprove); setReminderEnabled(wf.reminderEnabled); setReminderHours(wf.reminderHours);
    setStages((wf.stages || []).length > 0 ? wf.stages : [{ order: 1, name: 'Approval', approverUserIds: [], approverGroupIds: [], dynamicApproverColumnId: null, requireAll: false, condition: null }]);
    setShowCreate(true);
  }

  function getSelectOptions(columnId: string) { const col = columns.find(c => c.id === columnId); return col?.settings?.options || []; }
  function getStatusCount(wf: any, status: string) { return wf.requests?.filter((r: any) => r.status === status).length || 0; }
  function getUserName(id: string) { const u = users.find(u => u.id === id); return u?.name || u?.email || id.slice(0, 8); }
  function getColumnName(id: string) { const c = columns.find(c => c.id === id); return c?.name || id.slice(0, 8); }

  const hasAnyApprovers = stages.some(s => s.approverUserIds.length > 0 || s.approverGroupIds.length > 0 || s.dynamicApproverColumnId);

  // Helper to render a column+value picker pair
  function ColumnValuePicker({ label, labelColor, borderColor, columnId, value, onColumnChange, onValueChange }: {
    label: string; labelColor: string; borderColor: string;
    columnId: string; value: string;
    onColumnChange: (id: string) => void; onValueChange: (val: string) => void;
  }) {
    const selectedCol = columns.find(c => c.id === columnId);
    const hasOptions = selectedCol?.type === 'select' && selectedCol?.settings?.options;
    return (
      <div>
        <label className={`block text-xs font-medium ${labelColor} mb-1`}>{label}</label>
        <div className="space-y-2">
          <select value={columnId} onChange={e => { onColumnChange(e.target.value); onValueChange(''); }}
            className={`w-full px-3 py-2 text-sm border ${borderColor} rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200`}>
            <option value="">None — no column update</option>
            {settableColumns.map(c => (<option key={c.id} value={c.id}>{c.name} ({c.type})</option>))}
          </select>
          {columnId && (
            hasOptions ? (
              <select value={value} onChange={e => onValueChange(e.target.value)}
                className={`w-full px-3 py-2 text-sm border ${borderColor} rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200`}>
                <option value="">Select value...</option>
                {selectedCol.settings.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input type="text" value={value} onChange={e => onValueChange(e.target.value)}
                placeholder="Enter value..."
                className={`w-full px-3 py-2 text-sm border ${borderColor} rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200`} />
            )
          )}
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">✅ Approval Workflow</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">One workflow per table with sequential approval stages</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" /></div>
          ) : !showCreate ? (
            <>
              {workflows.length > 0 ? (
                <div className="space-y-4">
                  {workflows.map(wf => (
                    <div key={wf.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{wf.name}</h4>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${wf.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                            {wf.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                            {(wf.stages || []).length} stage{(wf.stages || []).length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <button onClick={() => loadWorkflowForEdit(wf)} className="text-[10px] px-2.5 py-1 rounded-lg text-blue-600 hover:bg-blue-50 font-medium">Edit</button>
                          <button onClick={async () => { await fetch(`/api/tables/${tableId}/approvals/${wf.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !wf.isActive }) }); fetchWorkflows(); }}
                            className="text-[10px] px-2.5 py-1 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium">{wf.isActive ? 'Disable' : 'Enable'}</button>
                          <button onClick={async () => { if (confirm('Delete this workflow and its approval column?')) { await fetch(`/api/tables/${tableId}/approvals/${wf.id}`, { method: 'DELETE' }); fetchWorkflows(); window.location.reload(); } }}
                            className="text-[10px] px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-50 font-medium">Delete</button>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 mb-3 overflow-x-auto pb-1">
                        {(wf.stages || []).map((stage: any, i: number) => (
                          <div key={stage.order} className="flex items-center">
                            <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg min-w-[100px]">
                              <p className="text-[10px] font-bold text-blue-700 dark:text-blue-400">{stage.name}</p>
                              <p className="text-[9px] text-blue-500">
                                {stage.approverUserIds?.length || 0} user{(stage.approverUserIds?.length || 0) !== 1 ? 's' : ''}
                                {stage.dynamicApproverColumnId && ' + dynamic'}
                                {stage.requireAll ? ' (all)' : ' (any)'}
                              </p>
                            </div>
                            {i < (wf.stages || []).length - 1 && (
                              <svg className="w-5 h-5 text-gray-300 mx-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>⏳ {getStatusCount(wf, 'pending')} pending</span>
                        <span>🔄 {getStatusCount(wf, 'in_progress')} in progress</span>
                        <span>✅ {getStatusCount(wf, 'approved')} approved</span>
                        <span>❌ {getStatusCount(wf, 'denied')} denied</span>
                      </div>

                      <p className="text-[10px] text-gray-400 mt-2">
                        {wf.triggerColumnId ? (
                          <>Triggers when <strong>{getColumnName(wf.triggerColumnId)}</strong> = &quot;{wf.triggerValue}&quot;</>
                        ) : (
                          <>👆 Manual trigger only — use Automations &quot;For Selected Row&quot;</>
                        )}
                        {wf.approveColumnId && <> • ✓ Approve → <strong>{getColumnName(wf.approveColumnId)}</strong> = &quot;{wf.approveValue}&quot;</>}
                        {wf.denyColumnId && <> • ✗ Deny → <strong>{getColumnName(wf.denyColumnId)}</strong> = &quot;{wf.denyValue}&quot;</>}
                        {wf.lockOnApprove && ' • 🔒 Locks on approve'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">✅</div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">No approval workflow yet</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Create a workflow to require approvals before records are finalized.</p>
                  <button onClick={() => setShowCreate(true)} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Workflow</button>
                </div>
              )}

              {workflows.length > 0 && workflows[0] && (
                <p className="text-[10px] text-gray-400 text-center mt-4">One workflow per table. Edit or delete the existing one to make changes.</p>
              )}
            </>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{editingWorkflowId ? 'Edit Workflow' : 'New Workflow'}</h4>
                <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← Back</button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Workflow Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
              </div>

              {/* Trigger */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Trigger Column</label>
                  <select value={triggerColumnId} onChange={e => { setTriggerColumnId(e.target.value); setTriggerValue(''); }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200">
                    <option value="">None — manual trigger only</option>
                    {columns.filter(c => c.type === 'select').map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Trigger Value</label>
                  {!triggerColumnId ? (
                    <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-[10px] text-yellow-800">No auto-trigger. Use ⚡ Automations with &quot;For Selected Row&quot; trigger and &quot;Trigger Approval&quot; action.</p>
                    </div>
                  ) : (
                    <select value={triggerValue} onChange={e => setTriggerValue(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200">
                      <option value="">Select...</option>
                      {getSelectOptions(triggerColumnId).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Approve/Deny — independent column + value pickers */}
              <div className="grid grid-cols-2 gap-3">
                <ColumnValuePicker
                  label="✓ On Final Approve → Update Column"
                  labelColor="text-green-600"
                  borderColor="border-green-300"
                  columnId={approveColumnId}
                  value={approveValue}
                  onColumnChange={setApproveColumnId}
                  onValueChange={setApproveValue}
                />
                <ColumnValuePicker
                  label="✗ On Deny → Update Column"
                  labelColor="text-red-600"
                  borderColor="border-red-300"
                  columnId={denyColumnId}
                  value={denyValue}
                  onColumnChange={setDenyColumnId}
                  onValueChange={setDenyValue}
                />
              </div>

              {/* Stages */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Approval Stages</label>
                  <button onClick={addStage} className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">+ Add Stage</button>
                </div>

                <div className="space-y-3">
                  {stages.map((stage, idx) => (
                    <div key={stage.order} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{stage.order}</span>
                          <input type="text" value={stage.name} onChange={e => updateStage(stage.order, { name: e.target.value })}
                            className="px-2 py-1 text-sm font-medium border border-transparent hover:border-gray-300 rounded bg-transparent dark:text-gray-200 focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div className="flex items-center space-x-1">
                          {stages.length > 1 && (
                            <>
                              <button onClick={() => moveStage(stage.order, 'up')} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30" title="Move up">↑</button>
                              <button onClick={() => moveStage(stage.order, 'down')} disabled={idx === stages.length - 1} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30" title="Move down">↓</button>
                              <button onClick={() => removeStage(stage.order)} className="p-1 text-red-400 hover:text-red-600" title="Remove stage">✕</button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mb-2">
                        <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">Approvers (select users)</label>
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {stage.approverUserIds.map(id => (
                            <span key={id} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                              {getUserName(id)}
                              <button onClick={() => updateStage(stage.order, { approverUserIds: stage.approverUserIds.filter(uid => uid !== id) })} className="ml-1 text-blue-500 hover:text-blue-800">✕</button>
                            </span>
                          ))}
                        </div>
                        <select value="" onChange={e => { if (e.target.value && !stage.approverUserIds.includes(e.target.value)) { updateStage(stage.order, { approverUserIds: [...stage.approverUserIds, e.target.value] }); } e.target.value = ''; }}
                          className="w-full px-2 py-1.5 text-[11px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200">
                          <option value="">+ Add approver...</option>
                          {users.filter(u => !stage.approverUserIds.includes(u.id)).map(u => (<option key={u.id} value={u.id}>{u.name || u.email}</option>))}
                        </select>
                      </div>

                      <div className="mb-2">
                        <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">Dynamic Approver (from column value)</label>
                        <select value={stage.dynamicApproverColumnId || ''} onChange={e => updateStage(stage.order, { dynamicApproverColumnId: e.target.value || null })}
                          className="w-full px-2 py-1.5 text-[11px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200">
                          <option value="">None — use fixed approvers only</option>
                          {columns.filter(c => ['user', 'email', 'text', 'select'].includes(c.type)).map(c => (<option key={c.id} value={c.id}>{c.name} ({c.type})</option>))}
                        </select>
                        {stage.dynamicApproverColumnId && (<p className="text-[9px] text-gray-400 mt-0.5">The value in this column will be matched to a user by name, email, or ID</p>)}
                      </div>

                      <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
                        <label className="flex items-center space-x-1.5 cursor-pointer">
                          <input type="checkbox" checked={stage.requireAll} onChange={e => updateStage(stage.order, { requireAll: e.target.checked })} className="w-3 h-3 rounded border-gray-300 text-blue-600" />
                          <span className="text-[10px] text-gray-600 dark:text-gray-400">Require all approvers</span>
                        </label>
                      </div>

                      {idx > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <label className="flex items-center space-x-1.5 cursor-pointer mb-1.5">
                            <input type="checkbox" checked={!!stage.condition} onChange={e => updateStage(stage.order, { condition: e.target.checked ? { columnId: '', operator: '>', value: '' } : null })} className="w-3 h-3 rounded border-gray-300 text-orange-600" />
                            <span className="text-[10px] text-orange-600 font-medium">Conditional — only run if...</span>
                          </label>
                          {stage.condition && (
                            <div className="flex items-center space-x-1.5">
                              <select value={stage.condition.columnId} onChange={e => updateStage(stage.order, { condition: { ...stage.condition!, columnId: e.target.value } })}
                                className="flex-1 px-2 py-1 text-[10px] border border-orange-300 rounded bg-white dark:bg-gray-800 dark:text-gray-200">
                                <option value="">Column...</option>
                                {columns.filter(c => ['number', 'currency', 'percent', 'text', 'select'].includes(c.type)).map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                              </select>
                              <select value={stage.condition.operator} onChange={e => updateStage(stage.order, { condition: { ...stage.condition!, operator: e.target.value } })}
                                className="w-12 px-1 py-1 text-[10px] border border-orange-300 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-center">
                                <option value=">">&gt;</option><option value="<">&lt;</option><option value=">=">&ge;</option><option value="<=">&le;</option><option value="=">=</option><option value="!=">≠</option>
                              </select>
                              <input type="text" value={stage.condition.value} onChange={e => updateStage(stage.order, { condition: { ...stage.condition!, value: e.target.value } })} placeholder="value"
                                className="w-20 px-2 py-1 text-[10px] border border-orange-300 rounded bg-white dark:bg-gray-800 dark:text-gray-200" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button onClick={addStage} className="w-full mt-2 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-[11px] text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">+ Add Another Stage</button>
              </div>

              <div className="flex items-center flex-wrap gap-x-4 gap-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={lockOnApprove} onChange={e => setLockOnApprove(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600" />
                  <span className="text-xs text-gray-700 dark:text-gray-300">🔒 Lock row on final approve</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={reminderEnabled} onChange={e => setReminderEnabled(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-orange-600" />
                  <span className="text-xs text-gray-700 dark:text-gray-300">⏰ Reminder after</span>
                </label>
                {reminderEnabled && (
                  <div className="flex items-center space-x-1">
                    <input type="number" value={reminderHours} onChange={e => setReminderHours(parseInt(e.target.value) || 24)} min="1"
                      className="w-14 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">hours</span>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-3 pt-3">
                <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
                <button onClick={saveWorkflow} disabled={creating || !name.trim() || !hasAnyApprovers}
                  className="px-6 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {creating ? 'Saving...' : editingWorkflowId ? 'Save Changes' : 'Create Workflow'}
                </button>
                {!hasAnyApprovers && (<span className="text-[10px] text-red-500">Each stage needs at least one approver</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}