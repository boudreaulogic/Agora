'use client';

import { useState, useEffect } from 'react';

const EMOJI_OPTIONS = ['📊', '📁', '📝', '🗂️', '📋', '🏢', '👥', '💼', '🛒', '📦', '🎯', '✅', '🔧', '💰', '🏫', '🏥'];

export function EditTableModal({ 
  table, 
  isOpen, 
  onClose 
}: { 
  table: any;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(table.name);
  const [description, setDescription] = useState(table.description || '');
  const [icon, setIcon] = useState(table.icon || '📊');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(table.name);
      setDescription(table.description || '');
      setIcon(table.icon || '📊');
    }
  }, [isOpen, table]);

  async function handleUpdate() {
    if (!name.trim()) {
      alert('Table name is required');
      return;
    }

    setIsUpdating(true);

    try {
      const response = await fetch(`/api/tables/${table.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          icon,
        }),
      });

      if (response.ok) {
        onClose(); // ⬅️ ADDED: Close modal first
        window.location.reload(); // Then refresh
      } else {
        alert('Failed to update table');
      }
    } catch (error) {
      console.error('Error updating table:', error);
      alert('Error updating table');
    } finally {
      setIsUpdating(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Edit Table</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Table Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Table Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          {/* Icon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Icon
            </label>
            <div className="flex items-center space-x-4">
              <div className="text-4xl">{icon}</div>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    className={`text-2xl p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                      icon === emoji ? 'bg-blue-100 ring-2 ring-blue-500' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
              placeholder="What is this table for?"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={isUpdating || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isUpdating ? 'Updating...' : 'Update Table'}
          </button>
        </div>
      </div>
    </div>
  );
}