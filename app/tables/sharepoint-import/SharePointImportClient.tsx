'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function getSpTypeLabel(type: string): string {
  var labels: Record<string, string> = {
    text: 'Text', note: 'Long Text', number: 'Number', currency: 'Currency',
    dateTime: 'Date/Time', boolean: 'Yes/No', choice: 'Choice',
    multichoice: 'Multi Choice', personOrGroup: 'Person', url: 'URL',
    calculated: 'Calculated', lookup: 'Lookup',
  };
  return labels[type] || type;
}

function getAgoraTypeFromSp(spType: string): string {
  var map: Record<string, string> = {
    text: 'Text', note: 'Long Text', number: 'Number', currency: 'Currency',
    dateTime: 'DateTime', boolean: 'Checkbox', choice: 'Select',
    multichoice: 'Multi Select', personOrGroup: 'Text', url: 'URL',
    calculated: 'Text',
  };
  return map[spType] || 'Text';
}

export function SharePointImportClient({ workspaces }: { workspaces: any[] }) {
  var router = useRouter();

  // Step state
  var ss = useState(1); var step = ss[0]; var setStep = ss[1];

  // SP data
  var ls = useState(true); var loading = ls[0]; var setLoading = ls[1];
  var sls = useState<any[]>([]); var spLists = sls[0]; var setSpLists = sls[1];
  var cols = useState<any[]>([]); var spColumns = cols[0]; var setSpColumns = cols[1];
  var lcols = useState(false); var loadingCols = lcols[0]; var setLoadingCols = lcols[1];

  // Selections
  var sli = useState(''); var selectedListId = sli[0]; var setSelectedListId = sli[1];
  var sln = useState(''); var selectedListName = sln[0]; var setSelectedListName = sln[1];
  var sc = useState<Record<string, boolean>>({}); var selectedColumns = sc[0]; var setSelectedColumns = sc[1];

  // Table config
  var tns = useState(''); var tableName = tns[0]; var setTableName = tns[1];
  var tds = useState(''); var tableDesc = tds[0]; var setTableDesc = tds[1];
  var wis = useState(''); var workspaceId = wis[0]; var setWorkspaceId = wis[1];

  // Status
  var crs = useState(false); var creating = crs[0]; var setCreating = crs[1];
  var ms = useState(''); var message = ms[0]; var setMessage = ms[1];
  var mts = useState<'success' | 'error' | ''>(''); var messageType = mts[0]; var setMessageType = mts[1];
  var pls = useState(false); var pulling = pls[0]; var setPulling = pls[1];
  var prs = useState<any>(null); var pullResult = prs[0]; var setPullResult = prs[1];
  var ctid = useState(''); var createdTableId = ctid[0]; var setCreatedTableId = ctid[1];

  // Load the connections this user is allowed to see (admin-curated catalog)
  useEffect(function() {
    fetch('/api/sharepoint/connections')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) { setMessage(data.error); setMessageType('error'); return; }
        setSpLists(data.connections || []);
      })
      .catch(function() { setMessage('Failed to load SharePoint lists. Ask an admin to configure connections in Admin → SharePoint Settings.'); setMessageType('error'); })
      .finally(function() { setLoading(false); });
  }, []);

  function handleListSelect(connectionId: string) {
    setSelectedListId(connectionId);
    var conn = spLists.find(function(l) { return l.id === connectionId; });
    setSelectedListName(conn?.name || conn?.listName || '');
    setTableName(conn?.name || conn?.listName || '');
    setSpColumns([]);
    setSelectedColumns({});

    if (connectionId) {
      setLoadingCols(true);
      fetch('/api/sharepoint/connections/' + connectionId + '/columns')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.error) { setMessage(data.error); setMessageType('error'); return; }
          if (data.columns) {
            var mapped = data.columns.map(function(c: any) {
              var type = 'text';
              var choices: string[] | null = null;
              var dateTimeFormat: string | null = null;
              if (c.dateTime) { type = 'dateTime'; dateTimeFormat = c.dateTime.format || 'dateTime'; }
              else if (c.choice) { type = 'choice'; choices = c.choice.choices || []; }
              else if (c.boolean !== undefined) { type = 'boolean'; }
              else if (c.number) { type = 'number'; }
              else if (c.currency) { type = 'currency'; }
              else if (c.personOrGroup) { type = 'personOrGroup'; }
              else if (c.text && c.text.maxLength && c.text.maxLength > 255) { type = 'note'; }
              return {
                name: c.name,
                displayName: c.displayName,
                type: type,
                choices: choices,
                dateTimeFormat: dateTimeFormat,
                required: c.required || false,
              };
            });
            setSpColumns(mapped);
            // Select all by default
            var sel: Record<string, boolean> = {};
            mapped.forEach(function(c: any) { sel[c.name] = true; });
            setSelectedColumns(sel);
          }
        })
        .catch(function() { setMessage('Failed to load columns'); setMessageType('error'); })
        .finally(function() { setLoadingCols(false); });
    }
  }

  function toggleColumn(colName: string) {
    setSelectedColumns(function(prev) {
      var next = Object.assign({}, prev);
      next[colName] = !next[colName];
      return next;
    });
  }

  function selectAllColumns() {
    var sel: Record<string, boolean> = {};
    spColumns.forEach(function(c) { sel[c.name] = true; });
    setSelectedColumns(sel);
  }

  function deselectAllColumns() {
    setSelectedColumns({});
  }

  async function handleCreate() {
    if (!tableName.trim()) { setMessage('Table name is required'); setMessageType('error'); return; }
    var colsToImport = spColumns.filter(function(c) { return selectedColumns[c.name]; });
    if (colsToImport.length === 0) { setMessage('Select at least one column'); setMessageType('error'); return; }

    setCreating(true); setMessage(''); setMessageType('');
    try {
      var res = await fetch('/api/tables/sharepoint-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tableName.trim(),
          description: tableDesc.trim(),
          icon: '📋',
          workspaceId: workspaceId || null,
          connectionId: selectedListId,
          columns: colsToImport,
        }),
      });
      var data = await res.json();
      if (!res.ok) { setMessage(data.error || 'Failed to create table'); setMessageType('error'); return; }
      setCreatedTableId(data.tableId);
      setStep(4);
      setMessage('Table created! Pulling existing data from SharePoint...'); setMessageType('success');

      // Auto-pull existing items
      setPulling(true);
      try {
        var pullRes = await fetch('/api/tables/' + data.tableId + '/sharepoint-pull', { method: 'POST' });
        var pullData = await pullRes.json();
        setPullResult(pullData);
        if (pullData.success) {
          setMessage('Table created and imported ' + pullData.imported + ' items from SharePoint!');
        } else {
          setMessage('Table created but data pull failed: ' + (pullData.error || 'Unknown error'));
          setMessageType('error');
        }
      } catch {
        setMessage('Table created but failed to pull existing data');
        setMessageType('error');
      } finally {
        setPulling(false);
      }
    } catch {
      setMessage('Failed to create table'); setMessageType('error');
    } finally {
      setCreating(false);
    }
  }

  var selectedCount = Object.values(selectedColumns).filter(Boolean).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Connecting to SharePoint...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import from SharePoint</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create a table backed by a SharePoint list</p>
            </div>
            <a href="/" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm">← Back</a>
          </div>
        </div>
      </div>

      {/* Step indicators */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-center gap-2">
          {[
            { n: 1, label: 'Choose List' },
            { n: 2, label: 'Select Columns' },
            { n: 3, label: 'Configure' },
            { n: 4, label: 'Done' },
          ].map(function(s) {
            return (
              <button key={s.n} disabled={s.n > step} onClick={function() { if (s.n < step) setStep(s.n); }}
                className={'inline-flex items-center space-x-1.5 px-4 py-2 rounded-full text-sm transition-colors ' +
                  (s.n === step ? 'bg-blue-600 text-white shadow-sm' :
                    s.n < step ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer' :
                      'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed')}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-white/20">
                  {s.n < step ? '✓' : s.n}
                </span>
                <span className="text-xs font-medium">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {message && (
          <div className={'mb-4 px-4 py-3 rounded-lg text-sm ' +
            (messageType === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700')}>
            {message}
          </div>
        )}

        {/* Step 1: Choose List */}
        {step === 1 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Choose a SharePoint List</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">These are the SharePoint lists you have been granted access to. Select one to connect it to Agora.</p>

            {spLists.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400">No SharePoint lists are available to you. An admin can register lists and grant access in Admin → SharePoint Settings.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {spLists.map(function(list) {
                  var isSelected = selectedListId === list.id;
                  return (
                    <button key={list.id} onClick={function() { handleListSelect(list.id); }}
                      className={'w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ' +
                        (isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800')}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={'font-medium ' + (isSelected ? 'text-blue-900 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100')}>{list.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            SharePoint list: {list.listName}{list.description ? ' — ' + list.description : ''}
                          </p>
                        </div>
                        {isSelected && <span className="text-blue-600 text-lg">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {loadingCols && (
              <div className="flex items-center space-x-2 mt-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                <span>Loading columns...</span>
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button onClick={function() { setStep(2); }} disabled={!selectedListId || spColumns.length === 0}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Next: Select Columns
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select Columns */}
        {step === 2 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Select Columns to Import</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{selectedCount} of {spColumns.length} columns selected from "{selectedListName}"</p>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={selectAllColumns} className="text-xs text-blue-600 hover:text-blue-800">Select All</button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <button onClick={deselectAllColumns} className="text-xs text-blue-600 hover:text-blue-800">Deselect All</button>
              </div>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[auto,1fr,120px,120px] gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <span></span>
                <span>Column Name</span>
                <span>SP Type</span>
                <span>Agora Type</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[400px] overflow-y-auto">
                {spColumns.map(function(col) {
                  var isChecked = selectedColumns[col.name] || false;
                  return (
                    <div key={col.name} onClick={function() { toggleColumn(col.name); }}
                      className={'grid grid-cols-[auto,1fr,120px,120px] gap-2 px-4 py-3 items-center cursor-pointer transition-colors ' +
                        (isChecked ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}>
                      <input type="checkbox" checked={isChecked} onChange={function() {}} className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                      <div>
                        <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">{col.displayName}</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-2 font-mono">{col.name}</span>
                        {col.required && <span className="text-red-500 text-[10px] ml-1">Required</span>}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{getSpTypeLabel(col.type)}</span>
                      <span className="text-xs text-blue-600 font-medium">{getAgoraTypeFromSp(col.type)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {spColumns.some(function(c) { return c.type === 'dateTime'; }) && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800">
                  <strong>Date/Time columns detected.</strong> SharePoint stores dates in UTC. Agora will handle timezone conversion automatically when syncing.
                </p>
              </div>
            )}

            {spColumns.some(function(c) { return c.type === 'choice'; }) && (
              <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-xs text-purple-800">
                  <strong>Choice columns detected.</strong> The dropdown options from SharePoint will be imported into Agora's Select fields. Values must match exactly when syncing back.
                </p>
              </div>
            )}

            <div className="flex justify-between mt-6">
              <button onClick={function() { setStep(1); }} className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Back</button>
              <button onClick={function() { setStep(3); }} disabled={selectedCount === 0}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Next: Configure Table
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Configure */}
        {step === 3 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Configure Your Table</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Table Name <span className="text-red-500">*</span></label>
              <input type="text" value={tableName} onChange={function(e) { setTableName(e.target.value); }}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg dark:bg-gray-800 dark:text-gray-100"
                placeholder="e.g., Facility Use Requests" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
              <textarea value={tableDesc} onChange={function(e) { setTableDesc(e.target.value); }} rows={2}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
                placeholder="What is this table for?" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Workspace (Optional)</label>
              <select value={workspaceId} onChange={function(e) { setWorkspaceId(e.target.value); }}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100">
                <option value="">No workspace</option>
                {workspaces.map(function(w) { return <option key={w.id} value={w.id}>{w.icon || '📁'} {w.name}</option>; })}
              </select>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Summary</h3>
              <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
                <p>SharePoint List: <strong>{selectedListName}</strong></p>
                <p>Columns to import: <strong>{selectedCount}</strong></p>
                <p>Sync: <strong>Bidirectional (Agora ↔ SharePoint)</strong></p>
                <p>Existing items will be pulled into Agora after creation.</p>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={function() { setStep(2); }} className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Back</button>
              <button onClick={handleCreate} disabled={creating || !tableName.trim()}
                className="px-8 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                {creating ? 'Creating...' : 'Create SharePoint Table'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
            <div className="text-5xl mb-4">{pulling ? '⏳' : '✅'}</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {pulling ? 'Importing data...' : 'Table Created!'}
            </h2>
            {pullResult && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg inline-block text-left">
                <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  <p>Items imported: <strong className="text-green-600">{pullResult.imported}</strong></p>
                  {pullResult.updated > 0 && <p>Items updated: <strong className="text-blue-600">{pullResult.updated}</strong></p>}
                  {pullResult.errors > 0 && <p>Errors: <strong className="text-red-600">{pullResult.errors}</strong></p>}
                  <p>Total in SharePoint: <strong>{pullResult.total}</strong></p>
                </div>
              </div>
            )}
            {pulling && (
              <div className="mt-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
              </div>
            )}
            {!pulling && createdTableId && (
              <div className="mt-6 flex items-center justify-center space-x-3">
                <a href={'/'} className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Back to Home</a>
                <a href={'/tables/' + createdTableId} className="px-8 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Open Table</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}