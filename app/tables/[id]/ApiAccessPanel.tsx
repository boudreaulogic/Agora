'use client';

import { useState, useEffect } from 'react';

const PERMISSION_OPTIONS = [
  { value: 'read', label: 'Read Only', description: 'Can read rows and schema' },
  { value: 'readwrite', label: 'Read + Write', description: 'Can read, create, update, and delete rows' },
  { value: 'admin', label: 'Admin', description: 'Full access including schema changes' },
];

const EXPIRY_OPTIONS = [
  { value: '', label: 'Never expires' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: '1 year' },
];

export function ApiAccessPanel({
  tableId,
  tableName,
  isOpen,
  onClose,
}: {
  tableId: string;
  tableName: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [keys, setKeys] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'keys' | 'docs'>('keys');

  // New key form
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerms, setNewKeyPerms] = useState('read');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Newly created key (shown once)
  const [revealedKey, setRevealedKey] = useState<{ rawKey: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchKeys();
      setRevealedKey(null);
      setShowNewKey(false);
    }
  }, [isOpen, tableId]);

  async function fetchKeys() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/api-keys`);
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerate() {
    if (!newKeyName.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          permissions: newKeyPerms,
          expiresIn: newKeyExpiry || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedKey({ rawKey: data.key.rawKey, name: data.key.name });
        setNewKeyName('');
        setNewKeyPerms('read');
        setNewKeyExpiry('');
        setShowNewKey(false);
        fetchKeys();
      } else {
        try {
          const data = await res.json();
          alert(data.error || 'Failed to generate key');
        } catch {
          alert(`Failed to generate key (${res.status} ${res.statusText})`);
        }
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRevoke(keyId: string, keyName: string) {
    if (!confirm(`Revoke API key "${keyName}"? Any scripts or integrations using this key will stop working immediately.`)) return;
    const res = await fetch(`/api/tables/${tableId}/api-keys`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId }),
    });
    if (res.ok) {
      fetchKeys();
    }
  }

  function copyToClipboard(text: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Copy failed — please select and copy the key manually');
    }
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getRelativeTime(dateStr: string) {
    if (!dateStr) return 'Never used';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(diff / 86400000);
    if (days < 30) return `${days}d ago`;
    return formatDate(dateStr);
  }

  function getPermBadge(perm: string) {
    switch (perm) {
      case 'admin': return { label: 'Admin', cls: 'bg-purple-100 text-purple-800' };
      case 'readwrite': return { label: 'Read+Write', cls: 'bg-blue-100 text-blue-800' };
      default: return { label: 'Read Only', cls: 'bg-gray-100 text-gray-800' };
    }
  }

  // Generate example code snippets
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-agora-instance.com';
  const apiBase = `${baseUrl}/api/v1`;
  const exampleKey = 'agora_live_xxxxxxxxxxxxxxxxxxxxxxxx';

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900">API Access</h2>
              <p className="text-xs text-gray-500 mt-0.5">Manage API keys and integrate with external tools</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
            <button onClick={() => setActiveTab('keys')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'keys' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              API Keys
            </button>
            <button onClick={() => setActiveTab('docs')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'docs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Quick Start
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activeTab === 'keys' ? (
              <div className="space-y-4">
                {/* Revealed Key Banner */}
                {revealedKey && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-lg">⚠️</span>
                      <h4 className="text-sm font-semibold text-amber-900">Save your API key now</h4>
                    </div>
                    <p className="text-xs text-amber-700 mb-3">This is the only time you'll see this key. Copy it and store it securely.</p>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-mono text-gray-900 select-all break-all">
                        {revealedKey.rawKey}
                      </code>
                      <button
                        onClick={() => copyToClipboard(revealedKey.rawKey)}
                        className={`px-3 py-2 text-xs rounded-lg transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <button onClick={() => setRevealedKey(null)} className="mt-2 text-[10px] text-amber-600 hover:text-amber-800">
                      I've saved it — dismiss
                    </button>
                  </div>
                )}

                {/* Generate New Key */}
                {!showNewKey ? (
                  <button onClick={() => setShowNewKey(true)}
                    className="flex items-center space-x-2 px-4 py-2.5 text-sm border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 w-full transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    <span>Generate New API Key</span>
                  </button>
                ) : (
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900">New API Key</h4>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="e.g. Device Inventory Script, Zapier Integration..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); if (e.key === 'Escape') setShowNewKey(false); }}
                      />
                    </div>
                    <div className="flex space-x-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Permission</label>
                        <select value={newKeyPerms} onChange={(e) => setNewKeyPerms(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
                          {PERMISSION_OPTIONS.map(p => (
                            <option key={p.value} value={p.value}>{p.label} — {p.description}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Expires</label>
                        <select value={newKeyExpiry} onChange={(e) => setNewKeyExpiry(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
                          {EXPIRY_OPTIONS.map(e => (
                            <option key={e.value} value={e.value}>{e.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => setShowNewKey(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                      <button onClick={handleGenerate} disabled={!newKeyName.trim() || isGenerating}
                        className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {isGenerating ? 'Generating...' : 'Generate Key'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Keys List */}
                {isLoading ? (
                  <p className="text-sm text-gray-400 text-center py-6">Loading keys...</p>
                ) : keys.length === 0 && !revealedKey ? (
                  <div className="text-center py-8">
                    <div className="text-3xl mb-3">🔑</div>
                    <p className="text-sm font-medium text-gray-900 mb-1">No API keys yet</p>
                    <p className="text-xs text-gray-500">Generate a key to start integrating with external tools and scripts</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {keys.map(key => {
                      const badge = getPermBadge(key.permissions);
                      return (
                        <div key={key.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg group">
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-sm">🔑</span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2">
                                <p className="text-sm font-medium text-gray-900 truncate">{key.name}</p>
                                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${badge.cls}`}>{badge.label}</span>
                              </div>
                              <div className="flex items-center space-x-3 text-[10px] text-gray-400 mt-0.5">
                                <code className="font-mono">{key.keyPrefix}...</code>
                                <span>Created {formatDate(key.createdAt)}</span>
                                <span>Last used: {getRelativeTime(key.lastUsedAt)}</span>
                                {key.expiresAt && <span>Expires {formatDate(key.expiresAt)}</span>}
                              </div>
                              {key.createdBy && (
                                <p className="text-[10px] text-gray-400 mt-0.5">By {key.createdBy.name || key.createdBy.email}</p>
                              )}
                            </div>
                          </div>
                          <button onClick={() => handleRevoke(key.id, key.name)}
                            className="px-2.5 py-1 text-[10px] text-red-600 border border-red-200 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                            Revoke
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Quick Start / Docs Tab */
              <div className="space-y-5">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">Base URL</h4>
                  <code className="text-xs font-mono text-blue-700 bg-white px-2 py-1 rounded border border-gray-200 select-all">{apiBase}</code>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Authentication</h4>
                  <p className="text-xs text-gray-600 mb-2">Include your API key in the Authorization header:</p>
                  <pre className="text-xs font-mono bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto">
{`Authorization: Bearer ${exampleKey}`}
                  </pre>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">List Rows</h4>
                  <pre className="text-xs font-mono bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto">
{`curl -H "Authorization: Bearer ${exampleKey}" \\
  "${apiBase}/tables/${tableId}/rows"`}
                  </pre>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Create a Row</h4>
                  <pre className="text-xs font-mono bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto">
{`curl -X POST \\
  -H "Authorization: Bearer ${exampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"data": {"column_id": "value"}}' \\
  "${apiBase}/tables/${tableId}/rows"`}
                  </pre>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Update a Row</h4>
                  <pre className="text-xs font-mono bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto">
{`curl -X PATCH \\
  -H "Authorization: Bearer ${exampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"data": {"column_id": "new_value"}}' \\
  "${apiBase}/tables/${tableId}/rows/ROW_ID"`}
                  </pre>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Delete a Row</h4>
                  <pre className="text-xs font-mono bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto">
{`curl -X DELETE \\
  -H "Authorization: Bearer ${exampleKey}" \\
  "${apiBase}/tables/${tableId}/rows/ROW_ID"`}
                  </pre>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">PowerShell Example</h4>
                  <pre className="text-xs font-mono bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto">
{`$headers = @{
  "Authorization" = "Bearer ${exampleKey}"
  "Content-Type"  = "application/json"
}

# Get all rows
$rows = Invoke-RestMethod -Uri "${apiBase}/tables/${tableId}/rows" \\
  -Headers $headers

# Create a row
$body = @{ data = @{ column_id = "value" } } | ConvertTo-Json
Invoke-RestMethod -Uri "${apiBase}/tables/${tableId}/rows" \\
  -Method POST -Headers $headers -Body $body`}
                  </pre>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Python Example</h4>
                  <pre className="text-xs font-mono bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto">
{`import requests

API_KEY = "${exampleKey}"
BASE = "${apiBase}"
TABLE = "${tableId}"

headers = {"Authorization": f"Bearer {API_KEY}"}

# Get all rows
rows = requests.get(f"{BASE}/tables/{TABLE}/rows",
  headers=headers).json()

# Create a row
requests.post(f"{BASE}/tables/{TABLE}/rows",
  headers=headers,
  json={"data": {"column_id": "value"}})`}
                  </pre>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-1">
                    <span>🔒</span>
                    <h4 className="text-sm font-semibold text-amber-900">Security Notes</h4>
                  </div>
                  <ul className="text-xs text-amber-800 space-y-1 ml-6 list-disc">
                    <li>Never share your API key publicly or commit it to source code</li>
                    <li>Use environment variables to store keys in scripts</li>
                    <li>Set the minimum permission level needed for your use case</li>
                    <li>Set an expiration date for keys used in temporary integrations</li>
                    <li>Revoke keys immediately if compromised</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-200 flex justify-end flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 font-medium">Done</button>
          </div>
        </div>
      </div>
    </>
  );
}