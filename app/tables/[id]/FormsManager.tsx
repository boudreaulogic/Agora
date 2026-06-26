'use client';

import { useState, useEffect } from 'react';
import { FormEditor } from './FormEditor';

export function FormsManager({
  tableId,
  columns = [],
  isOpen,
  onClose,
}: {
  tableId: string;
  columns?: any[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [editingForm, setEditingForm] = useState<any>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  useEffect(() => { if (isOpen) fetchForms(); }, [isOpen]);

  async function fetchForms() {
    setLoading(true);
    try {
      const res = await fetch('/api/tables/' + tableId + '/forms');
      if (res.ok) { const data = await res.json(); setForms(data.forms || []); }
    } finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!newFormName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/tables/' + tableId + '/forms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFormName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        const form = data.form;
        if (!form.pages) {
          form.pages = [{ id: 'page_1', title: 'Page 1', description: '' }];
          form.fields = (form.fields || []).map((f: any) => ({ ...f, pageId: 'page_1' }));
        }
        setForms(prev => [...prev, form]);
        setNewFormName('');
        setJustCreated(form.id);
        setEditingForm(form);
        setTimeout(() => setJustCreated(null), 3000);
      }
    } finally { setCreating(false); }
  }

  async function handleToggleActive(form: any) {
    const res = await fetch('/api/tables/' + tableId + '/forms/' + form.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !form.isActive }),
    });
    if (res.ok) setForms(prev => prev.map(f => f.id === form.id ? { ...f, isActive: !f.isActive } : f));
  }

  async function handleDelete(formId: string) {
    if (!confirm('Delete this form?')) return;
    const res = await fetch('/api/tables/' + tableId + '/forms/' + formId, { method: 'DELETE' });
    if (res.ok) {
      setForms(prev => prev.filter(f => f.id !== formId));
      if (editingForm?.id === formId) setEditingForm(null);
    }
  }

  async function handleUpdateForm(formId: string, updates: any) {
    const res = await fetch('/api/tables/' + tableId + '/forms/' + formId, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      setForms(prev => prev.map(f => f.id === formId ? data.form : f));
      setEditingForm(data.form);
    }
  }

  function copyFormLink(slug: string) {
    navigator.clipboard.writeText(window.location.origin + '/forms/' + slug);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  }

  function copyEmbedCode(slug: string) {
    const origin = window.location.origin;
    const src = origin + '/forms/' + slug + '?embed=1';
    // iframe + a small script that (1) auto-resizes the frame to the form's
    // height (no scrollbars/dead space) and (2) passes the host page's font in
    // so the form matches your site. Paste into a "Custom HTML" block.
    const code =
      '<iframe id="agora-form-' + slug + '" src="' + src + '" style="width:100%;border:0;overflow:hidden;background:transparent;" scrolling="no" allowtransparency="true"></iframe>\n' +
      '<script>(function(){var f=document.getElementById("agora-form-' + slug + '");' +
      'window.addEventListener("message",function(e){if(e.origin!=="' + origin + '")return;' +
      'if(e.data&&e.data.type==="agora-form-height"&&e.data.slug==="' + slug + '"){f.style.height=e.data.height+"px";}});' +
      'f.addEventListener("load",function(){try{f.contentWindow.postMessage({type:"agora-parent-style",fontFamily:getComputedStyle(document.body).fontFamily},"' + origin + '");}catch(x){}});' +
      '})();<\/script>';
    navigator.clipboard.writeText(code);
    setCopiedSlug(slug + '-embed');
    setTimeout(() => setCopiedSlug(null), 2000);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{editingForm ? '📋 Form Builder' : '📋 Forms'}</h2>
            {justCreated && <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full animate-pulse">✓ Created!</span>}
          </div>
          <div className="flex items-center space-x-2">
            {editingForm && <button onClick={() => setEditingForm(null)} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 mr-2">← Back</button>}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {editingForm ? (
            <FormEditor form={editingForm} tableColumns={columns} onUpdate={(u: any) => handleUpdateForm(editingForm.id, u)} onCopyLink={() => copyFormLink(editingForm.slug)} onCopyEmbed={() => copyEmbedCode(editingForm.slug)} copiedSlug={copiedSlug} />
          ) : (
            <div className="p-6 overflow-y-auto h-full">
              <div className="mb-6 flex space-x-2">
                <input type="text" value={newFormName} onChange={e => setNewFormName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                  placeholder="New form name..." className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200" />
                <button onClick={handleCreate} disabled={!newFormName.trim() || creating} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create Form'}
                </button>
              </div>

              {loading ? <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
              : forms.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📋</div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No forms yet</h3>
                  <p className="text-xs text-gray-500">Create a form to collect data — no login required.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {forms.map(form => (
                    <div key={form.id} className={'border rounded-lg p-4 transition-colors ' + (justCreated === form.id ? 'border-green-400 bg-green-50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300')}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{form.name}</h3>
                          <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ' + (form.isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
                            {form.isActive ? 'Active' : 'Inactive'}
                          </span>
                          {form.pages?.length > 1 && <span className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 px-1.5 py-0.5 rounded">{form.pages.length} pages</span>}
                        </div>
                        <div className="flex items-center space-x-2">
                          <button onClick={() => {
                            const f = { ...form };
                            if (!f.pages) { f.pages = [{ id: 'page_1', title: 'Page 1', description: '' }]; f.fields = (f.fields || []).map((fld: any) => ({ ...fld, pageId: 'page_1' })); }
                            setEditingForm(f);
                          }} className="text-xs text-blue-600 dark:text-blue-400">Edit</button>
                          <button onClick={() => handleToggleActive(form)} className="text-xs text-gray-500">{form.isActive ? 'Disable' : 'Enable'}</button>
                          <button onClick={() => handleDelete(form.id)} className="text-xs text-red-500">Delete</button>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 mt-2">
                        <button onClick={() => copyFormLink(form.slug)} className="text-[10px] text-gray-500 hover:text-blue-600 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">{copiedSlug === form.slug ? '✓ Copied!' : '🔗 Link'}</button>
                        <button onClick={() => copyEmbedCode(form.slug)} className="text-[10px] text-gray-500 hover:text-blue-600 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">{copiedSlug === form.slug + '-embed' ? '✓ Copied!' : '📋 Embed'}</button>
                        <a href={'/forms/' + form.slug} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-500 hover:text-blue-600 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">↗ Open</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}