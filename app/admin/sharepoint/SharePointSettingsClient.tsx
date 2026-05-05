'use client';

import { useState, useEffect } from 'react';

export function SharePointSettingsClient() {
  var ss = useState({ sp_client_id: '', sp_client_secret: '', sp_tenant_id: '', sp_site_url: '' });
  var settings = ss[0]; var setSettings = ss[1];
  var ls = useState(true); var loading = ls[0]; var setLoading = ls[1];
  var svs = useState(false); var saving = svs[0]; var setSaving = svs[1];
  var ms = useState(''); var message = ms[0]; var setMessage = ms[1];
  var mts = useState<'success'|'error'|''>(''); var messageType = mts[0]; var setMessageType = mts[1];
  var ts = useState(false); var testing = ts[0]; var setTesting = ts[1];
  var trs = useState<any>(null); var testResult = trs[0]; var setTestResult = trs[1];
  var lls = useState(false); var loadingLists = lls[0]; var setLoadingLists = lls[1];
  var lis = useState<any[]>([]); var lists = lis[0]; var setLists = lis[1];
  var sis = useState(''); var siteId = sis[0]; var setSiteId = sis[1];

  useEffect(function() {
    fetch('/api/admin/sharepoint')
      .then(function(r) { return r.json(); })
      .then(function(data) { if (!data.error) setSettings(function(prev) { return Object.assign({}, prev, data); }); })
      .catch(function() {})
      .finally(function() { setLoading(false); });
  }, []);

  async function save() {
    setSaving(true); setMessage(''); setMessageType('');
    try {
      var res = await fetch('/api/admin/sharepoint', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      if (res.ok) { setMessage('Settings saved!'); setMessageType('success'); }
      else { var err = await res.json(); setMessage(err.error || 'Failed to save'); setMessageType('error'); }
    } catch { setMessage('Failed to save'); setMessageType('error'); }
    finally { setSaving(false); }
  }

  async function testConnection() {
    setTesting(true); setTestResult(null); setMessage(''); setMessageType('');
    try {
      var res = await fetch('/api/admin/sharepoint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test' }) });
      var data = await res.json();
      setTestResult(data);
      if (data.success) { setMessage('Connected to: ' + data.siteName); setMessageType('success'); }
      else { setMessage(data.error || 'Connection failed'); setMessageType('error'); }
    } catch { setMessage('Connection test failed'); setMessageType('error'); }
    finally { setTesting(false); }
  }

  async function fetchLists() {
    setLoadingLists(true);
    try {
      var res = await fetch('/api/admin/sharepoint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_lists' }) });
      var data = await res.json();
      if (data.error) { setMessage(data.error); setMessageType('error'); return; }
      setLists(data.lists || []);
      setSiteId(data.siteId || '');
      setMessage('Found ' + (data.lists || []).length + ' lists'); setMessageType('success');
    } catch { setMessage('Failed to fetch lists'); setMessageType('error'); }
    finally { setLoadingLists(false); }
  }

  if (loading) return (<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto py-8 px-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">SharePoint Integration</h1>
          <p className="text-sm text-gray-500 mt-1">Connect Agora to SharePoint via Microsoft Graph API. Form submissions, row updates, and approval completions can automatically sync to SharePoint lists.</p>
        </div>

        {message && (
          <div className={'mb-4 px-4 py-3 rounded-lg text-sm ' + (messageType === 'success' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400')}>
            {message}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-6 space-y-4">
            <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Azure AD App Registration</h2>
              <p className="text-xs text-gray-400 mt-1">Register an app in Azure Portal → App Registrations. Add Microsoft Graph → Application permission → Sites.ReadWrite.All and grant admin consent.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tenant ID</label>
                <input type="text" value={settings.sp_tenant_id} onChange={function(e) { setSettings(function(p) { return Object.assign({}, p, { sp_tenant_id: e.target.value }); }); }}
                  placeholder="9adef3c7-ffc8-..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Client ID (Application ID)</label>
                <input type="text" value={settings.sp_client_id} onChange={function(e) { setSettings(function(p) { return Object.assign({}, p, { sp_client_id: e.target.value }); }); }}
                  placeholder="93d57b98-9431-..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 font-mono" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Client Secret</label>
              <input type="password" value={settings.sp_client_secret} onChange={function(e) { setSettings(function(p) { return Object.assign({}, p, { sp_client_secret: e.target.value }); }); }}
                placeholder="h0Q8Q~..."
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 font-mono" />
              <p className="text-[10px] text-gray-400 mt-1">Encrypted at rest. Generate from Azure Portal → Certificates & Secrets.</p>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">SharePoint Site</h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Site URL</label>
              <input type="text" value={settings.sp_site_url} onChange={function(e) { setSettings(function(p) { return Object.assign({}, p, { sp_site_url: e.target.value }); }); }}
                placeholder="https://yourtenant.sharepoint.com/sites/YourSite"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
              <p className="text-[10px] text-gray-400 mt-1">The SharePoint site that contains the lists you want to sync with.</p>
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between rounded-b-xl">
            <div className="flex items-center space-x-2">
              <button onClick={testConnection} disabled={testing || !settings.sp_client_id || !settings.sp_tenant_id}
                className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50">
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button onClick={fetchLists} disabled={loadingLists || !testResult?.success}
                className="px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-700 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50">
                {loadingLists ? 'Loading...' : 'Browse Lists'}
              </button>
            </div>
            <button onClick={save} disabled={saving}
              className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {testResult && (
          <div className={'mt-4 p-4 rounded-xl border ' + (testResult.success ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800')}>
            <div className="flex items-center space-x-2">
              <span className="text-lg">{testResult.success ? '✅' : '❌'}</span>
              <div>
                <p className={'text-sm font-semibold ' + (testResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>
                  {testResult.success ? 'Connected to ' + testResult.siteName : 'Connection Failed'}
                </p>
                {testResult.error && <p className="text-xs text-red-500 mt-1">{testResult.error}</p>}
              </div>
            </div>
          </div>
        )}

        {lists.length > 0 && (
          <div className="mt-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">SharePoint Lists ({lists.length})</h3>
              <p className="text-xs text-gray-400 mt-0.5">These lists are available for sync. Configure per-table sync in each table's settings.</p>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {lists.map(function(list: any) {
                return (
                  <div key={list.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{list.displayName}</p>
                      {list.description && <p className="text-xs text-gray-400">{list.description}</p>}
                    </div>
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{list.id.slice(0, 8)}...</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl">
          <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">How to set up SharePoint sync</h3>
          <ol className="text-xs text-blue-700 dark:text-blue-400 space-y-1.5">
            <li>1. Register an app in <strong>Azure Portal → App Registrations</strong></li>
            <li>2. Add API permission: <strong>Microsoft Graph → Application → Sites.ReadWrite.All</strong></li>
            <li>3. <strong>Grant admin consent</strong> for the permission</li>
            <li>4. Create a <strong>Client Secret</strong> under Certificates & Secrets</li>
            <li>5. Enter your Tenant ID, Client ID, and Secret above</li>
            <li>6. Enter your SharePoint site URL and click <strong>Test Connection</strong></li>
            <li>7. Go to any table → <strong>SharePoint Sync</strong> tab to map fields and enable auto-sync</li>
          </ol>
        </div>
      </div>
    </div>
  );
}