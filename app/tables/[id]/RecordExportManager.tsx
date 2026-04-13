'use client';

import { useState, useEffect, useRef } from 'react';

function SearchableColumnSelect({ value, onChange, columns }: { value: string; onChange: (val: string) => void; columns: any[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = columns.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.type.toLowerCase().includes(search.toLowerCase())
  );

  const selected = columns.find(c => c.id === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        className={`w-full px-2.5 py-1.5 text-xs border rounded-lg text-left flex items-center justify-between ${
          value ? 'border-green-300 bg-green-50/30 text-gray-900' : 'border-gray-300 bg-white text-gray-400'
        }`}
      >
        <span className="truncate">{selected ? `${selected.name} (${selected.type})` : '— Not mapped —'}</span>
        <svg className="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-1.5 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search columns..."
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent text-gray-900"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            <button
              onClick={() => { onChange(''); setIsOpen(false); setSearch(''); }}
              className={`w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 ${!value ? 'bg-blue-50 text-blue-700' : 'text-gray-400'}`}
            >
              — Not mapped —
            </button>
            {filtered.map(col => (
              <button
                key={col.id}
                onClick={() => { onChange(col.id); setIsOpen(false); setSearch(''); }}
                className={`w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center justify-between ${
                  value === col.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
              >
                <span>{col.name}</span>
                <span className="text-gray-400 text-[10px]">{col.type}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">No columns match</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RecordExportManager({
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
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTemplate, setActiveTemplate] = useState<any>(null);
  const [extractedFields, setExtractedFields] = useState<any[]>([]);
  const [fieldMappings, setFieldMappings] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) fetchTemplates();
  }, [isOpen]);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/record-export`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', newName || file.name.replace('.pdf', ''));
      formData.append('description', newDescription);

      const res = await fetch(`/api/tables/${tableId}/record-export`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setTemplates(prev => [data.template, ...prev]);
        setActiveTemplate(data.template);
        setExtractedFields(data.extractedFields || []);
        // Initialize empty mappings
        setFieldMappings(data.extractedFields.map((f: any) => ({
          pdfFieldName: f.name,
          pdfFieldType: f.type,
          columnId: '',
        })));
        setNewName('');
        setNewDescription('');
      } else {
        const err = await res.json();
        alert(err.error || 'Upload failed');
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function loadTemplate(template: any) {
    setActiveTemplate(template);
    try {
      const res = await fetch(`/api/tables/${tableId}/record-export/${template.id}`);
      if (res.ok) {
        const data = await res.json();
        setExtractedFields(data.extractedFields || []);
        const existingMappings = (data.template.fieldMappings as any[]) || [];
        // Merge extracted fields with existing mappings
        const merged = data.extractedFields.map((f: any) => {
          const existing = existingMappings.find((m: any) => m.pdfFieldName === f.name);
          return {
            pdfFieldName: f.name,
            pdfFieldType: f.type,
            columnId: existing?.columnId || '',
          };
        });
        setFieldMappings(merged);
      }
    } catch {}
  }

  async function saveMappings() {
    if (!activeTemplate) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/record-export/${activeTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldMappings }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveTemplate(data.template);
        setTemplates(prev => prev.map(t => t.id === data.template.id ? data.template : t));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleAuditPage() {
    if (!activeTemplate) return;
    const res = await fetch(`/api/tables/${tableId}/record-export/${activeTemplate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includeAuditPage: !activeTemplate.includeAuditPage }),
    });
    if (res.ok) {
      const data = await res.json();
      setActiveTemplate(data.template);
      setTemplates(prev => prev.map(t => t.id === data.template.id ? data.template : t));
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    const res = await fetch(`/api/tables/${tableId}/record-export/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (activeTemplate?.id === id) {
        setActiveTemplate(null);
        setExtractedFields([]);
        setFieldMappings([]);
      }
    }
  }

  function updateMapping(index: number, columnId: string) {
    setFieldMappings(prev => prev.map((m, i) => i === index ? { ...m, columnId } : m));
  }

  // Auto-map fields by name matching
  function autoMap() {
    setFieldMappings(prev => prev.map(m => {
      if (m.columnId) return m; // Don't override existing mappings
      // Try to find a column with a matching name
      const normalizedFieldName = m.pdfFieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = columns.find(c => {
        const normalizedColName = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normalizedColName === normalizedFieldName
          || normalizedColName.includes(normalizedFieldName)
          || normalizedFieldName.includes(normalizedColName);
      });
      return match ? { ...m, columnId: match.id } : m;
    }));
  }

  if (!isOpen) return null;

  const mappedCount = fieldMappings.filter(m => m.columnId).length;
  const totalFields = fieldMappings.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
              <span>📄</span>
              <span>Record Export</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Upload PDF templates and map fields to table columns</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar — Templates list */}
          <div className="w-64 border-r border-gray-200 flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Templates</h3>

              {/* Upload new */}
              <div className="space-y-2 mb-3">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Template name..."
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center space-x-1.5"
                >
                  {isUploading ? (
                    <span>Uploading...</span>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Upload PDF Template</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Template list */}
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="text-center py-8 text-xs text-gray-400">Loading...</div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-400">
                  <p className="text-2xl mb-2">📄</p>
                  <p>No templates yet</p>
                  <p className="text-gray-300 mt-1">Upload a fillable PDF to get started</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {templates.map(t => (
                    <div
                      key={t.id}
                      onClick={() => loadTemplate(t)}
                      className={`p-2.5 rounded-lg cursor-pointer transition-colors ${
                        activeTemplate?.id === t.id
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{t.name}</p>
                          <p className="text-[10px] text-gray-400 truncate">{t.originalFilename}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            {t.includeAuditPage && (
                              <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Audit</span>
                            )}
                            <span className="text-[9px] text-gray-400">
                              {(t.fieldMappings as any[])?.filter((m: any) => m.columnId).length || 0} mapped
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); deleteTemplate(t.id); }}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right — Field mapping editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!activeTemplate ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-sm">Select or upload a template to configure field mappings</p>
                </div>
              </div>
            ) : (
              <>
                {/* Template header */}
                <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{activeTemplate.name}</h3>
                    <p className="text-[10px] text-gray-400">{mappedCount} of {totalFields} fields mapped</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={autoMap}
                      className="px-3 py-1.5 text-xs text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50"
                    >
                      ✨ Auto-Map
                    </button>
					<select
                      value={activeTemplate.filenameColumnId || ''}
                      onChange={async (e) => {
                        const res = await fetch(`/api/tables/${tableId}/record-export/${activeTemplate.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ filenameColumnId: e.target.value || null }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setActiveTemplate(data.template);
                          setTemplates(prev => prev.map(t => t.id === data.template.id ? data.template : t));
                        }
                      }}
                      className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700"
                    >
                      <option value="">Filename: Default</option>
                      {columns.filter(c => ['text', 'email', 'number'].includes(c.type)).map(col => (
                        <option key={col.id} value={col.id}>Filename: {col.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={toggleAuditPage}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        activeTemplate.includeAuditPage
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500'
                      }`}
                    >
                      {activeTemplate.includeAuditPage ? '✅ Audit Page On' : '○ Audit Page Off'}
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="px-6 py-2 flex-shrink-0">
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${totalFields > 0 ? (mappedCount / totalFields) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Field mappings */}
                <div className="flex-1 overflow-y-auto px-6 py-3">
                  {extractedFields.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-2xl mb-2">⚠️</p>
                      <p className="text-sm">No fillable form fields found in this PDF</p>
                      <p className="text-xs text-gray-300 mt-1">Make sure your PDF has form fields (not just text)</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-4 px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        <span>PDF Field</span>
                        <span>Table Column</span>
                      </div>
                      {fieldMappings.map((mapping, index) => (
                        <div
                          key={mapping.pdfFieldName}
                          className={`grid grid-cols-2 gap-4 px-3 py-2.5 rounded-lg border transition-colors ${
                            mapping.columnId ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${mapping.columnId ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{mapping.pdfFieldName}</p>
                              <p className="text-[10px] text-gray-400">{mapping.pdfFieldType}</p>
                            </div>
                          </div>
                          <SearchableColumnSelect
                            value={mapping.columnId}
                            onChange={(val) => updateMapping(index, val)}
                            columns={columns.filter(c => !['formula', 'lookup', 'rollup', 'approval_status'].includes(c.type))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Save bar */}
                <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-end flex-shrink-0">
                  <button
                    onClick={saveMappings}
                    disabled={isSaving}
                    className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {isSaving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Mappings'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}