'use client';

import { useState, useEffect } from 'react';

export function ColumnPermissionsModal({
  tableId,
  column,
  isOpen,
  onClose,
  onUpdated,
  wsSend,
}: {
  tableId: string;
  column: any;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  wsSend?: (message: any) => void;
}) {
  const [rules, setRules] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [targetType, setTargetType] = useState<'user' | 'group'>('user');
  const [selectedId, setSelectedId] = useState('');
  const [canView, setCanView] = useState(true);
  const [canEdit, setCanEdit] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchRules();
      fetchUsers();
      fetchGroups();
    }
  }, [isOpen, tableId, column?.id]);

  async function fetchRules() {
    const res = await fetch(`/api/tables/${tableId}/column-permissions`);
    if (res.ok) {
      const data = await res.json();
      setRules((data.permissions || []).filter((r: any) => r.columnId === column?.id));
    }
  }

  async function fetchUsers() {
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
    }
  }

  async function fetchGroups() {
    const res = await fetch('/api/groups');
    if (res.ok) {
      const data = await res.json();
      setGroups(data.groups || data || []);
    }
  }

  async function handleAdd() {
    if (!selectedId) return;
    setIsLoading(true);

    try {
      const body: any = {
        columnId: column.id,
        canView,
        canEdit,
      };
      if (targetType === 'user') body.userId = selectedId;
      else body.groupId = selectedId;

      const res = await fetch(`/api/tables/${tableId}/column-permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSelectedId('');
        setCanView(true);
        setCanEdit(true);
        fetchRules();
        onUpdated?.();
        wsSend?.({ type: 'column-permissions-changed', columnId: column.id });
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to add permission');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdate(ruleId: string, updates: { canView?: boolean; canEdit?: boolean }) {
    const res = await fetch(`/api/tables/${tableId}/column-permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissionId: ruleId, ...updates }),
    });

    if (res.ok) {
      setRules(prev =>
        prev.map(r => (r.id === ruleId ? { ...r, ...updates } : r))
      );
      onUpdated?.();
      wsSend?.({ type: 'column-permissions-changed', columnId: column.id });
    }
  }

  async function handleDelete(ruleId: string) {
    if (!confirm('Remove this permission rule?')) return;

    const res = await fetch(`/api/tables/${tableId}/column-permissions?permissionId=${ruleId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      setRules(prev => prev.filter(r => r.id !== ruleId));
      onUpdated?.();
      wsSend?.({ type: 'column-permissions-changed', columnId: column.id });
    }
  }

  function getRuleName(rule: any): string {
    if (rule.user) return rule.user.name || rule.user.email;
    if (rule.group) return rule.group.name;
    return 'Unknown';
  }

  function getRuleType(rule: any): string {
    return rule.user ? 'User' : 'Group';
  }

  if (!isOpen || !column) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Column Permissions</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Manage access for "{column.name}"
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                When restrictions are added, only listed users/groups will have access.
                Users not listed will lose view or edit access to this column.
                Owners and Admins always have full access.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Add access rule</label>

              <div className="flex space-x-1 mb-3 bg-gray-100 rounded-lg p-1">
                {([
                  { value: 'user', label: '👤 User' },
                  { value: 'group', label: '👥 Group' },
                ] as const).map((t) => (
                  <button
                    key={t.value}
                    onClick={() => { setTargetType(t.value); setSelectedId(''); }}
                    className={`flex-1 px-3 py-1.5 rounded-md text-sm transition-all ${
                      targetType === t.value
                        ? 'bg-white text-gray-900 shadow-sm font-medium'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              >
                <option value="">Select a {targetType}...</option>
                {targetType === 'user'
                  ? users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)
                  : groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
                }
              </select>

              <div className="flex items-center space-x-6 mb-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canView}
                    onChange={(e) => {
                      setCanView(e.target.checked);
                      if (!e.target.checked) setCanEdit(false);
                    }}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Can View</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canEdit}
                    onChange={(e) => {
                      setCanEdit(e.target.checked);
                      if (e.target.checked) setCanView(true);
                    }}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Can Edit</span>
                </label>
              </div>

              <button
                onClick={handleAdd}
                disabled={!selectedId || isLoading}
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Adding...' : 'Add Rule'}
              </button>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Access rules ({rules.length})
              </h3>

              {rules.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">No restrictions — everyone with table access can view and edit this column.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          rule.user ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                        }`}>
                          <span className="text-sm font-medium">
                            {rule.user ? (rule.user.name?.[0] || rule.user.email?.[0] || '?') : '👥'}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">{getRuleName(rule)}</span>
                            <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">
                              {getRuleType(rule)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => {
                            const newCanView = !rule.canView;
                            handleUpdate(rule.id, {
                              canView: newCanView,
                              canEdit: newCanView ? rule.canEdit : false,
                            });
                          }}
                          className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                            rule.canView
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          {rule.canView ? '👁 View' : '🚫 Hidden'}
                        </button>

                        <button
                          onClick={() => handleUpdate(rule.id, { canEdit: !rule.canEdit })}
                          className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                            rule.canEdit
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {rule.canEdit ? '✏️ Edit' : '🔒 Read-only'}
                        </button>

                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium text-sm">
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}