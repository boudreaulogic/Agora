'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const PERMISSION_LEVELS = [
  { value: 'viewer', label: 'Viewer', description: 'Can view data only', color: 'bg-gray-100 text-gray-800' },
  { value: 'editor', label: 'Editor', description: 'Can add and edit data', color: 'bg-blue-100 text-blue-800' },
  { value: 'admin', label: 'Admin', description: 'Can manage structure and permissions', color: 'bg-purple-100 text-purple-800' },
];

type ShareTarget = 'user' | 'group' | 'role';

export function ShareTableModal({
  tableId,
  workspaceId,
  workspaceName,
  isOpen,
  onClose,
}: {
  tableId: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [shares, setShares] = useState<any[]>([]);
  const [owner, setOwner] = useState<any>(null);
  const [rowLevelSecurity, setRowLevelSecurity] = useState(false);
  const [inheritPermissions, setInheritPermissions] = useState(true);
  const [isTogglingInherit, setIsTogglingInherit] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);

  const [shareTarget, setShareTarget] = useState<ShareTarget>('user');
  const [selectedId, setSelectedId] = useState('');
  const [selectedPermission, setSelectedPermission] = useState('viewer');
  const [isLoading, setIsLoading] = useState(false);
  const [isTogglingRLS, setIsTogglingRLS] = useState(false);
  const [activeTab, setActiveTab] = useState<'share' | 'settings'>('share');

  useEffect(() => {
    if (isOpen) {
      fetchAll();
    }
  }, [isOpen, tableId]);

  async function fetchAll() {
    await Promise.all([fetchUsers(), fetchGroups(), fetchRoles(), fetchShares(), fetchTableInfo()]);
    if (workspaceId) fetchWorkspaceMembers();
  }

  async function fetchTableInfo() {
    // inheritPermissions is now included in fetchShares response — this is a no-op
  }

  async function fetchWorkspaceMembers() {
    if (!workspaceId) return;
    const res = await fetch(`/api/workspaces/${workspaceId}`);
    if (res.ok) {
      const data = await res.json();
      setWorkspaceMembers(data.workspace?.members || []);
    }
  }

  async function handleToggleInheritance() {
    setIsTogglingInherit(true);
    try {
      const newValue = !inheritPermissions;
      const res = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inheritPermissions: newValue }),
      });
      if (res.ok) {
        setInheritPermissions(newValue);
        fetchShares();
        router.refresh();
      }
    } finally {
      setIsTogglingInherit(false);
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

  async function fetchRoles() {
    const res = await fetch('/api/roles');
    if (res.ok) {
      const data = await res.json();
      setRoles(data.roles || data || []);
    }
  }

  async function fetchShares() {
    const res = await fetch(`/api/tables/${tableId}/shares`);
    if (res.ok) {
      const data = await res.json();
      setShares(data.shares || []);
      setOwner(data.owner || null);
      setRowLevelSecurity(data.rowLevelSecurity || false);
      if (data.inheritPermissions !== undefined) {
        setInheritPermissions(data.inheritPermissions !== false);
      }
    }
  }

  async function handleShare() {
    if (!selectedId) return;

    setIsLoading(true);
    try {
      const body: any = { permission: selectedPermission };
      if (shareTarget === 'user') body.userId = selectedId;
      else if (shareTarget === 'group') body.groupId = selectedId;
      else if (shareTarget === 'role') body.roleId = selectedId;

      const res = await fetch(`/api/tables/${tableId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSelectedId('');
        setSelectedPermission('viewer');
        fetchShares();
        router.refresh();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to share table');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdatePermission(shareId: string, permission: string) {
    const res = await fetch(`/api/tables/${tableId}/shares`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId, permission }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.transferred) {
        // Ownership was transferred — reload to get fresh state
        router.refresh();
        fetchShares();
        return;
      }
      setShares(prev =>
        prev.map(s => (s.id === shareId ? { ...s, permission } : s))
      );
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to update permission');
    }
  }

  async function handleUnshare(shareId: string) {
    if (!confirm('Remove access for this user/group/role?')) return;

    const res = await fetch(`/api/tables/${tableId}/shares/${shareId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      fetchShares();
      router.refresh();
    }
  }

  async function handleToggleRLS() {
    setIsTogglingRLS(true);
    try {
      const res = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowLevelSecurity: !rowLevelSecurity }),
      });
      if (res.ok) {
        setRowLevelSecurity(!rowLevelSecurity);
      }
    } finally {
      setIsTogglingRLS(false);
    }
  }

  function getShareName(share: any): string {
    if (share.user) return share.user.name || share.user.email;
    if (share.group) return share.group.name;
    if (share.role) return share.role.name;
    return 'Unknown';
  }

  function getShareType(share: any): string {
    if (share.user) return 'User';
    if (share.group) return 'Group';
    if (share.role) return 'Role';
    return '';
  }

  function getShareIcon(share: any): string {
    if (share.user) return share.user.name?.[0] || share.user.email?.[0] || '?';
    if (share.group) return '👥';
    if (share.role) return '🛡';
    return '?';
  }

  function getShareIconBg(share: any): string {
    if (share.user) return 'bg-blue-100 text-blue-600';
    if (share.group) return 'bg-green-100 text-green-600';
    if (share.role) return 'bg-purple-100 text-purple-600';
    return 'bg-gray-100 text-gray-600';
  }

  function getPermissionBadge(permission: string) {
    const level = PERMISSION_LEVELS.find(p => p.value === permission);
    return level || PERMISSION_LEVELS[0];
  }

  // Get dropdown options based on target type
  function getOptions() {
    if (shareTarget === 'user') return users.map(u => ({ id: u.id, label: u.name || u.email }));
    if (shareTarget === 'group') return groups.map(g => ({ id: g.id, label: g.name }));
    if (shareTarget === 'role') return roles.map(r => ({ id: r.id, label: r.name }));
    return [];
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Share & Permissions</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage who has access and what they can do</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 flex-shrink-0">
            <button
              onClick={() => setActiveTab('share')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'share'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              People & Groups
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Security Settings
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activeTab === 'share' ? (
              <div className="space-y-6">
                {/* Workspace Inheritance Banner */}
                {workspaceId && (
                  <div className={`rounded-lg p-4 border ${inheritPermissions ? 'bg-purple-50 border-purple-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-lg">{inheritPermissions ? '🔗' : '🔓'}</span>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">
                            {inheritPermissions ? 'Inheriting from workspace' : 'Custom permissions'}
                          </h3>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {inheritPermissions
                              ? `This table uses permissions from "${workspaceName || 'workspace'}". Members of the workspace automatically get access.`
                              : `This table has its own permissions, independent of "${workspaceName || 'workspace'}".`
                            }
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleToggleInheritance}
                        disabled={isTogglingInherit}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          inheritPermissions
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-amber-600 text-white hover:bg-amber-700'
                        } ${isTogglingInherit ? 'opacity-50' : ''}`}
                      >
                        {isTogglingInherit ? '...' : inheritPermissions ? 'Break Inheritance' : 'Restore Inheritance'}
                      </button>
                    </div>
                    {inheritPermissions && workspaceMembers.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-purple-200">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Workspace members with access:</p>
                        <div className="space-y-1.5">
                          {workspaceMembers.map((m: any) => (
                            <div key={m.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center space-x-2">
                                <span className="text-gray-500 dark:text-gray-400">{m.user ? '👤' : m.group ? '👥' : '🛡'}</span>
                                <span className="text-gray-700 dark:text-gray-300">{m.user?.name || m.user?.email || m.group?.name || m.role?.name || 'Unknown'}</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full font-medium ${
                                m.permission === 'owner' ? 'bg-amber-100 text-amber-800' :
                                m.permission === 'admin' ? 'bg-purple-100 text-purple-800' :
                                m.permission === 'editor' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>{m.permission}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Add Access — only show when NOT inheriting, or when no workspace */}
                {(!workspaceId || !inheritPermissions) && (<div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Grant access
                  </label>

                  {/* Target type selector */}
                  <div className="flex space-x-1 mb-3 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                    {([
                      { value: 'user', label: 'User', icon: '👤' },
                      { value: 'group', label: 'Group', icon: '👥' },
                      { value: 'role', label: 'Role', icon: '🛡' },
                    ] as const).map((t) => (
                      <button
                        key={t.value}
                        onClick={() => {
                          setShareTarget(t.value);
                          setSelectedId('');
                        }}
                        className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
                          shareTarget === t.value
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm font-medium'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                      >
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Select target + permission + share button */}
                  <div className="flex space-x-2">
                    <select
                      value={selectedId}
                      onChange={(e) => setSelectedId(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="">
                        Select a {shareTarget}...
                      </option>
                      {getOptions().map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedPermission}
                      onChange={(e) => setSelectedPermission(e.target.value)}
                      className="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                    >
                      {PERMISSION_LEVELS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleShare}
                      disabled={!selectedId || isLoading}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isLoading ? '...' : 'Add'}
                    </button>
                  </div>
                </div>)}

                {/* Access List — only show when NOT inheriting */}
                {(!workspaceId || !inheritPermissions) && (<div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    People with access
                  </h3>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {/* Owner (always first, can't be removed) */}
                    {owner && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-amber-600">
                              {owner.name?.[0] || owner.email?.[0] || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {owner.name || owner.email}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{owner.email}</p>
                          </div>
                        </div>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                          Owner
                        </span>
                      </div>
                    )}

                    {/* Shares */}
                    {shares.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                        No one else has access yet.
                      </p>
                    )}

                    {shares.map((share) => {
                      const badge = getPermissionBadge(share.permission);
                      return (
                        <div
                          key={share.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg group"
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getShareIconBg(share)}`}>
                              <span className="text-sm font-medium">
                                {getShareIcon(share)}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {getShareName(share)}
                                </p>
                                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                  {getShareType(share)}
                                </span>
                              </div>
                              {share.user?.email && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">{share.user.email}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <select
                              value={share.permission}
                              onChange={(e) => {
                                if (e.target.value === 'owner') {
                                  if (confirm(`Transfer ownership of this table to ${getShareName(share)}? You will become an Admin.`)) {
                                    handleUpdatePermission(share.id, 'owner');
                                  } else {
                                    e.target.value = share.permission;
                                  }
                                } else {
                                  handleUpdatePermission(share.id, e.target.value);
                                }
                              }}
                              className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${badge.color}`}
                            >
                              {PERMISSION_LEVELS.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
                                </option>
                              ))}
                              {share.user && (
                                <option value="owner">Transfer Ownership</option>
                              )}
                            </select>
                            <button
                              onClick={() => handleUnshare(share.id)}
                              className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                              title="Remove access"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>)}

                {/* Permission Legend */}
                {(!workspaceId || !inheritPermissions) && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Permission Levels</h4>
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Owner</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Full control + can transfer ownership</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Admin</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Manage structure, permissions, lock rows + inherits Editor</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Editor</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Add and edit data + inherits Viewer</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Viewer</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">View data only</span>
                    </div>
                  </div>
                </div>
                )}
              </div>
            ) : (
              /* Security Settings Tab */
              <div className="space-y-6">
                {/* Row-Level Security */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Row-Level Security</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        When enabled, users can only see rows they created. Owners and admins can see all rows.
                      </p>
                    </div>
                    <button
                      onClick={handleToggleRLS}
                      disabled={isTogglingRLS}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        rowLevelSecurity ? 'bg-blue-600' : 'bg-gray-300'
                      } ${isTogglingRLS ? 'opacity-50' : ''}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        rowLevelSecurity ? 'translate-x-5.5 left-0.5' : 'left-0.5'
                      }`} style={{ transform: rowLevelSecurity ? 'translateX(22px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                  {rowLevelSecurity && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs text-amber-800">
                        🔒 Row-level security is active. Users with Viewer or Editor access will only see rows they created. Owners and Admins see all rows.
                      </p>
                    </div>
                  )}
                </div>

                {/* Row Locking Info */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Row Locking</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Only Owners and Admins can lock or unlock rows.
                    Locked rows become read-only for Editors and Viewers.
                  </p>
                  <div className="mt-3 flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">🔒 Lock</span>
                    <span>button appears in the row expand panel</span>
                  </div>
                </div>

                {/* Column Permissions Info */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Column Permissions</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Only Owners and Admins can control column visibility and edit access.
                    Right-click a column header to manage column-level permissions.
                  </p>
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-800">
                      ℹ️ Column permissions are configured per-column from the column header menu in the table view. Only visible to Owners and Admins.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium text-sm"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}