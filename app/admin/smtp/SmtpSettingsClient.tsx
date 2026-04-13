'use client';

import { useState, useEffect } from 'react';

export function SmtpSettingsClient() {
  const [settings, setSettings] = useState({
    smtp_host: '', smtp_port: '587', smtp_secure: 'false',
    smtp_user: '', smtp_pass: '', smtp_from: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/smtp')
      .then(r => r.json())
      .then(data => { if (!data.error) setSettings(prev => ({ ...prev, ...data })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/smtp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) setMessage('Settings saved successfully!');
      else { const err = await res.json(); setMessage(err.error || 'Failed to save'); }
    } catch { setMessage('Failed to save'); } finally { setSaving(false); }
  }

  async function sendTest() {
    if (!testEmail) return;
    setTesting(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail }),
      });
      const data = await res.json();
      setMessage(data.success ? `Test email sent to ${testEmail}!` : data.error || 'Test failed');
    } catch { setMessage('Test failed'); } finally { setTesting(false); }
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto py-8 px-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">📧 Email Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure SMTP to enable email notifications and approval emails. Passwords are encrypted at rest.</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">SMTP Host</label>
                <input type="text" value={settings.smtp_host} onChange={e => setSettings(p => ({ ...p, smtp_host: e.target.value }))}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Port</label>
                <input type="text" value={settings.smtp_port} onChange={e => setSettings(p => ({ ...p, smtp_port: e.target.value }))}
                  placeholder="587"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username / Email</label>
                <input type="text" value={settings.smtp_user} onChange={e => setSettings(p => ({ ...p, smtp_user: e.target.value }))}
                  placeholder="you@gmail.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password / App Password</label>
                <input type="password" value={settings.smtp_pass} onChange={e => setSettings(p => ({ ...p, smtp_pass: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
                <p className="text-[9px] text-gray-400 mt-1">🔒 Encrypted with AES-256-GCM before storage</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">From Address</label>
              <input type="text" value={settings.smtp_from} onChange={e => setSettings(p => ({ ...p, smtp_from: e.target.value }))}
                placeholder="Agora <notifications@yourorg.com>"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
            </div>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="checkbox" checked={settings.smtp_secure === 'true'}
                onChange={e => setSettings(p => ({ ...p, smtp_secure: e.target.checked ? 'true' : 'false' }))}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Use SSL/TLS (port 465)</span>
            </label>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <button onClick={save} disabled={saving}
              className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {message && (
              <span className={`text-sm ${message.includes('success') || message.includes('sent') ? 'text-green-600' : 'text-red-600'}`}>
                {message}
              </span>
            )}
          </div>
        </div>

        {/* Test Email */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mt-6">
          <div className="p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">🧪 Test Email</h3>
            <p className="text-xs text-gray-500 mb-3">Send a test email to verify your SMTP settings are working.</p>
            <div className="flex items-center space-x-3">
              <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
              <button onClick={sendTest} disabled={testing || !testEmail}
                className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {testing ? 'Sending...' : 'Send Test'}
              </button>
            </div>
          </div>
        </div>

        {/* Help */}
        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800 p-5 mt-6">
          <h4 className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">📘 Setup Guide</h4>
          <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1.5">
            <p><strong>Gmail:</strong> Use smtp.gmail.com, port 587. You need a Google App Password (Account → Security → 2FA → App Passwords).</p>
            <p><strong>Microsoft 365:</strong> Use smtp.office365.com, port 587. Enable SMTP AUTH in your Exchange admin.</p>
            <p><strong>Custom SMTP:</strong> Use your mail server's settings. Contact your IT admin for details.</p>
          </div>
        </div>
      </div>
    </div>
  );
}