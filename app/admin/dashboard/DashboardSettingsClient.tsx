'use client';

import { useState, useEffect } from 'react';

export function DashboardSettingsClient() {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then(r => r.json())
      .then(data => setForms(data.allForms || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggleForm(formId: string) {
    const updated = forms.map(f =>
      f.id === formId ? { ...f, isFeatured: !f.isFeatured } : f
    );
    setForms(updated);

    setSaving(true);
    try {
      await fetch('/api/admin/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featuredFormIds: updated.filter(f => f.isFeatured).map(f => f.id),
        }),
      });
    } catch {} finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Dashboard Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Choose which forms appear as Quick Actions on everyone's home dashboard.</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : forms.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="text-3xl mb-3">📋</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">No active forms found. Create a form on a table first.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Active Forms</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{forms.filter(f => f.isFeatured).length} featured</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {forms.map(form => (
              <div key={form.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{form.tableIcon || '📋'}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{form.name}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{form.tableName}{form.description ? ' — ' + form.description : ''}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleForm(form.id)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${form.isFeatured ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isFeatured ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
          {saving && (
            <div className="px-5 py-2 bg-blue-50 text-xs text-blue-600 text-center">Saving...</div>
          )}
        </div>
      )}
    </div>
  );
}