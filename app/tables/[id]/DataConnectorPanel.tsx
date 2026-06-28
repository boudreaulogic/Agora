'use client';

import { useState, useEffect } from 'react';

var AUTH_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api_key', label: 'API Key Header' },
  { value: 'basic', label: 'Basic Auth' },
];

var SYNC_MODES = [
  { value: 'manual', label: 'Manual only' },
  { value: 'interval', label: 'Scheduled' },
];

var SYNC_INTERVALS = [
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 360, label: 'Every 6 hours' },
  { value: 1440, label: 'Every 24 hours' },
];

export function DataConnectorPanel({
  tableId,
  columns,
  isOpen,
  onClose,
}: {
  tableId: string;
  columns: any[];
  isOpen: boolean;
  onClose: () => void;
}) {
  var [connectors, setConnectors] = useState<any[]>([]);
  var [loading, setLoading] = useState(false);
  var [editing, setEditing] = useState<any>(null);
  var [creating, setCreating] = useState(false);

  // Form state
  var [name, setName] = useState('');
  var [url, setUrl] = useState('');
  var [method, setMethod] = useState('GET');
  var [authType, setAuthType] = useState('none');
  var [authValue, setAuthValue] = useState('');
  var [authHeader, setAuthHeader] = useState('X-API-Key');
  var [username, setUsername] = useState('');
  var [password, setPassword] = useState('');
  var [responseDataPath, setResponseDataPath] = useState('');
  var [uniqueKeyField, setUniqueKeyField] = useState('');
  var [syncMode, setSyncMode] = useState('manual');
  var [syncIntervalMin, setSyncIntervalMin] = useState(60);
  var [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  // Test/Preview state
  var [testResult, setTestResult] = useState<any>(null);
  var [testLoading, setTestLoading] = useState(false);
  var [testError, setTestError] = useState('');
  var [previewFields, setPreviewFields] = useState<string[]>([]);

  // Sync state
  var [syncing, setSyncing] = useState(false);
  var [syncResult, setSyncResult] = useState<any>(null);

  // Saving
  var [saving, setSaving] = useState(false);

  useEffect(function() {
    if (isOpen) fetchConnectors();
  }, [isOpen]);

  function fetchConnectors() {
    setLoading(true);
    fetch('/api/tables/' + tableId + '/connectors')
      .then(function(res) { return res.json(); })
      .then(function(data) { setConnectors(data.connectors || []); })
      .finally(function() { setLoading(false); });
  }

  function resetForm() {
    setName(''); setUrl(''); setMethod('GET');
    setAuthType('none'); setAuthValue(''); setAuthHeader('X-API-Key');
    setUsername(''); setPassword('');
    setResponseDataPath(''); setUniqueKeyField('');
    setSyncMode('manual'); setSyncIntervalMin(60);
    setFieldMapping({}); setTestResult(null); setTestError('');
    setPreviewFields([]); setSyncResult(null);
  }

  function startCreate() {
    resetForm();
    setEditing(null);
    setCreating(true);
  }

  function startEdit(connector: any) {
    var config = connector.config || {};
    setName(connector.name);
    setUrl(config.url || '');
    setMethod(config.method || 'GET');
    setAuthType(config.authType || 'none');
    setAuthValue(config.authValue || '');
    setAuthHeader(config.authHeader || 'X-API-Key');
    setUsername(config.username || '');
    setPassword(config.password || '');
    setResponseDataPath(config.responseDataPath || '');
    setUniqueKeyField(config.uniqueKeyField || '');
    setSyncMode(connector.syncMode || 'manual');
    setSyncIntervalMin(connector.syncIntervalMin || 60);
    setFieldMapping(connector.fieldMapping || {});
    setTestResult(null);
    setTestError('');
    setPreviewFields([]);
    setSyncResult(null);
    setEditing(connector);
    setCreating(true);
  }

  function buildConfig() {
    var config: any = {
      url: url,
      method: method,
      authType: authType,
      responseDataPath: responseDataPath || undefined,
      uniqueKeyField: uniqueKeyField || undefined,
    };
    if (authType === 'bearer') config.authValue = authValue;
    if (authType === 'api_key') { config.authValue = authValue; config.authHeader = authHeader; }
    if (authType === 'basic') { config.username = username; config.password = password; }
    return config;
  }

  function handleTestConnection() {
    if (!url.trim()) return;
    setTestLoading(true);
    setTestError('');
    setTestResult(null);
    setPreviewFields([]);

    var config = buildConfig();

    // Build fetch options
    var fetchHeaders: Record<string, string> = { 'Accept': 'application/json' };
    if (config.authType === 'bearer' && config.authValue) {
      fetchHeaders['Authorization'] = 'Bearer ' + config.authValue;
    } else if (config.authType === 'api_key' && config.authValue) {
      fetchHeaders[config.authHeader || 'X-API-Key'] = config.authValue;
    } else if (config.authType === 'basic' && config.username && config.password) {
      fetchHeaders['Authorization'] = 'Basic ' + btoa(config.username + ':' + config.password);
    }

    fetch(url, { method: method, headers: fetchHeaders })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);
        return res.json();
      })
      .then(function(data) {
        // Navigate to data path
        var records = data;
        if (responseDataPath) {
          var parts = responseDataPath.split('.');
          for (var i = 0; i < parts.length; i++) {
            if (records && typeof records === 'object') records = records[parts[i]];
            else { throw new Error('Path not found: ' + responseDataPath); }
          }
        }
        if (!Array.isArray(records)) {
          if (records && typeof records === 'object') records = [records];
          else throw new Error('Response is not an array. Set a data path.');
        }

        // Extract field names from first few records
        var fields = new Set<string>();
        var sampleCount = Math.min(records.length, 5);
        for (var s = 0; s < sampleCount; s++) {
          if (records[s] && typeof records[s] === 'object') {
            Object.keys(records[s]).forEach(function(k) { fields.add(k); });
          }
        }

        var fieldList = Array.from(fields);
        setPreviewFields(fieldList);
        setTestResult({ recordCount: records.length, sample: records.slice(0, 3), fields: fieldList });
      })
      .catch(function(err) {
        setTestError(err.message || 'Connection failed');
      })
      .finally(function() { setTestLoading(false); });
  }

  function handleSave() {
    if (!name.trim() || !url.trim() || saving) return;
    setSaving(true);

    var config = buildConfig();
    var endpoint = '/api/tables/' + tableId + '/connectors';
    var bodyData: any = {
      name: name.trim(),
      type: 'rest_api',
      config: config,
      fieldMapping: fieldMapping,
      syncMode: syncMode,
      syncIntervalMin: syncIntervalMin,
    };

    if (editing) {
      bodyData.connectorId = editing.id;
      fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData) })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.connector) { fetchConnectors(); setCreating(false); setEditing(null); }
          else alert(data.error || 'Failed to save');
        })
        .finally(function() { setSaving(false); });
    } else {
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData) })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.connector) { fetchConnectors(); setCreating(false); }
          else alert(data.error || 'Failed to create');
        })
        .finally(function() { setSaving(false); });
    }
  }

  function handleDelete(connectorId: string) {
    if (!confirm('Delete this connector? This will not delete any data already synced.')) return;
    fetch('/api/tables/' + tableId + '/connectors', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectorId: connectorId }),
    }).then(function(res) { if (res.ok) fetchConnectors(); });
  }

  function handleSync(connectorId: string) {
    setSyncing(true);
    setSyncResult(null);
    fetch('/api/tables/' + tableId + '/connectors/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectorId: connectorId }),
    }).then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success) {
        setSyncResult({ success: true, message: data.message });
        fetchConnectors();
      } else {
        setSyncResult({ success: false, message: data.error || 'Sync failed' });
      }
    })
    .catch(function() { setSyncResult({ success: false, message: 'Sync failed' }); })
    .finally(function() { setSyncing(false); });
  }

  function updateFieldMapping(apiField: string, columnId: string) {
    setFieldMapping(function(prev) {
      var next = Object.assign({}, prev);
      if (columnId) next[apiField] = columnId;
      else delete next[apiField];
      return next;
    });
  }

  function formatDate(d: string) {
    if (!d) return 'Never';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {creating ? (editing ? 'Edit Connector' : 'New REST API Connector') : 'Data Connectors'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Connect external APIs and sync data into this table</p>
          </div>
          <div className="flex items-center space-x-2">
            {creating && (
              <button onClick={function() { setCreating(false); setEditing(null); }}
                className="text-sm text-blue-600 hover:text-blue-800 mr-2">← Back</button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!creating ? (
            /* CONNECTOR LIST */
            <div>
              <button onClick={startCreate}
                className="w-full mb-4 flex items-center justify-center space-x-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <span className="text-sm">Add REST API Connector</span>
              </button>

              {loading ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Loading...</p>
              ) : connectors.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🔌</div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No connectors yet</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Connect a REST API to sync external data into this table.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {connectors.map(function(c) {
                    var statusColor = c.lastSyncStatus === 'success' ? 'text-green-600' :
                      c.lastSyncStatus === 'error' ? 'text-red-600' :
                      c.lastSyncStatus === 'syncing' ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500';
                    var statusIcon = c.lastSyncStatus === 'success' ? '✅' :
                      c.lastSyncStatus === 'error' ? '❌' :
                      c.lastSyncStatus === 'syncing' ? '🔄' : '⏸️';
                    return (
                      <div key={c.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">🔌</span>
                            <div>
                              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{c.name}</h3>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500">{(c.config as any)?.url || 'No URL'}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={'text-xs ' + statusColor}>{statusIcon} {c.lastSyncStatus}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 text-[10px] text-gray-400 dark:text-gray-500">
                            <span>Last sync: {formatDate(c.lastSyncAt)}</span>
                            {c.lastSyncStats && (
                              <span>{c.lastSyncStats.rowsCreated}↑ {c.lastSyncStats.rowsUpdated}↻ {c.lastSyncStats.rowsSkipped}→</span>
                            )}
                            <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{c.syncMode === 'interval' ? 'Every ' + c.syncIntervalMin + 'min' : 'Manual'}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button onClick={function() { handleSync(c.id); }} disabled={syncing}
                              className="px-2.5 py-1 text-[10px] text-blue-600 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50">
                              {syncing ? 'Syncing...' : '▶ Sync Now'}
                            </button>
                            <button onClick={function() { startEdit(c); }}
                              className="px-2.5 py-1 text-[10px] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800">Edit</button>
                            <button onClick={function() { handleDelete(c.id); }}
                              className="px-2.5 py-1 text-[10px] text-red-600 border border-red-200 rounded hover:bg-red-50">Delete</button>
                          </div>
                        </div>
                        {c.lastSyncError && (
                          <p className="mt-2 text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded">{c.lastSyncError}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {syncResult && (
                <div className={'mt-4 px-3 py-2 rounded-lg text-xs ' +
                  (syncResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
                  {syncResult.message}
                </div>
              )}
            </div>
          ) : (
            /* CREATE/EDIT FORM */
            <div className="space-y-5">
              {/* Connector Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Connector Name</label>
                <input type="text" value={name} onChange={function(e) { setName(e.target.value); }}
                  placeholder="e.g. Canvas LMS Students, Weather API..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
              </div>

              {/* API URL + Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Endpoint</label>
                <div className="flex space-x-2">
                  <select value={method} onChange={function(e) { setMethod(e.target.value); }}
                    className="w-24 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                  <input type="text" value={url} onChange={function(e) { setUrl(e.target.value); }}
                    placeholder="https://api.example.com/data"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              {/* Authentication */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Authentication</label>
                <select value={authType} onChange={function(e) { setAuthType(e.target.value); }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  {AUTH_TYPES.map(function(t) { return <option key={t.value} value={t.value}>{t.label}</option>; })}
                </select>

                {authType === 'bearer' && (
                  <input type="password" value={authValue} onChange={function(e) { setAuthValue(e.target.value); }}
                    placeholder="Bearer token..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                )}

                {authType === 'api_key' && (
                  <div className="flex space-x-2">
                    <input type="text" value={authHeader} onChange={function(e) { setAuthHeader(e.target.value); }}
                      placeholder="Header name" className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                    <input type="password" value={authValue} onChange={function(e) { setAuthValue(e.target.value); }}
                      placeholder="API key value..." className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                  </div>
                )}

                {authType === 'basic' && (
                  <div className="flex space-x-2">
                    <input type="text" value={username} onChange={function(e) { setUsername(e.target.value); }}
                      placeholder="Username" className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                    <input type="password" value={password} onChange={function(e) { setPassword(e.target.value); }}
                      placeholder="Password" className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                  </div>
                )}
              </div>

              {/* Response Data Path */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Response Data Path <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
                </label>
                <input type="text" value={responseDataPath} onChange={function(e) { setResponseDataPath(e.target.value); }}
                  placeholder="e.g. data.results or items"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Dot notation path to the array of records in the JSON response. Leave blank if the response IS the array.</p>
              </div>

              {/* Test Connection */}
              <div className="flex items-center space-x-3">
                <button onClick={handleTestConnection} disabled={!url.trim() || testLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {testLoading ? 'Testing...' : '🧪 Test Connection'}
                </button>
                {testError && <span className="text-xs text-red-600">{testError}</span>}
                {testResult && <span className="text-xs text-green-600">✅ Found {testResult.recordCount} records with {testResult.fields.length} fields</span>}
              </div>

              {/* Field Mapping — shows after successful test */}
              {previewFields.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-blue-800">Field Mapping</label>
                    <span className="text-[10px] text-blue-500">{previewFields.length} API fields → your table columns</span>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {previewFields.map(function(field) {
                      var sampleVal = testResult?.sample?.[0]?.[field];
                      var displayVal = sampleVal !== undefined && sampleVal !== null ? String(sampleVal) : '';
                      if (displayVal.length > 50) displayVal = displayVal.substring(0, 47) + '...';

                      return (
                        <div key={field} className="flex items-center space-x-2 bg-white dark:bg-gray-800 rounded px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-mono text-gray-800 dark:text-gray-200">{field}</span>
                            {displayVal && <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-2">"{displayVal}"</span>}
                          </div>
                          <span className="text-gray-300 dark:text-gray-600 text-xs">→</span>
                          <select value={fieldMapping[field] || ''}
                            onChange={function(e) { updateFieldMapping(field, e.target.value); }}
                            className="w-44 px-2 py-1.5 border border-blue-200 dark:border-blue-800 rounded text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                            <option value="">Skip this field</option>
                            {columns.filter(function(c: any) { return !['formula', 'lookup', 'rollup', 'approval_status'].includes(c.type); })
                              .map(function(c: any) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
                          </select>
                        </div>
                      );
                    })}
                  </div>

                  {/* Unique Key */}
                  <div>
                    <label className="block text-xs font-medium text-blue-800 mb-1">
                      Unique Key Field <span className="text-blue-400 font-normal">(for upsert — optional)</span>
                    </label>
                    <select value={uniqueKeyField} onChange={function(e) { setUniqueKeyField(e.target.value); }}
                      className="w-full px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                      <option value="">None — always create new rows</option>
                      {previewFields.map(function(f) { return <option key={f} value={f}>{f}</option>; })}
                    </select>
                    <p className="text-[10px] text-blue-400 mt-1">If set, existing rows with matching values will be updated instead of duplicated.</p>
                  </div>
                </div>
              )}

              {/* Sync Schedule */}
              <div className="flex space-x-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sync Schedule</label>
                  <select value={syncMode} onChange={function(e) { setSyncMode(e.target.value); }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    {SYNC_MODES.map(function(m) { return <option key={m.value} value={m.value}>{m.label}</option>; })}
                  </select>
                </div>
                {syncMode === 'interval' && (
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Interval</label>
                    <select value={syncIntervalMin} onChange={function(e) { setSyncIntervalMin(parseInt(e.target.value)); }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                      {SYNC_INTERVALS.map(function(i) { return <option key={i.value} value={i.value}>{i.label}</option>; })}
                    </select>
                  </div>
                )}
              </div>

              {/* Sample Data Preview */}
              {testResult?.sample && testResult.sample.length > 0 && Object.keys(fieldMapping).length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Preview — First Record</label>
                  <div className="space-y-1">
                    {Object.entries(fieldMapping).map(function(entry) {
                      var apiField = entry[0];
                      var colId = entry[1];
                      var col = columns.find(function(c: any) { return c.id === colId; });
                      var val = testResult.sample[0][apiField];
                      return (
                        <div key={apiField} className="flex items-center text-xs">
                          <span className="w-32 text-gray-500 dark:text-gray-400 truncate">{col?.name || colId}</span>
                          <span className="text-gray-300 dark:text-gray-600 mx-2">←</span>
                          <span className="text-gray-800 dark:text-gray-200 font-mono">{val !== undefined ? String(val) : '(empty)'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Save */}
              <div className="flex justify-end space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button onClick={function() { setCreating(false); setEditing(null); }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
                <button onClick={handleSave} disabled={!name.trim() || !url.trim() || saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving...' : (editing ? 'Update Connector' : 'Create Connector')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}