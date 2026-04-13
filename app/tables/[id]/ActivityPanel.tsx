'use client';

import { useState, useEffect } from 'react';

const ACTION_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  ROW_CREATED: { icon: '➕', label: 'Row created', color: 'text-green-700 bg-green-50' },
  ROW_DELETED: { icon: '🗑️', label: 'Row deleted', color: 'text-red-700 bg-red-50' },
  CELL_UPDATED: { icon: '✏️', label: 'Cell updated', color: 'text-blue-700 bg-blue-50' },
  COLUMN_ADDED: { icon: '📊', label: 'Column added', color: 'text-purple-700 bg-purple-50' },
  COLUMN_DELETED: { icon: '❌', label: 'Column deleted', color: 'text-red-700 bg-red-50' },
  COLUMN_RENAMED: { icon: '🏷️', label: 'Column renamed', color: 'text-yellow-700 bg-yellow-50' },
  LINK_ADDED: { icon: '🔗', label: 'Link added', color: 'text-blue-700 bg-blue-50' },
  LINK_REMOVED: { icon: '🔗', label: 'Link removed', color: 'text-orange-700 bg-orange-50' },
  COMMENT_ADDED: { icon: '💬', label: 'Comment added', color: 'text-teal-700 bg-teal-50' },
};

export function ActivityPanel({
  tableId,
  isOpen,
  onClose,
}: {
  tableId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterAction, setFilterAction] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setPage(1);
      setActivities([]);
      fetchActivities(1);
    }
  }, [isOpen, tableId]);

  useEffect(() => {
    if (isOpen && page > 1) {
      fetchActivities(page);
    }
  }, [page]);

  async function fetchActivities(pageNum: number) {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/tables/${tableId}/activity?page=${pageNum}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        if (pageNum === 1) {
          setActivities(data.activities);
        } else {
          setActivities(prev => [...prev, ...data.activities]);
        }
        setTotalPages(data.totalPages);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Error fetching activity:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function formatTimestamp(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function getUserInitials(user: any) {
    if (user?.name) {
      return user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return '?';
  }

  function getUserColor(userId: string) {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  function renderDetails(activity: any) {
    const details = activity.details;
    if (!details) return null;

    switch (activity.action) {
      case 'CELL_UPDATED': {
        const oldVal = details.oldValue === null || details.oldValue === undefined || details.oldValue === ''
          ? '(empty)'
          : String(details.oldValue).slice(0, 50);
        const newVal = details.newValue === null || details.newValue === undefined || details.newValue === ''
          ? '(empty)'
          : String(details.newValue).slice(0, 50);
        return (
          <div className="mt-1 text-xs">
            <span className="font-medium text-gray-600">{details.columnName}:</span>
            <div className="flex items-center space-x-1 mt-0.5">
              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded line-through">{oldVal}</span>
              <span className="text-gray-400">→</span>
              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">{newVal}</span>
            </div>
          </div>
        );
      }
      case 'COLUMN_ADDED':
        return (
          <div className="mt-1 text-xs text-gray-500">
            <span className="font-medium">{details.columnName}</span> ({details.columnType})
          </div>
        );
      case 'COLUMN_RENAMED':
        return (
          <div className="mt-1 text-xs text-gray-500">
            <span className="line-through">{details.oldName}</span> → <span className="font-medium">{details.newName}</span>
          </div>
        );
      case 'LINK_ADDED':
      case 'LINK_REMOVED':
        return (
          <div className="mt-1 text-xs text-gray-500">
            {details.count} record{details.count !== 1 ? 's' : ''} via <span className="font-medium">{details.columnName}</span>
          </div>
        );
      case 'COMMENT_ADDED':
        return (
          <div className="mt-1 text-xs text-gray-500 italic">
            &ldquo;{details.textPreview}&rdquo;
          </div>
        );
      default:
        return null;
    }
  }

  function groupByDate(items: any[]) {
    const groups: { label: string; items: any[] }[] = [];
    let currentLabel = '';

    const filtered = filterAction
      ? items.filter(a => a.action === filterAction)
      : items;

    filtered.forEach((activity) => {
      const date = new Date(activity.createdAt);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

      let label: string;
      if (diffDays === 0) label = 'Today';
      else if (diffDays === 1) label = 'Yesterday';
      else if (diffDays < 7) label = `${diffDays} days ago`;
      else label = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      if (label !== currentLabel) {
        groups.push({ label, items: [] });
        currentLabel = label;
      }
      groups[groups.length - 1].items.push(activity);
    });

    return groups;
  }

  if (!isOpen) return null;

  const groups = groupByDate(activities);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-20 z-30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-40 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900">Activity Log</h2>
            {total > 0 && (
              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                {total}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-3 border-b border-gray-200 bg-white">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All activity</option>
            <option value="CELL_UPDATED">Cell updates</option>
            <option value="ROW_CREATED">Rows created</option>
            <option value="ROW_DELETED">Rows deleted</option>
            <option value="COLUMN_ADDED">Columns added</option>
            <option value="LINK_ADDED">Links added</option>
            <option value="LINK_REMOVED">Links removed</option>
            <option value="COMMENT_ADDED">Comments</option>
          </select>
        </div>

        {/* Activity List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && activities.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-gray-400">Loading activity...</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="text-3xl mb-3">📋</div>
              <p className="text-sm text-gray-500">No activity yet</p>
              <p className="text-xs text-gray-400 mt-1">Changes to this table will appear here</p>
            </div>
          ) : (
            <div className="py-2">
              {groups.map((group, gi) => (
                <div key={gi}>
                  {/* Date Header */}
                  <div className="px-6 py-2 bg-gray-50 sticky top-0 z-10">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {group.label}
                    </span>
                  </div>

                  {/* Activities */}
                  {group.items.map((activity) => {
                    const config = ACTION_CONFIG[activity.action] || {
                      icon: '📝',
                      label: activity.action,
                      color: 'text-gray-700 bg-gray-50',
                    };

                    return (
                      <div
                        key={activity.id}
                        className="px-6 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100"
                      >
                        <div className="flex items-start space-x-3">
                          {/* User Avatar */}
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: getUserColor(activity.userId) }}
                            title={activity.user?.name || activity.user?.email || 'Unknown'}
                          >
                            {getUserInitials(activity.user)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${config.color}`}>
                                {config.icon} {config.label}
                              </span>
                              <span className="text-xs text-gray-400">
                                {formatTimestamp(activity.createdAt)}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mt-0.5">
                              {activity.user?.name || activity.user?.email || 'Unknown user'}
                            </div>
                            {renderDetails(activity)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Load More */}
              {page < totalPages && (
                <div className="px-6 py-4 text-center">
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                  >
                    {isLoading ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400 text-center">
            Activity is retained for 3 weeks
          </p>
        </div>
      </div>
    </>
  );
}