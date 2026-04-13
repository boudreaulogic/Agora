'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'url' | 'verify' | 'tabs' | 'importing' | 'done';

interface TabInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
  selected: boolean;
}

export function ConnectGoogleSheetModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('url');
  const [sheetUrl, setSheetUrl] = useState('');
  const [serviceEmail, setServiceEmail] = useState('');
  const [emailCopied, setEmailCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sheet metadata
  const [sheetName, setSheetName] = useState('');
  const [tabs, setTabs] = useState<TabInfo[]>([]);

  // Import progress
  const [importProgress, setImportProgress] = useState('');
  const [importedTables, setImportedTables] = useState<any[]>([]);

  // Fetch service email on open
  useEffect(() => {
    if (isOpen) {
      setStep('url');
      setSheetUrl('');
      setError('');
      setTabs([]);
      setImportedTables([]);
      fetchServiceEmail();
    }
  }, [isOpen]);

  async function fetchServiceEmail() {
    try {
      const res = await fetch('/api/google-sheets/service-email');
      if (res.ok) {
        const data = await res.json();
        setServiceEmail(data.email || '');
      }
    } catch {}
  }

  function copyEmail() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(serviceEmail);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = serviceEmail;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch {}
  }

  async function handleVerify() {
    if (!sheetUrl.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/google-sheets/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sheetUrl.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to access sheet');
        return;
      }

      setSheetName(data.title);
      setTabs(data.tabs.map((t: any) => ({ ...t, selected: true })));
      setStep('tabs');
    } catch {
      setError('Failed to connect. Make sure the sheet is shared with the service account.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    const selectedTabs = tabs.filter(t => t.selected);
    if (selectedTabs.length === 0) {
      setError('Select at least one tab to import');
      return;
    }

    setStep('importing');
    setImportProgress('Starting import...');
    setError('');

    try {
      const res = await fetch('/api/google-sheets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: sheetUrl.trim(),
          sheetName,
          tabs: selectedTabs.map(t => ({
            sheetId: t.sheetId,
            title: t.title,
            index: t.index,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Import failed');
        setStep('tabs');
        return;
      }

      setImportedTables(data.tables || []);
      setStep('done');
    } catch {
      setError('Import failed unexpectedly');
      setStep('tabs');
    }
  }

  function handleDone() {
    onClose();
    router.refresh();
    // Navigate to the first imported table
    if (importedTables.length > 0) {
      router.push('/tables/' + importedTables[0].id);
    }
  }

  function toggleTab(index: number) {
    setTabs(prev => prev.map((t, i) => i === index ? { ...t, selected: !t.selected } : t));
  }

  function selectAllTabs() {
    setTabs(prev => prev.map(t => ({ ...t, selected: true })));
  }

  function deselectAllTabs() {
    setTabs(prev => prev.map(t => ({ ...t, selected: false })));
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zm-9.75 15h-3v-3h3v3zm0-4.5h-3v-3h3v3zm0-4.5h-3V6h3v3zm4.5 9h-3v-3h3v3zm0-4.5h-3v-3h3v3zm0-4.5h-3V6h3v3zm4.5 9h-3v-3h3v3zm0-4.5h-3v-3h3v3zm0-4.5h-3V6h3v3z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Connect Google Sheet</h2>
                <p className="text-xs text-gray-500">
                  {step === 'url' && 'Paste your sheet URL'}
                  {step === 'verify' && 'Verifying access...'}
                  {step === 'tabs' && 'Select tabs to import'}
                  {step === 'importing' && 'Importing data...'}
                  {step === 'done' && 'Import complete!'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Step 1: Paste URL */}
            {step === 'url' && (
              <div className="space-y-5">
                {/* Service email info */}
                {serviceEmail && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-xs font-medium text-blue-900 mb-2">First, share your Google Sheet with this email as an Editor:</p>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-xs font-mono text-gray-900 select-all truncate">
                        {serviceEmail}
                      </code>
                      <button onClick={copyEmail}
                        className={`px-3 py-2 text-xs rounded-lg transition-colors flex-shrink-0 ${emailCopied ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                        {emailCopied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[10px] text-blue-600 mt-2">Open your Google Sheet → Click Share → Paste this email → Give Editor access</p>
                  </div>
                )}

                {!serviceEmail && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-xs text-amber-800">Google Sheets integration is not configured. Ask your admin to set it up in Admin Panel → Google Sheets.</p>
                  </div>
                )}

                {/* URL input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Google Sheet URL</label>
                  <input
                    type="url"
                    value={sheetUrl}
                    onChange={e => { setSheetUrl(e.target.value); setError(''); }}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleVerify(); }}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs text-red-800">❌ {error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Select Tabs */}
            {step === 'tabs' && (
              <div className="space-y-4">
                {/* Sheet name */}
                <div className="flex items-center space-x-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zm-9.75 15h-3v-3h3v3zm0-4.5h-3v-3h3v3zm0-4.5h-3V6h3v3zm4.5 9h-3v-3h3v3zm0-4.5h-3v-3h3v3zm0-4.5h-3V6h3v3zm4.5 9h-3v-3h3v3zm0-4.5h-3v-3h3v3zm0-4.5h-3V6h3v3z"/>
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-green-900">{sheetName}</p>
                    <p className="text-[10px] text-green-700">{tabs.length} tab{tabs.length !== 1 ? 's' : ''} found</p>
                  </div>
                </div>

                {/* Tab selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Select tabs to import</label>
                    <div className="flex items-center space-x-2 text-[10px]">
                      <button onClick={selectAllTabs} className="text-blue-600 hover:text-blue-800">Select all</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={deselectAllTabs} className="text-blue-600 hover:text-blue-800">Deselect all</button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {tabs.map((tab, i) => (
                      <label key={i} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                        tab.selected ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}>
                        <div className="flex items-center space-x-3">
                          <input type="checkbox" checked={tab.selected} onChange={() => toggleTab(i)}
                            className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{tab.title}</p>
                            <p className="text-[10px] text-gray-400">{tab.rowCount} rows × {tab.columnCount} cols</p>
                          </div>
                        </div>
                        {tab.selected && <span className="text-green-500 text-sm">✓</span>}
                      </label>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-gray-400">Each selected tab will become a separate table in Agora. Column types will be auto-detected from your data.</p>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs text-red-800">❌ {error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Importing */}
            {step === 'importing' && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto mb-4" />
                <p className="text-sm font-medium text-gray-900 mb-1">Importing from Google Sheets...</p>
                <p className="text-xs text-gray-500">{importProgress || 'Reading sheet data...'}</p>
              </div>
            )}

            {/* Step 4: Done */}
            {step === 'done' && (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">🎉</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Import Complete!</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Successfully imported {importedTables.length} table{importedTables.length !== 1 ? 's' : ''} from "{sheetName}"
                </p>
                <div className="space-y-2 text-left max-w-sm mx-auto">
                  {importedTables.map((t: any) => (
                    <div key={t.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <span className="text-lg">{t.icon || '📊'}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{t.name}</p>
                        <p className="text-[10px] text-gray-400">{t.columnCount} columns, {t.rowCount} rows</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
            {step === 'url' && (
              <>
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={handleVerify} disabled={!sheetUrl.trim() || !serviceEmail || loading}
                  className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                  {loading ? 'Verifying...' : 'Connect'}
                </button>
              </>
            )}
            {step === 'tabs' && (
              <>
                <button onClick={() => setStep('url')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">← Back</button>
                <button onClick={handleImport} disabled={tabs.filter(t => t.selected).length === 0}
                  className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                  Import {tabs.filter(t => t.selected).length} Tab{tabs.filter(t => t.selected).length !== 1 ? 's' : ''}
                </button>
              </>
            )}
            {step === 'importing' && (
              <div className="w-full text-center text-xs text-gray-400">Please wait...</div>
            )}
            {step === 'done' && (
              <>
                <div />
                <button onClick={handleDone}
                  className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                  Open Table
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}