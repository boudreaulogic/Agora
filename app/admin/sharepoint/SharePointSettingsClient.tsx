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
  var bus = useState(''); var browseUrl = bus[0]; var setBrowseUrl = bus[1];
  var bsus = useState(''); var browsedSiteUrl = bsus[0]; var setBrowsedSiteUrl = bsus[1];

  // Catalog of configured connections + the groups available to grant access to.
  var cns = useState<any[]>([]); var connections = cns[0]; var setConnections = cns[1];
  var grs = useState<any[]>([]); var groups = grs[0]; var setGroups = grs[1];
  var adds = useState<Record<string, boolean>>({}); var adding = adds[0]; var setAdding = adds[1];

  // "Register by List ID" (list-scoped / Lists.SelectedOperations.Selected beta)
  var bidn = useState(''); var byIdName = bidn[0]; var setByIdName = bidn[1];
  var bidu = useState(''); var byIdSiteUrl = bidu[0]; var setByIdSiteUrl = bidu[1];
  var bidsi = useState(''); var byIdSiteId = bidsi[0]; var setByIdSiteId = bidsi[1];
  var bidli = useState(''); var byIdListId = bidli[0]; var setByIdListId = bidli[1];
  var bidr = useState(false); var registeringById = bidr[0]; var setRegisteringById = bidr[1];

  useEffect(function() {
    fetch('/api/admin/sharepoint')
      .then(function(r) { return r.json(); })
      .then(function(data) { if (!data.error) setSettings(function(prev) { return Object.assign({}, prev, data); }); })
      .catch(function() {})
      .finally(function() { setLoading(false); });
    refreshConnections();
    fetch('/api/groups')
      .then(function(r) { return r.json(); })
      .then(function(data) { setGroups(data.groups || []); })
      .catch(function() {});
  }, []);

  function refreshConnections() {
    fetch('/api/admin/sharepoint/connections')
      .then(function(r) { return r.json(); })
      .then(function(data) { if (!data.error) setConnections(data.connections || []); })
      .catch(function() {});
  }

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
    setLoadingLists(true); setMessage(''); setMessageType('');
    try {
      var res = await fetch('/api/admin/sharepoint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_lists', siteUrl: browseUrl.trim() || undefined }) });
      var data = await res.json();
      if (data.error) { setMessage(data.error); setMessageType('error'); return; }
      setLists(data.lists || []);
      setBrowsedSiteUrl(data.siteUrl || '');
      setMessage('Found ' + (data.lists || []).length + ' lists on ' + (data.siteUrl || 'the site')); setMessageType('success');
    } catch { setMessage('Failed to fetch lists'); setMessageType('error'); }
    finally { setLoadingLists(false); }
  }

  async function addToCatalog(list: any) {
    setAdding(function(p) { var n = Object.assign({}, p); n[list.id] = true; return n; });
    setMessage(''); setMessageType('');
    try {
      var res = await fetch('/api/admin/sharepoint/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: list.displayName, description: list.description || '', siteUrl: browsedSiteUrl, listId: list.id, listName: list.displayName }),
      });
      var data = await res.json();
      if (!res.ok) { setMessage(data.error || 'Failed to add list'); setMessageType('error'); return; }
      setMessage('Added "' + list.displayName + '" to the catalog. Grant group access below.'); setMessageType('success');
      refreshConnections();
    } catch { setMessage('Failed to add list'); setMessageType('error'); }
    finally { setAdding(function(p) { var n = Object.assign({}, p); delete n[list.id]; return n; }); }
  }

  async function registerById() {
    if (!byIdName.trim() || !byIdSiteId.trim() || !byIdListId.trim()) {
      setMessage('Name, Site ID, and List ID are required.'); setMessageType('error'); return;
    }
    setRegisteringById(true); setMessage(''); setMessageType('');
    try {
      var res = await fetch('/api/admin/sharepoint/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: byIdName.trim(),
          siteUrl: byIdSiteUrl.trim(),
          siteId: byIdSiteId.trim(),
          listId: byIdListId.trim(),
        }),
      });
      var data = await res.json();
      if (!res.ok) { setMessage(data.error || 'Failed to register list'); setMessageType('error'); return; }
      setMessage('Registered "' + byIdName.trim() + '". Grant group access below.'); setMessageType('success');
      setByIdName(''); setByIdSiteUrl(''); setByIdSiteId(''); setByIdListId('');
      refreshConnections();
    } catch { setMessage('Failed to register list'); setMessageType('error'); }
    finally { setRegisteringById(false); }
  }

  async function patchConnection(id: string, body: any) {
    try {
      var res = await fetch('/api/admin/sharepoint/connections/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var data = await res.json();
      if (!res.ok) { setMessage(data.error || 'Failed to update'); setMessageType('error'); return; }
      refreshConnections();
    } catch { setMessage('Failed to update connection'); setMessageType('error'); }
  }

  async function deleteConnection(id: string, name: string) {
    if (!confirm('Remove "' + name + '" from the catalog? Users will no longer be able to import it. Existing tables are not affected.')) return;
    try {
      var res = await fetch('/api/admin/sharepoint/connections/' + id, { method: 'DELETE' });
      if (!res.ok) { var d = await res.json(); setMessage(d.error || 'Failed to delete'); setMessageType('error'); return; }
      refreshConnections();
    } catch { setMessage('Failed to delete connection'); setMessageType('error'); }
  }

  function toggleGroup(conn: any, groupId: string) {
    var current = (conn.access || []).map(function(a: any) { return a.groupId; });
    var next = current.indexOf(groupId) >= 0
      ? current.filter(function(g: string) { return g !== groupId; })
      : current.concat([groupId]);
    patchConnection(conn.id, { groupIds: next });
  }

  function isCataloged(listId: string): boolean {
    return connections.some(function(c) { return c.listId === listId; });
  }

  if (loading) return (<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto py-8 px-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">SharePoint Integration</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Connect Agora to SharePoint via Microsoft Graph. Register specific lists below, then grant groups access — users only see the lists you allow.</p>
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
              <p className="text-xs text-gray-400 mt-1">Register an app in Entra → App Registrations. Add Microsoft Graph → Application permission <strong>Sites.Selected</strong> and grant admin consent, then grant the app access to each site you want to use.</p>
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
              <p className="text-[10px] text-gray-400 mt-1">Encrypted at rest. Generate from Entra → Certificates &amp; Secrets.</p>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Default SharePoint Site</h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Site URL</label>
              <input type="text" value={settings.sp_site_url} onChange={function(e) { setSettings(function(p) { return Object.assign({}, p, { sp_site_url: e.target.value }); }); }}
                placeholder="https://yourtenant.sharepoint.com/sites/YourSite"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
              <p className="text-[10px] text-gray-400 mt-1">The default site to browse. You can browse any other granted site below.</p>
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between rounded-b-xl">
            <button onClick={testConnection} disabled={testing || !settings.sp_client_id || !settings.sp_tenant_id}
              className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50">
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
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

        {/* Browse a site's lists and register them */}
        <div className="mt-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Register Lists</h3>
            <p className="text-xs text-gray-400 mt-0.5">Browse a site's lists and add the ones you want to make available in Agora.</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Site URL to browse (optional — defaults to the site above)</label>
                <input type="text" value={browseUrl} onChange={function(e) { setBrowseUrl(e.target.value); }}
                  placeholder={settings.sp_site_url || 'https://yourtenant.sharepoint.com/sites/AnotherSite'}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
              </div>
              <button onClick={fetchLists} disabled={loadingLists}
                className="px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-700 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50">
                {loadingLists ? 'Loading...' : 'Browse Lists'}
              </button>
            </div>

            {lists.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                {lists.map(function(list: any) {
                  var cataloged = isCataloged(list.id);
                  return (
                    <div key={list.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{list.displayName}</p>
                        {list.description && <p className="text-xs text-gray-400">{list.description}</p>}
                      </div>
                      {cataloged ? (
                        <span className="text-[11px] font-medium text-green-600 dark:text-green-400">✓ In catalog</span>
                      ) : (
                        <button onClick={function() { addToCatalog(list); }} disabled={!!adding[list.id]}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          {adding[list.id] ? 'Adding...' : 'Add to catalog'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-3 mt-1 border-t border-dashed border-gray-200 dark:border-gray-700">
              <p className="text-xs font-bold text-gray-600 dark:text-gray-300">Register by List ID <span className="font-normal text-gray-400">— for list-scoped grants (Lists.SelectedOperations.Selected, beta)</span></p>
              <p className="text-[11px] text-gray-400 mt-0.5 mb-2">When the app is granted only specific lists it can't browse a site. Grant the list in PowerShell, then paste the Site ID and List ID it printed.</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={byIdName} onChange={function(e) { setByIdName(e.target.value); }} placeholder="Friendly name (e.g. Facility Requests)"
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
                <input type="text" value={byIdSiteUrl} onChange={function(e) { setByIdSiteUrl(e.target.value); }} placeholder="Site URL (optional, for display)"
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200" />
                <input type="text" value={byIdSiteId} onChange={function(e) { setByIdSiteId(e.target.value); }} placeholder="Site ID (host,guid,guid)"
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 font-mono text-xs" />
                <input type="text" value={byIdListId} onChange={function(e) { setByIdListId(e.target.value); }} placeholder="List ID (guid)"
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 font-mono text-xs" />
              </div>
              <div className="flex justify-end mt-2">
                <button onClick={registerById} disabled={registeringById}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {registeringById ? 'Registering...' : 'Register list'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Configured connections + Agora-level access */}
        <div className="mt-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Configured Connections ({connections.length})</h3>
            <p className="text-xs text-gray-400 mt-0.5">These lists appear in the user import picker. Grant access by group, or make a list visible to everyone.</p>
          </div>
          {connections.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">No connections yet. Browse a site above and add a list.</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {connections.map(function(conn: any) {
                var grantedIds = (conn.access || []).map(function(a: any) { return a.groupId; });
                return (
                  <div key={conn.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{conn.name}</p>
                        <p className="text-[11px] text-gray-400">List: {conn.listName} · {conn.siteUrl}</p>
                      </div>
                      <button onClick={function() { deleteConnection(conn.id, conn.name); }}
                        className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>

                    <label className="flex items-center gap-2 mt-3 text-xs text-gray-600 dark:text-gray-300">
                      <input type="checkbox" checked={!!conn.visibleToAll}
                        onChange={function(e) { patchConnection(conn.id, { visibleToAll: e.target.checked }); }}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                      Visible to all users
                    </label>

                    {!conn.visibleToAll && (
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Groups with access</p>
                        {groups.length === 0 ? (
                          <p className="text-[11px] text-gray-400">No groups exist yet. Create groups in Admin → Groups.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {groups.map(function(g: any) {
                              var on = grantedIds.indexOf(g.id) >= 0;
                              return (
                                <button key={g.id} onClick={function() { toggleGroup(conn, g.id); }}
                                  className={'px-2.5 py-1 text-[11px] rounded-full border transition-colors ' +
                                    (on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400')}>
                                  {on ? '✓ ' : ''}{g.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl">
          <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">How to set up SharePoint (least-privilege)</h3>
          <ol className="text-xs text-blue-700 dark:text-blue-400 space-y-1.5">
            <li>1. Register an app in <strong>Entra → App Registrations</strong></li>
            <li>2. Add API permission <strong>Microsoft Graph → Application → Sites.Selected</strong> and <strong>grant admin consent</strong></li>
            <li>3. Have your 365 admin grant the app access to each <strong>specific site</strong> (read or write) it should reach</li>
            <li>4. Create a <strong>Client Secret</strong>, then enter Tenant ID, Client ID, and Secret above</li>
            <li>5. <strong>Browse Lists</strong> for a granted site and <strong>Add to catalog</strong> the lists you want</li>
            <li>6. Grant <strong>groups</strong> access to each list (or make it visible to all)</li>
            <li>7. Users go to <strong>Import from SharePoint</strong> and see only the lists they're allowed to use</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
