'use client';

import { useState, useEffect } from 'react';

const SETTINGS = [
  { key: 'onRowCreated', label: 'New row created', icon: '➕' },
  { key: 'onRowUpdated', label: 'Row updated', icon: '✏️' },
  { key: 'onRowDeleted', label: 'Row deleted', icon: '🗑️' },
  { key: 'onCommentAdded', label: 'Comment added', icon: '💬' },
  { key: 'onFormSubmission', label: 'Form submission', icon: '📋' },
  { key: 'onApprovalRequest', label: 'Approval requested', icon: '🔔' },
  { key: 'onApprovalComplete', label: 'Approval completed', icon: '✅' },
];

export function NotificationSettingsModal({ tableId, isOpen, onClose, isAdmin = false }: { tableId: string; isOpen: boolean; onClose: () => void; isAdmin?: boolean }) {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'manage'>(isAdmin ? 'manage' : 'personal');

  // Admin: force-subscribe management
  const [targets, setTargets] = useState<any>({});
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<'user' | 'group' | 'role'>('user');
  const [addSelectedId, setAddSelectedId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setActiveTab(isAdmin ? 'manage' : 'personal');

    const promises: Promise<any>[] = [
      fetch(`/api/tables/${tableId}/notification-settings`).then(r => r.json()),
    ];

    if (isAdmin) {
      promises.push(
        fetch(`/api/tables/${tableId}/notification-settings?admin=true`).then(r => r.json()),
        fetch(`/api/tables/${tableId}/members`).then(r => r.json()),
      );
    }

    Promise.all(promises).then(([personalData, targetsData, membersData]) => {
      setSettings(personalData || {});
      if (targetsData?.targets) setTargets(targetsData.targets);
      if (membersData) {
        setUsers(membersData.users || []);
        setGroups(membersData.groups || []);
        setRoles(membersData.roles || []);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [isOpen, tableId, isAdmin]);

  async function savePersonal() {
    setSaving(true);
    try {
      await fetch(`/api/tables/${tableId}/notification-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  async function saveTargets() {
    setSaving(true);
    try {
      await fetch(`/api/tables/${tableId}/notification-settings?admin=true`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  function addRecipient(eventKey: string) {
    if (!addSelectedId) return;
    const current = targets[eventKey] || [];
    const entry: any = { type: addTarget };

    if (addTarget === 'user') {
      const u = users.find(u => u.id === addSelectedId);
      entry.userId = addSelectedId;
      entry.name = u?.name || u?.email || 'Unknown';
    } else if (addTarget === 'group') {
      const g = groups.find(g => g.id === addSelectedId);
      entry.groupId = addSelectedId;
      entry.name = g?.name || 'Unknown';
    } else if (addTarget === 'role') {
      const r = roles.find(r => r.id === addSelectedId);
      entry.roleId = addSelectedId;
      entry.name = r?.name || 'Unknown';
    }

    // Duplicate check
    const exists = current.some((r: any) =>
      (entry.userId && r.userId === entry.userId) ||
      (entry.groupId && r.groupId === entry.groupId) ||
      (entry.roleId && r.roleId === entry.roleId)
    );
    if (exists) return;

    setTargets((prev: any) => ({ ...prev, [eventKey]: [...current, entry] }));
    setAddSelectedId('');
  }

  function removeRecipient(eventKey: string, index: number) {
    setTargets((prev: any) => ({
      ...prev,
      [eventKey]: (prev[eventKey] || []).filter((_: any, i: number) => i !== index),
    }));
  }

  function getOptions() {
    if (addTarget === 'user') return users.map(u => ({ id: u.id, label: u.name || u.email }));
    if (addTarget === 'group') return groups.map(g => ({ id: g.id, label: g.name }));
    if (addTarget === 'role') return roles.map(r => ({ id: r.id, label: r.name }));
    return [];
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">🔔 Notification Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs — only show if admin */}
        {isAdmin && (
          <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 flex-shrink-0">
            <button onClick={() => setActiveTab('manage')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'manage' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Manage Recipients
            </button>
            <button onClick={() => setActiveTab('personal')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'personal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              My Preferences
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" /></div>
          ) : activeTab === 'personal' ? (
            /* ============================================ */
            /* Personal preferences (same as before)        */
            /* ============================================ */
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose which events send you notifications for this table.</p>

              {SETTINGS.map(s => (
                <label key={s.key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">{s.icon}</span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{s.label}</span>
                  </div>
                  <div className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${settings[s.key] ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                    onClick={() => setSettings((prev: any) => ({ ...prev, [s.key]: !prev[s.key] }))}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings[s.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              ))}

              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                <label className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">📧</span>
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Email notifications</span>
                      <p className="text-xs text-gray-400">Receive emails in addition to in-app</p>
                    </div>
                  </div>
                  <div className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${settings.emailEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                    onClick={() => setSettings((prev: any) => ({ ...prev, emailEnabled: !prev.emailEnabled }))}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.emailEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              </div>
            </div>
          ) : (
            /* ============================================ */
            /* Admin: Manage who gets notified              */
            /* ============================================ */
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Subscribe users, groups, or roles to notification events. Subscribed users will receive notifications even if they haven't configured their own settings. Users can still personally mute events.</p>

              {SETTINGS.map(s => {
                const recipients = targets[s.key] || [];
                const isExpanded = expandedEvent === s.key;

                return (
                  <div key={s.key} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    {/* Event header */}
                    <button
                      onClick={() => setExpandedEvent(isExpanded ? null : s.key)}
                      className="flex items-center justify-between w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-base">{s.icon}</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.label}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {recipients.length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full font-medium">
                            {recipients.length} subscribed
                          </span>
                        )}
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded: recipients list + add */}
                    {isExpanded && (
                      <div className="px-4 py-3 space-y-3">
                        {/* Current recipients */}
                        {recipients.length > 0 ? (
                          <div className="space-y-1.5">
                            {recipients.map((r: any, i: number) => (
                              <div key={i} className="flex items-center justify-between py-1.5 px-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg group">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs">{r.type === 'user' ? '👤' : r.type === 'group' ? '👥' : '🛡'}</span>
                                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{r.name}</span>
                                  <span className="text-[9px] text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">{r.type}</span>
                                </div>
                                <button onClick={() => removeRecipient(s.key, i)}
                                  className="p-0.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 text-center py-2">No specific recipients — only users who self-subscribe will be notified</p>
                        )}

                        {/* Add recipient */}
                        <div className="flex items-center space-x-1.5">
                          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                            {(['user', 'group', 'role'] as const).map(t => (
                              <button key={t} onClick={() => { setAddTarget(t); setAddSelectedId(''); }}
                                className={`px-2 py-1 text-[10px] rounded-md transition-all ${addTarget === t ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm font-medium' : 'text-gray-500'}`}>
                                {t === 'user' ? '👤' : t === 'group' ? '👥' : '🛡'} {t.charAt(0).toUpperCase() + t.slice(1)}
                              </button>
                            ))}
                          </div>
                          <select value={addSelectedId} onChange={e => setAddSelectedId(e.target.value)}
                            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="">Select...</option>
                            {getOptions().map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                          <button onClick={() => addRecipient(s.key)} disabled={!addSelectedId}
                            className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                            Add
                          </button>
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
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={activeTab === 'personal' ? savePersonal : saveTargets} disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}