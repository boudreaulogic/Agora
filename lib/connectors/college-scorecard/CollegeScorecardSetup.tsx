// app/connectors/college-scorecard/CollegeScorecardSetup.tsx
// Client component for setting up + syncing a College Scorecard connector.

'use client';

import { useState } from 'react';

type Workspace = { id: string; name: string };

type SyncStats = {
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  pagesFetched: number;
  durationMs: number;
};

export function CollegeScorecardSetup(props: { workspaces: Workspace[] }) {
  var [workspaceId, setWorkspaceId] = useState('');
  var [tableName, setTableName] = useState('College Scorecard');
  var [apiKey, setApiKey] = useState('');
  var [stateFilter, setStateFilter] = useState('');
  var [tribalOnly, setTribalOnly] = useState(false);

  var [connectorId, setConnectorId] = useState<string | null>(null);
  var [tableId, setTableId] = useState<string | null>(null);

  var [setupLoading, setSetupLoading] = useState(false);
  var [syncLoading, setSyncLoading] = useState(false);
  var [error, setError] = useState<string | null>(null);
  var [syncStats, setSyncStats] = useState<SyncStats | null>(null);

  function handleSetup() {
    setError(null);
    setSyncStats(null);

    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }

    setSetupLoading(true);

    var payload = {
      workspaceId: workspaceId || undefined,
      tableName: tableName,
      apiKey: apiKey.trim(),
      state: stateFilter.trim() || undefined,
      tribalOnly: tribalOnly,
    };

    fetch('/api/connectors/college-scorecard/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok) {
          setError(r.body && r.body.error ? r.body.error : 'Setup failed');
          return;
        }
        setConnectorId(r.body.connectorId);
        setTableId(r.body.tableId);
      })
      .catch(function (e) { setError(e && e.message ? e.message : String(e)); })
      .finally(function () { setSetupLoading(false); });
  }

  function handleSync() {
    if (!connectorId) { return; }
    setError(null);
    setSyncStats(null);
    setSyncLoading(true);

    fetch('/api/connectors/college-scorecard/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorId: connectorId }),
    })
      .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok || !r.body.success) {
          setError(r.body && r.body.error ? r.body.error : 'Sync failed');
          return;
        }
        setSyncStats(r.body.stats);
      })
      .catch(function (e) { setError(e && e.message ? e.message : String(e)); })
      .finally(function () { setSyncLoading(false); });
  }

  var setupDone = connectorId !== null && tableId !== null;

  return (
    <div className="space-y-6">
      {!setupDone && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-medium">1. Configure</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700">Workspace</label>
            <select
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={workspaceId}
              onChange={function (e) { setWorkspaceId(e.target.value); }}
            >
              <option value="">No workspace (personal table)</option>
              {props.workspaces.map(function (w) {
                return <option key={w.id} value={w.id}>{w.name}</option>;
              })}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Personal tables appear under "My Tables". Workspace tables are shared with workspace members.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Table name</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={tableName}
              onChange={function (e) { setTableName(e.target.value); }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">API key</label>
            <input
              type="password"
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
              value={apiKey}
              onChange={function (e) { setApiKey(e.target.value); }}
              placeholder="api.data.gov key"
            />
            <p className="mt-1 text-xs text-gray-500">
              Get a free key at api.data.gov. Stored encrypted.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">State filter (optional)</label>
              <input
                type="text"
                maxLength={2}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase"
                value={stateFilter}
                onChange={function (e) { setStateFilter(e.target.value); }}
                placeholder="MN"
              />
              <p className="mt-1 text-xs text-gray-500">Two-letter code, leave blank for all states.</p>
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={tribalOnly}
                  onChange={function (e) { setTribalOnly(e.target.checked); }}
                />
                Tribal colleges only
              </label>
            </div>
          </div>

          <button
            type="button"
            disabled={setupLoading}
            onClick={handleSetup}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {setupLoading ? 'Creating table...' : 'Create connector'}
          </button>
        </div>
      )}

      {setupDone && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-medium">2. Sync</h2>
          <p className="text-sm text-gray-600">
            Table created. Click sync to pull records from the College Scorecard API.
            All-US scope can take 30-60 seconds.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={syncLoading}
              onClick={handleSync}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {syncLoading ? 'Syncing...' : 'Sync now'}
            </button>
            <a
              href={'/tables/' + tableId}
              className="text-sm text-blue-600 hover:underline"
            >
              Open table
            </a>
          </div>

          {syncStats && (
            <div className="rounded-md bg-gray-50 p-4 text-sm">
              <div className="font-medium text-gray-900">Sync complete</div>
              <ul className="mt-2 space-y-1 text-gray-700">
                <li>Pages fetched: {syncStats.pagesFetched}</li>
                <li>Created: {syncStats.rowsCreated}</li>
                <li>Updated: {syncStats.rowsUpdated}</li>
                <li>Skipped: {syncStats.rowsSkipped}</li>
                <li>Duration: {(syncStats.durationMs / 1000).toFixed(1)}s</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}