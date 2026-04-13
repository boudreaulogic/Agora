'use client';

import { useState, useEffect, useRef } from 'react';
import { EditableCell } from './EditableCell';

export function RowExpandPanel({
  row,
  rows,
  columns,
  tableId,
  onClose,
  onNavigate,
  readOnly = false,
  permissionLevel,
  session,
  columnPermissions = {},
  onCellUpdate,
  onRowLockChange,
  wsSend,
  wsSubscribe,
}: {
  row: any;
  rows: any[];
  columns: any[];
  tableId: string;
  onClose: () => void;
  onNavigate: (row: any) => void;
  readOnly?: boolean;
  permissionLevel?: string;
  session?: any;
  columnPermissions?: Record<string, { canView: boolean; canEdit: boolean }>;
  onCellUpdate?: (rowId: string, columnId: string, value: any) => void;
  onRowLockChange?: (rowId: string, isLocked: boolean) => void;
  wsSend?: (message: any) => void;
  wsSubscribe?: (handler: (message: any) => void) => () => void;
}) {
  const currentIndex = rows.findIndex(r => r.id === row.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < rows.length - 1;

  // Approval state
  const [approvalRequests, setApprovalRequests] = useState<any[]>([]);
  const [approvalReason, setApprovalReason] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [showApprovalReason, setShowApprovalReason] = useState<string | null>(null);

  // Comments state
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Row locking state
  const [isLocked, setIsLocked] = useState(row.isLocked || false);
  const [lockedById, setLockedById] = useState(row.lockedById || null);
  const [isTogglingLock, setIsTogglingLock] = useState(false);

  const isOwnerOrAdmin = permissionLevel === 'owner' || permissionLevel === 'admin';
  const canToggleLock = isOwnerOrAdmin || (lockedById === session?.user?.id);
  const isLockedForMe = isLocked && !isOwnerOrAdmin && lockedById !== session?.user?.id;
  const effectiveReadOnly = readOnly || isLockedForMe;

  // Sync lock state when row changes
  useEffect(() => {
    setIsLocked(row.isLocked || false);
    setLockedById(row.lockedById || null);
  }, [row.id, row.isLocked, row.lockedById]);

  async function toggleLock() {
    if (isTogglingLock) return;
    setIsTogglingLock(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/rows/${row.id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lock: !isLocked }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsLocked(data.row.isLocked);
        setLockedById(data.row.lockedById);
        onRowLockChange?.(row.id, data.row.isLocked);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to toggle lock');
      }
    } catch (e) {
      console.error('Error toggling lock:', e);
    } finally {
      setIsTogglingLock(false);
    }
  }

  function goNext() {
    if (hasNext) onNavigate(rows[currentIndex + 1]);
  }

  function goPrev() {
    if (hasPrev) onNavigate(rows[currentIndex - 1]);
  }
  
  // Fetch approval requests for this row
  useEffect(() => {
    async function fetchApprovals() {
      try {
        const res = await fetch(`/api/tables/${tableId}/approvals`);
        if (res.ok) {
          const workflows = await res.json();
          const pending = workflows.flatMap((wf: any) =>
            (wf.requests || []).filter((r: any) => r.rowId === row.id && r.status === 'pending').map((r: any) => ({ ...r, workflowName: wf.name }))
          );
          setApprovalRequests(pending);
        }
      } catch {}
    }
    fetchApprovals();
  }, [row.id, tableId]);

  async function handleApprovalAction(requestToken: string, action: 'approve' | 'deny') {
    setIsApproving(true);
    try {
      const res = await fetch(`/api/approvals/${requestToken}?action=${action}&userId=${session?.user?.id}&reason=${encodeURIComponent(approvalReason)}`);
      if (res.ok) {
        setApprovalRequests(prev => prev.filter(r => r.token !== requestToken));
        setShowApprovalReason(null);
        setApprovalReason('');
        window.location.reload();
      }
    } catch {} finally { setIsApproving(false); }
  }

  // Fetch comments when row changes
  useEffect(() => {
    async function fetchComments() {
      setIsLoadingComments(true);
      try {
        const response = await fetch(`/api/tables/${tableId}/rows/${row.id}/comments`);
        if (response.ok) {
          const data = await response.json();
          setComments(data);
        }
      } catch (error) {
        console.error('Error fetching comments:', error);
      } finally {
        setIsLoadingComments(false);
      }
    }
    fetchComments();
  }, [row.id, tableId]);

  // Scroll to bottom ONLY when user posts a new comment
  const prevCommentsCountRef = useRef(0);
  const userPostedRef = useRef(false);
  useEffect(() => {
    if (userPostedRef.current && comments.length > prevCommentsCountRef.current && commentsEndRef.current && showComments) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
      userPostedRef.current = false;
    }
    prevCommentsCountRef.current = comments.length;
  }, [comments.length]);

  // Listen for WebSocket comments from other users
  useEffect(() => {
    if (!wsSubscribe) return;
    const unsubscribe = wsSubscribe((message: any) => {
      if (message.type === 'row-comment' && message.rowId === row.id) {
        setComments(prev => {
          if (prev.some(c => c.id === message.comment.id)) return prev;
          return [...prev, message.comment];
        });
      }
    });
    return unsubscribe;
  }, [wsSubscribe, row.id]);

  async function handlePostComment() {
    if (!newComment.trim() || isPostingComment) return;

    setIsPostingComment(true);
    try {
      const response = await fetch(`/api/tables/${tableId}/rows/${row.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newComment.trim() }),
      });

      if (response.ok) {
        const comment = await response.json();
        userPostedRef.current = true;
        setComments(prev => [...prev, comment]);
        setNewComment('');
        wsSend?.({ type: 'row-comment', rowId: row.id, comment });
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to post comment');
      }
    } catch (error) {
      console.error('Error posting comment:', error);
    } finally {
      setIsPostingComment(false);
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' && !isTyping) {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowUp' && !isTyping) {
        e.preventDefault();
        goPrev();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, rows]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-20 z-30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-40 flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
              <button
                onClick={goPrev}
                disabled={!hasPrev}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous row (↑)"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={goNext}
                disabled={!hasNext}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next row (↓)"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <span className="text-sm text-gray-500">
              Row {currentIndex + 1} of {rows.length}
            </span>
            {isLocked && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                🔒 Locked
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {!readOnly && isOwnerOrAdmin && (
              <button
                onClick={toggleLock}
                disabled={isTogglingLock || (isLocked && !canToggleLock)}
                className={`p-2 rounded-lg transition-colors ${
                  isLocked
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'hover:bg-gray-200 text-gray-500'
                } disabled:opacity-50`}
                title={isLocked ? 'Unlock row' : 'Lock row'}
              >
                {isTogglingLock ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : isLocked ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Keyboard hint */}
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-100">
          <p className="text-xs text-blue-600">
            ↑↓ Navigate rows • Esc Close
          </p>
        </div>

        {/* Scrollable content area */}
        <div key={row.id} className="flex-1 overflow-y-auto">
          
          {/* Approval Banner */}
          {approvalRequests.length > 0 && (
            <div className="px-6 py-4 bg-orange-50 dark:bg-orange-900/10 border-b border-orange-200 dark:border-orange-800">
              {approvalRequests.map(req => (
                <div key={req.id} className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">🔔</span>
                    <div>
                      <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">Approval Pending</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400">{req.workflowName}</p>
                    </div>
                  </div>

                  {showApprovalReason ? (
                    <div className="space-y-2">
                      <textarea
                        value={approvalReason}
                        onChange={e => setApprovalReason(e.target.value)}
                        placeholder={showApprovalReason === 'approve' ? 'Reason for approval (optional)...' : 'Reason for denial (optional)...'}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 resize-none"
                      />
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleApprovalAction(req.token, showApprovalReason as 'approve' | 'deny')}
                          disabled={isApproving}
                          className={`px-4 py-2 text-xs font-semibold rounded-lg text-white disabled:opacity-50 ${
                            showApprovalReason === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                          }`}
                        >
                          {isApproving ? 'Processing...' : showApprovalReason === 'approve' ? 'Confirm Approve' : 'Confirm Deny'}
                        </button>
                        <button
                          onClick={() => { setShowApprovalReason(null); setApprovalReason(''); }}
                          className="px-4 py-2 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setShowApprovalReason('approve')}
                        className="px-4 py-2 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => setShowApprovalReason('deny')}
                        className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        ✗ Deny
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Fields */}
          <div className="px-6 py-6 space-y-6">
            {columns.filter((column: any) => !column.isSystem && column.type !== 'approval_status').map((column: any) => {
              const cellValue = row.data[column.id];
              const colPerm = columnPermissions[column.id];
              const isColumnNoEdit = colPerm && !colPerm.canEdit;
              const isFieldReadOnly = effectiveReadOnly || isColumnNoEdit;
              const isFormula = column.type === 'formula';
              const isLookup = column.type === 'lookup';
              const isRollup = column.type === 'rollup';
              const isComputed = isFormula || isLookup || isRollup;

              return (
                <div key={column.id} className="space-y-1.5">
                  <label className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">
                      {getColumnTypeIcon(column.type)}
                    </span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {column.name}
                    </span>
                    {isColumnNoEdit && !isComputed && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-500" title="You don't have edit permission for this column">
                        🔒 View only
                      </span>
                    )}
                    {isComputed && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-500">
                        Auto
                      </span>
                    )}
                  </label>

                  <div className={`border rounded-lg px-3 py-2 transition-colors min-h-[40px] ${
                    isFieldReadOnly || isComputed
                      ? 'border-gray-200 bg-gray-50 cursor-not-allowed' 
                      : 'border-gray-200 hover:border-blue-300 bg-white'
                  }`}>
                    <EditableCell
                      key={`${row.id}-${column.id}`}
                      rowId={row.id}
                      columnId={column.id}
                      columnType={column.type}
                      columnSettings={column.settings}
                      columnFormula={column.formula}
                      column={column}
                      initialValue={cellValue}
                      tableId={tableId}
                      onCellUpdate={onCellUpdate}
                      readOnly={isFieldReadOnly}
                      wsSend={wsSend as any}
                      userColor=""
                      session={session}
                      allColumns={columns}
                      rowData={row.data}
                    />
                  </div>
                </div>
              );
            })}
          </div>
		  
		  {/* Approval Audit Trail */}
          <AuditTrail tableId={tableId} rowId={row.id} />

          {/* Comments Section */}
          <div className="border-t border-gray-200">
            <button
              onClick={() => setShowComments(!showComments)}
              className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-sm font-semibold text-gray-700">
                  Comments {comments.length > 0 && `(${comments.length})`}
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${showComments ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showComments && (
              <div className="px-6 pb-6">
                {isLoadingComments ? (
                  <div className="text-center py-4">
                    <span className="text-sm text-gray-400">Loading comments...</span>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="text-2xl mb-2">💬</div>
                    <p className="text-sm text-gray-400">No comments yet</p>
                    <p className="text-xs text-gray-400 mt-1">Be the first to leave a comment</p>
                  </div>
                ) : (
                  <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex space-x-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: getUserColor(comment.userId) }}
                          title={comment.user?.name || comment.user?.email || 'Unknown'}
                        >
                          {getUserInitials(comment.user)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline space-x-2">
                            <span className="text-sm font-medium text-gray-900">
                              {comment.user?.name || comment.user?.email || 'Unknown'}
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatTimestamp(comment.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap break-words">
                            {comment.text}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={commentsEndRef} />
                  </div>
                )}

                <div className="flex space-x-2">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handlePostComment();
                      }
                    }}
                    placeholder="Write a comment... (Enter to send)"
                    rows={2}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handlePostComment}
                    disabled={!newComment.trim() || isPostingComment}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
                    title="Send comment"
                  >
                    {isPostingComment ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {effectiveReadOnly ? '🔒 This row is locked or read-only' : 'Click any field to edit'}
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function getColumnTypeIcon(type: string): string {
  const icons: { [key: string]: string } = {
    text: '𝐓',
    number: '#',
    currency: '$',
    percent: '%',
    date: '📅',
    datetime: '🕐',
    email: '✉',
    phone: '📞',
    url: '🔗',
    select: '◉',
    multiselect: '◈',
    checkbox: '☑',
    rating: '★',
    textarea: '¶',
    attachment: '📎',
    formula: 'ƒ',
    lookup: '👀',
    linked_record: '🔗',
    rollup: '📊',
  };
  return icons[type] || '𝐓';
}

function AuditTrail({ tableId, rowId }: { tableId: string; rowId: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/api/tables/${tableId}/rows/${rowId}/audit`)
      .then(r => r.json())
      .then(data => {
        if (data.entries) setEntries(data.entries);
        if (data.chainValid !== undefined) setChainValid(data.chainValid);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, tableId, rowId]);

  function getActionIcon(action: string) {
    switch (action) {
      case 'submitted': return '📤';
      case 'stage_approved': return '✅';
      case 'stage_denied': return '❌';
      case 'advanced': return '➡️';
      case 'completed': return '🎉';
      case 'denied': return '🚫';
      case 'cancelled': return '🔄';
      default: return '📌';
    }
  }

  function getActionLabel(action: string) {
    switch (action) {
      case 'submitted': return 'Submitted for Approval';
      case 'stage_approved': return 'Stage Approved';
      case 'stage_denied': return 'Stage Denied';
      case 'advanced': return 'Advanced to Next Stage';
      case 'completed': return 'Fully Approved';
      case 'denied': return 'Request Denied';
      case 'cancelled': return 'Cancelled';
      default: return action;
    }
  }

  if (entries.length === 0 && !isOpen) {
    return (
      <div className="border-t border-gray-200">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-sm font-semibold text-gray-700">Approval Audit Trail</span>
          </div>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">
            Approval Audit Trail {entries.length > 0 && `(${entries.length})`}
          </span>
          {chainValid !== null && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
              chainValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {chainValid ? '🔗 Chain Valid' : '⚠️ Chain Broken'}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-6 pb-6">
          {loading ? (
            <div className="text-center py-4">
              <span className="text-sm text-gray-400">Loading audit trail...</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-2xl mb-2">🛡️</div>
              <p className="text-sm text-gray-400">No approval history for this row</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

              <div className="space-y-4">
                {entries.map((entry: any, i: number) => (
                  <div key={entry.id} className="relative flex items-start space-x-4 pl-2">
                    <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                      entry.action === 'completed' ? 'bg-green-500 text-white' :
                      entry.action === 'denied' || entry.action === 'stage_denied' ? 'bg-red-500 text-white' :
                      entry.action === 'submitted' ? 'bg-blue-500 text-white' :
                      entry.action === 'stage_approved' ? 'bg-green-400 text-white' :
                      'bg-gray-300 text-white'
                    }`}>
                      <span className="text-[10px]">{getActionIcon(entry.action)}</span>
                    </div>

                    <div className="flex-1 min-w-0 pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-gray-900">{getActionLabel(entry.action)}</span>
                          {entry.stageName && (
                            <span className="text-[10px] text-gray-400 ml-1.5">— {entry.stageName}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {entry.actorName === 'System' ? 'Automatic' : `By ${entry.actorName}`}
                        {entry.actorEmail && entry.actorName !== 'System' && (
                          <span className="text-gray-400"> ({entry.actorEmail})</span>
                        )}
                      </p>
                      {entry.reason && (
                        <div className="mt-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                          <p className="text-xs text-gray-600 italic">"{entry.reason}"</p>
                        </div>
                      )}
                      <div className="mt-1 flex items-center space-x-1">
                        <span className="text-[8px] font-mono text-gray-300 truncate max-w-[120px]" title={entry.entryHash}>
                          #{entry.entryHash?.substring(0, 12)}
                        </span>
                        {entry.previousHash && (
                          <span className="text-[8px] text-gray-300">← #{entry.previousHash?.substring(0, 8)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}