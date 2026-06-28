'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const FILTERS = [
  { key: 'all', label: 'All', icon: '📬' },
  { key: 'unread', label: 'Unread', icon: '🔵' },
  { key: 'approvals', label: 'Approvals', icon: '🔔' },
  { key: 'changes', label: 'Changes', icon: '✏️' },
  { key: 'forms', label: 'Forms', icon: '📋' },
  { key: 'comments', label: 'Comments', icon: '💬' },
];

export function NotificationsClient() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => { fetchNotifications(); }, [filter]);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?filter=${filter}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setTotal(data.total);
        setUnreadCount(data.unreadCount);
      }
    } catch {} finally { setLoading(false); }
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function toggleRead(id: string, currentlyRead: boolean) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], markUnread: currentlyRead }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: !currentlyRead } : n));
    setUnreadCount(prev => currentlyRead ? prev + 1 : Math.max(0, prev - 1));
  }

  async function deleteNotification(id: string) {
    await fetch('/api/notifications', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    const notif = notifications.find(n => n.id === id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setTotal(prev => prev - 1);
    if (notif && !notif.isRead) setUnreadCount(prev => Math.max(0, prev - 1));
  }

  function getIcon(type: string) {
    switch (type) {
      case 'approval_requested': return '🔔';
      case 'approval_completed': return '✅';
      case 'row_created': return '➕';
      case 'row_updated': return '✏️';
      case 'row_deleted': return '🗑️';
      case 'form_submitted': return '📋';
      case 'comment_added': return '💬';
      default: return '📌';
    }
  }

  function getTypeLabel(type: string) {
    switch (type) {
      case 'approval_requested': return 'Approval Request';
      case 'approval_completed': return 'Approval Complete';
      case 'row_created': return 'New Record';
      case 'row_updated': return 'Record Updated';
      case 'row_deleted': return 'Record Deleted';
      case 'form_submitted': return 'Form Submission';
      case 'comment_added': return 'Comment';
      default: return 'Notification';
    }
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 24) return `${hrs} hours ago`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Notifications</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="px-4 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
              Mark all as read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center space-x-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filter === f.key
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <span className="mr-1">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="text-5xl mb-4">
              {filter === 'all' ? '🎉' : filter === 'unread' ? '✨' : '📭'}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {filter === 'unread' ? 'All caught up!' : 'No notifications'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filter === 'unread' ? 'You have no unread notifications.' : `No ${filter === 'all' ? '' : filter + ' '}notifications yet.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {notifications.map(n => (
              <div
                key={n.id}
                className={`px-8 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group ${
                  !n.isRead ? 'bg-blue-50/30 dark:bg-blue-900/5 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'
                }`}
                onClick={() => { if (!n.isRead) markRead(n.id); }}
              >
                <div className="flex items-start space-x-4">
                  <span className="text-2xl flex-shrink-0 mt-0.5">{getIcon(n.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center space-x-2">
                        <h4 className={`text-sm font-semibold ${!n.isRead ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                          {n.title}
                        </h4>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          n.type.startsWith('approval') ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                          : n.type.startsWith('form') ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          {getTypeLabel(n.type)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {!n.isRead && <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />}
                        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{formatTime(n.createdAt)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{n.message}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center space-x-3">
                        {n.type === 'approval_requested' && n.metadata?.token && (
                          <Link
                            href={`/approvals/${n.metadata.token}`}
                            className="text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-800 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1 rounded-lg"
                            onClick={e => e.stopPropagation()}
                          >
                            Review & Approve →
                          </Link>
                        )}
                        {n.tableId && (
                          <Link
                            href={`/tables/${n.tableId}`}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800"
                            onClick={e => e.stopPropagation()}
                          >
                            Open table →
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => { e.stopPropagation(); toggleRead(n.id, n.isRead); }}
                          className="px-2 py-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                          title={n.isRead ? 'Mark as unread' : 'Mark as read'}
                        >
                          {n.isRead ? '🔵 Unread' : '✓ Read'}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteNotification(n.id); }}
                          className="px-2 py-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Delete notification"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}