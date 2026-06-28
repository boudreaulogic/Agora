'use client';

import { useState, useEffect } from 'react';

interface SpColumn {
  name: string;
  displayName: string;
  type: string;
}

interface AgoraColumn {
  id: string;
  name: string;
  type: string;
}

export function SharePointSyncModal({ tableId, tableName, columns, isOpen, onClose }: {
  tableId: string;
  tableName: string;
  columns: AgoraColumn[];
  isOpen: boolean;
  onClose: () => void;
}) {
  var ls = useState(true); var loading = ls[0]; var setLoading = ls[1];
  var sls = useState<any[]>([]); var spLists = sls[0]; var setSpLists = sls[1];
  var scols = useState<SpColumn[]>([]); var spColumns = scols[0]; var setSpColumns = scols[1];
  var lcols = useState(false); var loadingColumns = lcols[0]; var setLoadingColumns = lcols[1];
  var sis = useState(''); var siteId = sis[0]; var setSiteId = sis[1];

  // Config state
  var cs = useState<any>(null); var config = cs[0]; var setConfig = cs[1];
  var els = useState(''); var selectedListId = els[0]; var setSelectedListId = els[1];
  var eln = useState(''); var selectedListName = eln[0]; var setSelectedListName = eln[1];
  var fms = useState<Record<string, string>>({}); var fieldMapping = fms[0]; var setFieldMapping = fms[1];
  var uks = useState(''); var uniqueKeyColumnId = uks[0]; var setUniqueKeyColumnId = uks[1];
  var uksp = useState(''); var uniqueKeySpColumn = uksp[0]; var setUniqueKeySpColumn = uksp[1];
  var ens = useState(false); var enabled = ens[0]; var setEnabled = ens[1];

  var svs = useState(false); var saving = svs[0]; var setSaving = svs[1];
  var sns = useState(false); var syncing = sns[0]; var setSyncing = sns[1];
  var ms = useState(''); var message = ms[0]; var setMessage = ms[1];
  var mts = useState<'success'|'error'|''>(''); var messageType = mts[0]; var setMessageType = mts[1];
  var srs = useState<any>(null); var syncResult = srs[0]; var setSyncResult = srs[1];

  // Load existing config + available lists on open
  useEffect(function() {
    if (!isOpen) return;
    setLoading(true);
    setMessage(''); setMessageType('');

    // Load config
    fetch('/api/tables/' + tableId + '/sharepoint')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.config) {
          var c = data.config;
          setConfig(c);
          setSelectedListId(c.listId || '');
          setSelectedListName(c.listName || '');
          setFieldMapping(c.fieldMapping || {});
          setUniqueKeyColumnId(c.uniqueKeyColumnId || '');
          setUniqueKeySpColumn(c.uniqueKeySpColumn || '');
          setEnabled(c.enabled || false);
          setSiteId(c.siteId || '');
          // Load columns for existing list
          if (c.siteId && c.listId) {
            fetchColumns(c.siteId, c.listId);
          }
        }
      })
      .catch(function() {});

    // Load available lists
    fetch('/api/admin/sharepoint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_lists' }) })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.lists) { setSpLists(data.lists); setSiteId(data.siteId || ''); }
        if (data.error) { setMessage(data.error); setMessageType('error'); }
      })
      .catch(function() { setMessage('Failed to load SharePoint lists'); setMessageType('error'); })
      .finally(function() { setLoading(false); });
  }, [isOpen, tableId]);

  function fetchColumns(sid: string, lid: string) {
    setLoadingColumns(true);
    fetch('/api/admin/sharepoint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_columns', siteId: sid, listId: lid }) })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.columns) {
          var cols = data.columns.map(function(c: any) {
            var type = 'text';
            if (c.dateTime) type = 'dateTime';
            else if (c.choice) type = 'choice';
            else if (c.boolean !== undefined) type = 'boolean';
            else if (c.number) type = 'number';
            else if (c.currency) type = 'currency';
            else if (c.personOrGroup) type = 'person';
            setSpColumns(cols);
            return { name: c.name, displayName: c.displayName, type: type };
          });
          setSpColumns(cols);
        }
      })
      .catch(function() {})
      .finally(function() { setLoadingColumns(false); });
  }

  function handleListChange(listId: string) {
    setSelectedListId(listId);
    var list = spLists.find(function(l) { return l.id === listId; });
    setSelectedListName(list?.displayName || '');
    setFieldMapping({});
    setSpColumns([]);
    if (listId && siteId) {
      fetchColumns(siteId, listId);
    }
  }

  function handleMapField(agoraColId: string, spColName: string) {
    setFieldMapping(function(prev) {
      var next = Object.assign({}, prev);
      if (spColName) { next[agoraColId] = spColName; }
      else { delete next[agoraColId]; }
      return next;
    });
  }

  function autoMap() {
    var newMapping: Record<string, string> = {};
    columns.forEach(function(agoraCol) {
      var nameL = agoraCol.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      var match = spColumns.find(function(spCol) {
        var spL = spCol.displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return spL === nameL || spL.includes(nameL) || nameL.includes(spL);
      });
      if (match) { newMapping[agoraCol.id] = match.name; }
    });
    setFieldMapping(newMapping);
    setMessage('Auto-mapped ' + Object.keys(newMapping).length + ' fields'); setMessageType('success');
  }

  async function handleSave() {
    setSaving(true); setMessage(''); setMessageType('');
    try {
      var saveConfig = {
        siteId: siteId,
        listId: selectedListId,
        listName: selectedListName,
        fieldMapping: fieldMapping,
        uniqueKeyColumnId: uniqueKeyColumnId,
        uniqueKeySpColumn: uniqueKeySpColumn,
        enabled: enabled,
        lastSyncAt: config?.lastSyncAt || null,
        lastSyncStatus: config?.lastSyncStatus || null,
        lastSyncStats: config?.lastSyncStats || null,
        lastSyncError: config?.lastSyncError || null,
      };
      var res = await fetch('/api/tables/' + tableId + '/sharepoint', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: saveConfig }),
      });
      if (res.ok) { setConfig(saveConfig); setMessage('SharePoint sync config saved!'); setMessageType('success'); }
      else { var err = await res.json(); setMessage(err.error || 'Failed to save'); setMessageType('error'); }
    } catch { setMessage('Failed to save'); setMessageType('error'); }
    finally { setSaving(false); }
  }

  async function handleSyncNow() {
    setSyncing(true); setMessage(''); setMessageType(''); setSyncResult(null);
    try {
      var res = await fetch('/api/tables/' + tableId + '/sharepoint', { method: 'POST' });
      var data = await res.json();
      if (res.ok) {
        setSyncResult(data);
        setMessage('Synced ' + data.synced + ' rows' + (data.errors > 0 ? ' (' + data.errors + ' errors)' : '')); 
        setMessageType(data.errors > 0 ? 'error' : 'success');
        // Update last sync info
        setConfig(function(prev: any) { return Object.assign({}, prev, { lastSyncAt: new Date().toISOString(), lastSyncStatus: data.errors > 0 ? 'partial' : 'success', lastSyncStats: { synced: data.synced, errors: data.errors } }); });
      } else {
        setMessage(data.error || 'Sync failed'); setMessageType('error');
      }
    } catch { setMessage('Sync failed'); setMessageType('error'); }
    finally { setSyncing(false); }
  }

  if (!isOpen) return null;

  var mappedCount = Object.keys(fieldMapping).length;
  var editableColumns = columns.filter(function(c) { return !['formula', 'lookup', 'rollup', 'approval_status', 'linked_record'].includes(c.type); });

  function getSpTypeLabel(type: string) {
    var labels: Record<string, string> = { text: 'Text', dateTime: 'Date/Time', choice: 'Choice', boolean: 'Yes/No', number: 'Number', currency: 'Currency', person: 'Person', other: 'Other' };
    return labels[type] || type;
  }

  function getAgoraTypeLabel(type: string) {
    var labels: Record<string, string> = { text: 'Text', long_text: 'Long Text', number: 'Number', currency: 'Currency', percent: 'Percent', date: 'Date', datetime: 'DateTime', checkbox: 'Checkbox', select: 'Select', multi_select: 'Multi Select', email: 'Email', phone: 'Phone', url: 'URL', rating: 'Rating', color: 'Color', progress: 'Progress' };
    return labels[type] || type;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={function(e) { e.stopPropagation(); }}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
              <span>SharePoint Sync</span>
              {enabled && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">ACTIVE</span>}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tableName} → SharePoint List</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {message && (
            <div className={'px-4 py-2 rounded-lg text-sm ' + (messageType === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200')}>
              {message}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : (
            <>
              {/* List Picker */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">SharePoint List</label>
                <select value={selectedListId} onChange={function(e) { handleListChange(e.target.value); }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200">
                  <option value="">— Select a SharePoint list —</option>
                  {spLists.map(function(list) {
                    return <option key={list.id} value={list.id}>{list.displayName}</option>;
                  })}
                </select>
              </div>

              {/* Enable Toggle */}
              {selectedListId && (
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Auto-Sync Enabled</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Automatically push row creates and updates to SharePoint</p>
                  </div>
                  <button type="button" onClick={function() { setEnabled(!enabled); }}
                    className={'relative w-11 h-6 rounded-full transition-colors ' + (enabled ? 'bg-green-500' : 'bg-gray-300')}>
                    <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)' }} />
                  </button>
                </div>
              )}

              {/* Field Mapping */}
              {selectedListId && spColumns.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Field Mapping</h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{mappedCount} of {editableColumns.length} fields mapped</p>
                    </div>
                    <button onClick={autoMap} className="px-3 py-1.5 text-xs font-medium text-purple-600 border border-purple-300 rounded-lg hover:bg-purple-50">Auto-Map</button>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr,auto,1fr] gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      <span>Agora Column</span>
                      <span className="w-6"></span>
                      <span>SharePoint Column</span>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[320px] overflow-y-auto">
                      {editableColumns.map(function(agoraCol) {
                        var mappedTo = fieldMapping[agoraCol.id] || '';
                        var mappedSpCol = spColumns.find(function(c) { return c.name === mappedTo; });
                        return (
                          <div key={agoraCol.id} className={'grid grid-cols-[1fr,auto,1fr] gap-2 px-4 py-2.5 items-center ' + (mappedTo ? 'bg-green-50/50 dark:bg-green-900/5' : '')}>
                            <div>
                              <span className="text-sm text-gray-900 dark:text-gray-100">{agoraCol.name}</span>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1.5">{getAgoraTypeLabel(agoraCol.type)}</span>
                            </div>
                            <span className="text-gray-300 dark:text-gray-600 text-sm w-6 text-center">{mappedTo ? '→' : '·'}</span>
                            <select value={mappedTo} onChange={function(e) { handleMapField(agoraCol.id, e.target.value); }}
                              className={'w-full px-2 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 ' + (mappedTo ? 'border-green-300 dark:border-green-700' : 'border-gray-300 dark:border-gray-600')}>
                              <option value="">— Not mapped —</option>
                              {spColumns.map(function(spCol) {
                                return <option key={spCol.name} value={spCol.name}>{spCol.displayName} ({getSpTypeLabel(spCol.type)})</option>;
                              })}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Unique Key (for upsert) */}
              {selectedListId && mappedCount > 0 && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Upsert Key (Optional)</h3>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">If set, existing SharePoint items matching this key will be updated instead of creating duplicates.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Agora Column</label>
                      <select value={uniqueKeyColumnId} onChange={function(e) { setUniqueKeyColumnId(e.target.value); }}
                        className="w-full px-2 py-1.5 text-sm border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200">
                        <option value="">None (always create new)</option>
                        {editableColumns.map(function(c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">SharePoint Column</label>
                      <select value={uniqueKeySpColumn} onChange={function(e) { setUniqueKeySpColumn(e.target.value); }}
                        className="w-full px-2 py-1.5 text-sm border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200">
                        <option value="">None</option>
                        {spColumns.map(function(c) { return <option key={c.name} value={c.name}>{c.displayName}</option>; })}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading columns */}
              {loadingColumns && (
                <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  <span>Loading SharePoint columns...</span>
                </div>
              )}

              {/* Last Sync Info */}
              {config?.lastSyncAt && (
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Last sync: {new Date(config.lastSyncAt).toLocaleString()}</span>
                    <span className={'font-semibold ' + (config.lastSyncStatus === 'success' ? 'text-green-600' : config.lastSyncStatus === 'error' ? 'text-red-600' : 'text-yellow-600')}>
                      {config.lastSyncStatus === 'success' ? '✓ Success' : config.lastSyncStatus === 'error' ? '✕ Error' : '⚠ Partial'}
                    </span>
                  </div>
                  {config.lastSyncStats && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                      {config.lastSyncStats.synced} synced, {config.lastSyncStats.errors} errors
                    </div>
                  )}
                  {config.lastSyncError && (
                    <div className="text-[10px] text-red-500 mt-1">{config.lastSyncError}</div>
                  )}
                </div>
              )}

              {/* Sync Results */}
              {syncResult && syncResult.errorDetails && syncResult.errorDetails.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                  <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Sync Errors</h4>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {syncResult.errorDetails.map(function(err: string, i: number) {
                      return <p key={i} className="text-[10px] text-red-600">{err}</p>;
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center space-x-2">
            {selectedListId && mappedCount > 0 && (
              <button onClick={handleSyncNow} disabled={syncing || !enabled}
                className="px-4 py-2 text-sm font-medium text-green-600 border border-green-300 rounded-lg hover:bg-green-50 disabled:opacity-50 flex items-center space-x-1.5">
                <svg className={'w-4 h-4 ' + (syncing ? 'animate-spin' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
            <button onClick={handleSave} disabled={saving || !selectedListId}
              className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Config'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}