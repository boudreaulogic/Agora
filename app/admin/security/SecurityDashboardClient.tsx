'use client';

import { useState, useEffect } from 'react';

export default function SecurityDashboardClient() {
  var [data, setData] = useState<any>(null);
  var [loading, setLoading] = useState(true);
  var [actionLoading, setActionLoading] = useState<string | null>(null);
  var [filter, setFilter] = useState('all');

  useEffect(function() { fetchData(); }, []);

  async function fetchData() {
    try {
      var res = await fetch('/api/admin/security');
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleAction(action: string, userId: string, extra?: any) {
    setActionLoading(userId + action);
    try {
      var res = await fetch('/api/admin/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action, userId: userId, ...extra }),
      });
      if (res.ok) await fetchData();
    } catch (e) { console.error(e); }
    finally { setActionLoading(null); }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading security data...</div>;
  if (!data) return <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>Failed to load security data</div>;

  var filteredActivity = data.loginActivity.filter(function(a: any) {
    if (filter === 'all') return true;
    if (filter === 'failed') return a.action === 'LOGIN_FAILED';
    if (filter === 'success') return a.action === 'LOGIN_SUCCESS';
    if (filter === 'mfa') return a.action.startsWith('MFA_');
    return true;
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 className="dark:text-gray-100" style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: 0 }}>🛡️ Security Monitoring</h1>
        <p className="dark:text-gray-400" style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Login activity, MFA management, and account security</p>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <StatCard label="Logins (24h)" value={data.stats.successLogins24h} color="#10b981" />
        <StatCard label="Failed (24h)" value={data.stats.failedLogins24h} color={data.stats.failedLogins24h > 10 ? '#ef4444' : '#f59e0b'} />
        <StatCard label="MFA Enabled" value={data.stats.mfaEnabledCount + '/' + data.stats.totalUsers} color="#3b82f6" />
        <StatCard label="Locked" value={data.stats.lockedAccounts} color={data.stats.lockedAccounts > 0 ? '#ef4444' : '#10b981'} />
        <StatCard label="Never Logged In" value={data.stats.neverLoggedIn} color="#9ca3af" />
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Users & MFA */}
        <div className="dark:bg-gray-900 dark:border-gray-700" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' }}>
          <div className="dark:text-gray-100" style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>User Security Status</div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {data.users.map(function(user: any) {
              var isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
              return (
                <div key={user.id} className="dark:border-gray-800" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #f3f4f6', fontSize: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dark:text-gray-100" style={{ fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{user.name || user.email}</div>
                    <div className="dark:text-gray-500" style={{ color: '#9ca3af', fontSize: '11px' }}>
                      {user.lastLoginAt ? 'Last login: ' + new Date(user.lastLoginAt).toLocaleDateString() : 'Never logged in'}
                      {isLocked && <span style={{ color: '#ef4444', marginLeft: '8px' }}>🔒 Locked</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {/* MFA toggle */}
                    <button
                      onClick={function() { handleAction('toggle_mfa', user.id, { mfaEnabled: !user.mfaEnabled }); }}
                      disabled={actionLoading === user.id + 'toggle_mfa'}
                      style={{
                        padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 600,
                        background: user.mfaEnabled ? '#dcfce7' : '#f3f4f6',
                        color: user.mfaEnabled ? '#166534' : '#6b7280',
                      }}
                    >
                      {user.mfaEnabled ? '🔐 MFA On' : 'MFA Off'}
                    </button>
                    {/* Reset MFA */}
                    {user.mfaEnabled && (
                      <button
                        onClick={function() { if (confirm('Reset MFA for ' + (user.name || user.email) + '? They will need to re-verify.')) handleAction('reset_mfa', user.id); }}
                        disabled={actionLoading === user.id + 'reset_mfa'}
                        style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', fontSize: '10px', color: '#dc2626' }}
                      >
                        Reset
                      </button>
                    )}
                    {/* Unlock */}
                    {isLocked && (
                      <button
                        onClick={function() { handleAction('unlock', user.id); }}
                        disabled={actionLoading === user.id + 'unlock'}
                        style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', background: '#dbeafe', cursor: 'pointer', fontSize: '10px', color: '#1d4ed8', fontWeight: 600 }}
                      >
                        Unlock
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Login Activity */}
        <div className="dark:bg-gray-900 dark:border-gray-700" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="dark:text-gray-100" style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>Login Activity</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['all', 'success', 'failed', 'mfa'].map(function(f) {
                return (
                  <button key={f} onClick={function() { setFilter(f); }}
                    style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: filter === f ? 600 : 400, background: filter === f ? '#dbeafe' : '#f3f4f6', color: filter === f ? '#1d4ed8' : '#6b7280' }}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {filteredActivity.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>No activity found</p>
            ) : (
              filteredActivity.map(function(log: any) {
                var actionColors: Record<string, { bg: string; fg: string }> = {
                  LOGIN_SUCCESS: { bg: '#dcfce7', fg: '#166534' },
                  LOGIN_FAILED: { bg: '#fee2e2', fg: '#991b1b' },
                  MFA_CODE_SENT: { bg: '#dbeafe', fg: '#1d4ed8' },
                  MFA_VERIFY_SUCCESS: { bg: '#dcfce7', fg: '#166534' },
                  MFA_VERIFY_FAILED: { bg: '#fee2e2', fg: '#991b1b' },
                  MFA_ENABLED: { bg: '#dbeafe', fg: '#1d4ed8' },
                  MFA_DISABLED: { bg: '#f3f4f6', fg: '#6b7280' },
                  ADMIN_MFA_ENABLED: { bg: '#ede9fe', fg: '#5b21b6' },
                  ADMIN_MFA_DISABLED: { bg: '#f3f4f6', fg: '#6b7280' },
                  ADMIN_MFA_RESET: { bg: '#fef3c7', fg: '#92400e' },
                  ADMIN_ACCOUNT_UNLOCKED: { bg: '#dbeafe', fg: '#1d4ed8' },
                };
                var c = actionColors[log.action] || { bg: '#f3f4f6', fg: '#6b7280' };
                var meta = log.metadata || {};

                return (
                  <div key={log.id} className="dark:border-gray-800" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f9fafb', fontSize: '11px' }}>
                    <span style={{ padding: '1px 6px', borderRadius: '3px', background: c.bg, color: c.fg, fontWeight: 600, fontSize: '9px', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const, flexShrink: 0, marginTop: '2px' }}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="dark:text-gray-300" style={{ color: '#374151' }}>{log.user?.name || log.user?.email || 'Unknown'}</span>
                      {meta.email && <span className="dark:text-gray-500" style={{ color: '#9ca3af', marginLeft: '4px' }}>({meta.email})</span>}
                      {meta.reason && <span style={{ color: '#dc2626', marginLeft: '4px' }}>— {meta.reason}</span>}
                    </div>
                    <span className="dark:text-gray-500" style={{ color: '#9ca3af', fontSize: '10px', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                      {new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div className="dark:bg-gray-900 dark:border-gray-700" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
      <div style={{ fontSize: '24px', fontWeight: 700, color: color }}>{value}</div>
      <div className="dark:text-gray-400" style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{label}</div>
    </div>
  );
}