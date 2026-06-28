'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CreateRoleForm({ 
  permissionsByCategory 
}: { 
  permissionsByCategory: Record<string, any[]> 
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-generate slug from name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  function togglePermission(permissionId: string) {
    setSelectedPermissions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
  }

  function toggleCategory(permissions: any[]) {
    const categoryPermissionIds = permissions.map(p => p.id);
    const allSelected = categoryPermissionIds.every(id => selectedPermissions.has(id));

    setSelectedPermissions(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        // Deselect all
        categoryPermissionIds.forEach(id => newSet.delete(id));
      } else {
        // Select all
        categoryPermissionIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      alert('Please enter a role name');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          description,
          permissionIds: Array.from(selectedPermissions),
        }),
      });

      if (response.ok) {
        router.push('/admin/roles');
        router.refresh();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error creating role:', error);
      alert('Failed to create role');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Basic Info */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Basic Information</h2>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Role Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Content Editor"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
              required
            />
          </div>

          {/* Slug (auto-generated) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Slug (auto-generated)
            </label>
            <input
              type="text"
              value={slug}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What can users with this role do?"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>
      </div>

      {/* Permissions */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Permissions</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {selectedPermissions.size} selected
          </span>
        </div>

        <div className="space-y-6">
          {Object.entries(permissionsByCategory).map(([category, permissions]) => {
            const allSelected = permissions.every(p => selectedPermissions.has(p.id));
            const someSelected = permissions.some(p => selectedPermissions.has(p.id));

            return (
              <div key={category} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                {/* Category Header */}
                <div className="flex items-center mb-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = someSelected && !allSelected;
                      }
                    }}
                    onChange={() => toggleCategory(permissions)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                  />
                  <label className="ml-3 text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                    {category}
                  </label>
                </div>

                {/* Permissions in Category */}
                <div className="ml-7 space-y-2">
                  {permissions.map((permission) => (
                    <div key={permission.id} className="flex items-start">
                      <input
                        type="checkbox"
                        checked={selectedPermissions.has(permission.id)}
                        onChange={() => togglePermission(permission.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded mt-0.5"
                      />
                      <div className="ml-3">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {permission.name}
                        </label>
                        {permission.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {permission.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end space-x-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Creating...' : 'Create Role'}
        </button>
      </div>
    </form>
  );
}
