'use client';

import { useState, useEffect } from 'react';

export function GoogleSheetsSettingsClient() {
  const [serviceEmail, setServiceEmail] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/google-sheets');
      if (res.ok) {
        const data = await res.json();
        setServiceEmail(data.serviceEmail || '');
        setIsConfigured(data.isConfigured || false);
        // Never return the actual key — just show if it's set
        if (data.isConfigured) {
          setServiceKey('••••••••••••••••••••••••••••••••');
        }
      }
    } catch {} finally { setLoading(false); }
  }

  async function handleSave() {
    if (!serviceEmail.trim()) {
      alert('Service account email is required');
      return;
    }
    if (!serviceKey.trim() || serviceKey === '••••••••••••••••••••••••••••••••') {
      if (!isConfigured) {
        alert('Service account key is required');
        return;
      }
      // Key hasn't changed — only update email
    }

    setSaving(true);
    setTestResult(null);
    try {
      const body: any = { serviceEmail: serviceEmail.trim() };
      if (serviceKey !== '••••••••••••••••••••••••••••••••') {
        body.serviceKey = serviceKey.trim();
      }

      const res = await fetch('/api/admin/google-sheets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setIsConfigured(true);
        setServiceKey('••••••••••••••••••••••••••••••••');
        setShowKey(false);
        setTestResult({ success: true, message: 'Settings saved successfully' });
      } else {
        const data = await res.json();
        setTestResult({ success: false, message: data.error || 'Failed to save settings' });
      }
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/google-sheets/test', { method: 'POST' });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.success ? 'Connection successful! The service account is working.' : (data.error || 'Connection failed'),
      });
    } catch {
      setTestResult({ success: false, message: 'Failed to test connection' });
    } finally { setTesting(false); }
  }

  async function handleDisconnect() {
    if (!confirm('Remove Google Sheets credentials? Existing connected sheets will stop syncing.')) return;
    const res = await fetch('/api/admin/google-sheets', { method: 'DELETE' });
    if (res.ok) {
      setServiceEmail('');
      setServiceKey('');
      setIsConfigured(false);
      setTestResult(null);
    }
  }

  if (loading) {
    return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Google Sheets Integration</h1>
        <p className="text-sm text-gray-500 mt-1">Connect a Google service account to enable Google Sheets integration for all users.</p>
      </div>

      {/* Status Banner */}
      <div className={`rounded-lg p-4 mb-6 border ${isConfigured ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center space-x-3">
          <span className="text-xl">{isConfigured ? '✅' : '⚠️'}</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {isConfigured ? 'Google Sheets Connected' : 'Not Configured'}
            </h3>
            <p className="text-xs text-gray-600 mt-0.5">
              {isConfigured
                ? 'Users can connect Google Sheets by pasting a sheet URL and sharing it with the service account.'
                : 'Set up a Google service account to enable Google Sheets integration.'}
            </p>
          </div>
        </div>
      </div>

      {/* Setup Guide */}
      {!isConfigured && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Setup Guide</h3>
          <ol className="text-xs text-blue-800 space-y-1.5 list-decimal ml-4">
            <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener" className="underline font-medium">Google Cloud Console</a></li>
            <li>Create a project (or use existing) and enable the <strong>Google Sheets API</strong></li>
            <li>Go to <strong>IAM & Admin → Service Accounts → Create Service Account</strong></li>
            <li>Name it (e.g., "Agora Bot"), skip the role, click Done</li>
            <li>Click on the service account → <strong>Keys → Add Key → JSON</strong></li>
            <li>Copy the service account email and paste the JSON key contents below</li>
          </ol>
        </div>
      )}

      {/* Credentials Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Service Account Email</label>
          <input
            type="email"
            value={serviceEmail}
            onChange={(e) => setServiceEmail(e.target.value)}
            placeholder="agora-bot@your-project.iam.gserviceaccount.com"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">This is the email users will share their Google Sheets with</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Service Account Key (JSON)</label>
            {isConfigured && (
              <button onClick={() => { setShowKey(!showKey); if (!showKey) setServiceKey(''); }}
                className="text-xs text-blue-600 hover:text-blue-800">
                {showKey ? 'Cancel change' : 'Change key'}
              </button>
            )}
          </div>
          {(!isConfigured || showKey) ? (
            <textarea
              value={serviceKey === '••••••••••••••••••••••••••••••••' ? '' : serviceKey}
              onChange={(e) => setServiceKey(e.target.value)}
              placeholder='Paste the entire JSON key file contents here...'
              rows={6}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
            />
          ) : (
            <div className="px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500 font-mono">
              ••••••••••••••••••••••••••••••••
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">The private key is encrypted before storage and never displayed again</p>
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`p-3 rounded-lg border ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <p className={`text-xs font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
              {testResult.success ? '✅' : '❌'} {testResult.message}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-200">
          <div className="flex items-center space-x-2">
            {isConfigured && (
              <>
                <button onClick={handleTest} disabled={testing}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                <button onClick={handleDisconnect}
                  className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                  Disconnect
                </button>
              </>
            )}
          </div>
          <button onClick={handleSave} disabled={saving || !serviceEmail.trim()}
            className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* User Instructions */}
      {isConfigured && (
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">How Users Connect a Sheet</h3>
          <ol className="text-xs text-gray-600 space-y-1 list-decimal ml-4">
            <li>Click "+ Create Table" and choose "Connect Google Sheet"</li>
            <li>Paste the Google Sheet URL</li>
            <li>Share the sheet with <code className="bg-gray-200 px-1.5 py-0.5 rounded font-mono text-[11px]">{serviceEmail}</code> as an Editor</li>
            <li>Click Connect — tabs from the sheet appear as tables in Agora</li>
          </ol>
        </div>
      )}
    </div>
  );
}