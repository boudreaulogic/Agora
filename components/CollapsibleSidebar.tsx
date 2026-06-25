'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { SignOutButton } from './SignOutButton';
import { NotificationBell } from './NotificationBell';
import { ConnectGoogleSheetModal } from './ConnectGoogleSheetModal';
import { AgoraLogo } from './AgoraLogo';

export function CollapsibleSidebar({ tables, sharedTables, workspaces, sheetConnections, dashboards, currentTableId, isAdmin, userName, userEmail, signOutAction }: { tables: any[]; sharedTables: any[]; workspaces: any[]; sheetConnections?: any[]; dashboards?: any[]; currentTableId?: string; isAdmin: boolean; userName: string | null; userEmail: string; signOutAction: () => Promise<void> }) {
  var [isCollapsed, setIsCollapsed] = useState(false);
  var [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set(workspaces.map(function(w: any) { return w.id; })));
  var [showNewWorkspace, setShowNewWorkspace] = useState(false);
  var [newWorkspaceName, setNewWorkspaceName] = useState('');
  var [isCreating, setIsCreating] = useState(false);
  var [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set((sheetConnections || []).map(function(c: any) { return c.id; })));
  var [showConnectSheet, setShowConnectSheet] = useState(false);

  // Workspace edit state
  var [editingWorkspace, setEditingWorkspace] = useState<any>(null);
  var [editName, setEditName] = useState('');
  var [editDescription, setEditDescription] = useState('');
  var [editIcon, setEditIcon] = useState('');
  var [isSavingEdit, setIsSavingEdit] = useState(false);

  // Workspace context menu state
  var [contextMenu, setContextMenu] = useState<{ workspaceId: string; x: number; y: number } | null>(null);
  var contextMenuRef = useRef<HTMLDivElement>(null);

  // Delete confirmation state
  var [deletingWorkspace, setDeletingWorkspace] = useState<any>(null);
  var [isDeleting, setIsDeleting] = useState(false);
  
  // Sheet connection context menu state
  var [sheetContextMenu, setSheetContextMenu] = useState<{ conn: any; x: number; y: number } | null>(null);
  var sheetContextMenuRef = useRef<HTMLDivElement>(null);
  var [deletingSheet, setDeletingSheet] = useState<any>(null);
  var [isDeletingSheet, setIsDeletingSheet] = useState(false);

  // Table context menu state
  var [tableContextMenu, setTableContextMenu] = useState<{ table: any; x: number; y: number } | null>(null);
  var tableContextMenuRef = useRef<HTMLDivElement>(null);
  var [deletingTable, setDeletingTable] = useState<any>(null);
  var [isDeletingTable, setIsDeletingTable] = useState(false);

  // Members management state
  var [membersWorkspace, setMembersWorkspace] = useState<any>(null);
  var [wsMembers, setWsMembers] = useState<any[]>([]);
  var [wsUsers, setWsUsers] = useState<any[]>([]);
  var [wsGroups, setWsGroups] = useState<any[]>([]);
  var [wsRoles, setWsRoles] = useState<any[]>([]);
  var [memberTarget, setMemberTarget] = useState<'user' | 'group' | 'role'>('user');
  var [memberSelectedId, setMemberSelectedId] = useState('');
  var [memberPermission, setMemberPermission] = useState('viewer');
  var [isAddingMember, setIsAddingMember] = useState(false);
  var [isMembersLoading, setIsMembersLoading] = useState(false);

  // Drag and drop state
  var [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  var [dragOverWorkspaceId, setDragOverWorkspaceId] = useState<string | null>(null);
  var [dragOverStandalone, setDragOverStandalone] = useState(false);
  var [isMovingTable, setIsMovingTable] = useState(false);

  // ================================================================
  // Collapsible section state — persisted to localStorage so user's
  // expand/collapse choices survive page reloads.
  // ================================================================
  var [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(function() {
    try {
      var saved = localStorage.getItem('agora.sidebar.collapsedSections');
      if (saved) {
        var parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setCollapsedSections(new Set(parsed));
      }
    } catch (e) { /* ignore */ }
  }, []);

  function toggleSection(key: string) {
    setCollapsedSections(function(prev) {
      var next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem('agora.sidebar.collapsedSections', JSON.stringify(Array.from(next))); } catch (e) { /* ignore */ }
      return next;
    });
  }

  function isSectionOpen(key: string): boolean { return !collapsedSections.has(key); }

  // Close context menu when clicking outside
  useEffect(function() {
    function handleClickOutside(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return function() { document.removeEventListener('mousedown', handleClickOutside); };
    }
  }, [contextMenu]);
  
  // Close sheet context menu when clicking outside
  useEffect(function() {
    function handleClickOutside(e: MouseEvent) {
      if (sheetContextMenuRef.current && !sheetContextMenuRef.current.contains(e.target as Node)) {
        setSheetContextMenu(null);
      }
    }
    if (sheetContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return function() { document.removeEventListener('mousedown', handleClickOutside); };
    }
  }, [sheetContextMenu]);

  // Close table context menu when clicking outside
  useEffect(function() {
    function handleClickOutside(e: MouseEvent) {
      if (tableContextMenuRef.current && !tableContextMenuRef.current.contains(e.target as Node)) {
        setTableContextMenu(null);
      }
    }
    if (tableContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return function() { document.removeEventListener('mousedown', handleClickOutside); };
    }
  }, [tableContextMenu]);

  // ================================================================
  // Table CRUD
  // ================================================================
  function handleDeleteSheet() {
    if (!deletingSheet || isDeletingSheet) return;
    setIsDeletingSheet(true);
    fetch('/api/google-sheets/connections/' + deletingSheet.id, { method: 'DELETE' })
      .then(function(res) {
        if (res.ok) { setDeletingSheet(null); window.location.reload(); }
        else { res.json().then(function(data) { alert(data.error || 'Failed to delete sheet connection'); }); }
      })
      .finally(function() { setIsDeletingSheet(false); });
  }
  
  function handleDeleteTable() {
    if (!deletingTable || isDeletingTable) return;
    setIsDeletingTable(true);
    fetch('/api/tables/' + deletingTable.id, { method: 'DELETE' })
      .then(function(res) {
        if (res.ok) { setDeletingTable(null); window.location.reload(); }
        else { res.json().then(function(data) { alert(data.error || 'Failed to delete table'); }); }
      })
      .finally(function() { setIsDeletingTable(false); });
  }

  // ================================================================
  // Move table to workspace (API call)
  // ================================================================
  function moveTableToWorkspace(tableId: string, workspaceId: string | null) {
    setIsMovingTable(true);
    fetch('/api/tables/' + tableId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: workspaceId, inheritPermissions: workspaceId ? true : false }),
    })
      .then(function(res) {
        if (res.ok) { window.location.reload(); }
        else { res.json().then(function(data) { alert(data.error || 'Failed to move table'); }); }
      })
      .finally(function() { setIsMovingTable(false); });
  }

  // ================================================================
  // Drag and drop handlers
  // ================================================================
  function handleTableDragStart(e: React.DragEvent, tableId: string, tableName: string) {
    setDraggingTableId(tableId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tableId);
    // Custom ghost
    var ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;top:-1000px;background:#7C3AED;color:white;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;';
    ghost.textContent = '📊 ' + tableName;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(function() { document.body.removeChild(ghost); }, 0);
  }

  function handleTableDragEnd() {
    setDraggingTableId(null);
    setDragOverWorkspaceId(null);
    setDragOverStandalone(false);
  }

  function handleWorkspaceDragOver(e: React.DragEvent, workspaceId: string) {
    if (!draggingTableId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverWorkspaceId(workspaceId);
    setDragOverStandalone(false);
  }

  function handleWorkspaceDragLeave() {
    setDragOverWorkspaceId(null);
  }

  function handleWorkspaceDrop(e: React.DragEvent, workspaceId: string) {
    e.preventDefault();
    var tableId = draggingTableId;
    setDraggingTableId(null);
    setDragOverWorkspaceId(null);
    if (!tableId) return;
    var alreadyInWorkspace = workspaces.some(function(ws: any) {
      return ws.id === workspaceId && (ws.tables || []).some(function(t: any) { return t.id === tableId; });
    });
    if (alreadyInWorkspace) return;
    moveTableToWorkspace(tableId, workspaceId);
  }

  function handleStandaloneDragOver(e: React.DragEvent) {
    if (!draggingTableId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStandalone(true);
    setDragOverWorkspaceId(null);
  }

  function handleStandaloneDragLeave() {
    setDragOverStandalone(false);
  }

  function handleStandaloneDrop(e: React.DragEvent) {
    e.preventDefault();
    var tableId = draggingTableId;
    setDraggingTableId(null);
    setDragOverStandalone(false);
    if (!tableId) return;
    var inWorkspace = workspaces.some(function(ws: any) {
      return (ws.tables || []).some(function(t: any) { return t.id === tableId; });
    });
    if (!inWorkspace) return;
    moveTableToWorkspace(tableId, null);
  }

  // ================================================================
  // Workspace helpers
  // ================================================================
  function toggleSheet(id: string) {
    setExpandedSheets(function(prev) { var next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function toggleWorkspace(id: string) {
    setExpandedWorkspaces(function(prev) { var next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function handleCreateWorkspace() {
    if (!newWorkspaceName.trim() || isCreating) return;
    setIsCreating(true);
    fetch('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newWorkspaceName.trim() }) })
      .then(function(res) { if (res.ok) { setNewWorkspaceName(''); setShowNewWorkspace(false); window.location.reload(); } })
      .finally(function() { setIsCreating(false); });
  }

  function handleWorkspaceContextMenu(e: React.MouseEvent, workspace: any) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ workspaceId: workspace.id, x: e.clientX, y: e.clientY });
  }

  function handleWorkspaceMenuClick(e: React.MouseEvent, workspace: any) {
    e.preventDefault();
    e.stopPropagation();
    var rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({ workspaceId: workspace.id, x: rect.right, y: rect.top });
  }

  function openEditWorkspace(workspace: any) {
    setEditingWorkspace(workspace);
    setEditName(workspace.name || '');
    setEditDescription(workspace.description || '');
    setEditIcon(workspace.icon || '📁');
    setContextMenu(null);
  }

  function openDeleteWorkspace(workspace: any) {
    setDeletingWorkspace(workspace);
    setContextMenu(null);
  }

  function handleSaveEdit() {
    if (!editName.trim() || isSavingEdit || !editingWorkspace) return;
    setIsSavingEdit(true);
    fetch('/api/workspaces/' + editingWorkspace.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() || null, icon: editIcon || '📁' }),
    }).then(function(res) {
      if (res.ok) { setEditingWorkspace(null); window.location.reload(); }
      else { res.json().then(function(data) { alert(data.error || 'Failed to update workspace'); }); }
    }).finally(function() { setIsSavingEdit(false); });
  }

  function handleDeleteWorkspace() {
    if (!deletingWorkspace || isDeleting) return;
    setIsDeleting(true);
    fetch('/api/workspaces/' + deletingWorkspace.id, { method: 'DELETE' })
      .then(function(res) {
        if (res.ok) { setDeletingWorkspace(null); window.location.reload(); }
        else { res.json().then(function(data) { alert(data.error || 'Failed to delete workspace'); }); }
      }).finally(function() { setIsDeleting(false); });
  }

  function openMembersWorkspace(workspace: any) {
    setMembersWorkspace(workspace);
    setContextMenu(null);
    fetchMembers(workspace.id);
  }

  function fetchMembers(workspaceId: string) {
    setIsMembersLoading(true);
    Promise.all([
      fetch('/api/workspaces/' + workspaceId),
      fetch('/api/users'),
      fetch('/api/groups'),
      fetch('/api/roles'),
    ]).then(function(results) {
      return Promise.all(results.map(function(r) { return r.json(); }));
    }).then(function(data) {
      setWsMembers(data[0].workspace?.members || []);
      setWsUsers(data[1].users || []);
      setWsGroups(data[2].groups || data[2] || []);
      setWsRoles(data[3].roles || data[3] || []);
    }).finally(function() { setIsMembersLoading(false); });
  }

  function handleAddMember() {
    if (!memberSelectedId || !membersWorkspace || isAddingMember) return;
    setIsAddingMember(true);
    var body: any = { permission: memberPermission };
    if (memberTarget === 'user') body.userId = memberSelectedId;
    else if (memberTarget === 'group') body.groupId = memberSelectedId;
    else if (memberTarget === 'role') body.roleId = memberSelectedId;
    fetch('/api/workspaces/' + membersWorkspace.id + '/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function(res) {
      if (res.ok) { setMemberSelectedId(''); setMemberPermission('viewer'); fetchMembers(membersWorkspace.id); }
      else { res.json().then(function(data) { alert(data.error || 'Failed to add member'); }); }
    }).finally(function() { setIsAddingMember(false); });
  }

  function handleUpdateMemberPerm(memberId: string, permission: string) {
    if (!membersWorkspace) return;
    fetch('/api/workspaces/' + membersWorkspace.id + '/members', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: memberId, permission: permission }),
    }).then(function(res) {
      if (res.ok) fetchMembers(membersWorkspace.id);
      else res.json().then(function(data) { alert(data.error || 'Failed to update permission'); });
    });
  }

  function handleRemoveMember(memberId: string) {
    if (!membersWorkspace || !confirm('Remove this member from the workspace?')) return;
    fetch('/api/workspaces/' + membersWorkspace.id + '/members', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: memberId }),
    }).then(function(res) { if (res.ok) fetchMembers(membersWorkspace.id); });
  }

  function getMemberOptions() {
    if (memberTarget === 'user') return wsUsers.map(function(u: any) { return { id: u.id, label: u.name || u.email }; });
    if (memberTarget === 'group') return wsGroups.map(function(g: any) { return { id: g.id, label: g.name }; });
    if (memberTarget === 'role') return wsRoles.map(function(r: any) { return { id: r.id, label: r.name }; });
    return [];
  }

  function getTableWorkspaceId(tableId: string): string | null {
    for (var i = 0; i < workspaces.length; i++) {
      var ws = workspaces[i];
      if ((ws.tables || []).some(function(t: any) { return t.id === tableId; })) return ws.id;
    }
    return null;
  }

  var commonIcons = ['📁', '🏢', '📊', '🚀', '💼', '🎯', '📋', '⚡', '🔧', '💡', '📦', '🌐', '🎨', '📱', '🏠', '⭐'];
  var sidebarClass = 'bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ' + (isCollapsed ? 'w-12' : 'w-56');

  function renderTableItem(table: any, isInWorkspace: boolean, activeClass: string) {
    var isDragging = draggingTableId === table.id;
    return (
      <div key={table.id} className={'flex items-center group ' + (isDragging ? 'opacity-40' : '')}
        draggable={true}
        onDragStart={function(e) { handleTableDragStart(e, table.id, table.name); }}
        onDragEnd={handleTableDragEnd}
      >
        <div className="w-3 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0 mr-0.5">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm8-16a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4z"/></svg>
        </div>
        <a href={'/tables/' + table.id}
          className={'flex items-center flex-1 min-w-0 px-2 py-1 text-xs rounded-l transition-colors ' + (currentTableId === table.id ? activeClass : 'text-gray-600 hover:bg-gray-100')}>
          {table.isSharePointBacked && <svg className="w-3.5 h-3.5 mr-1 flex-shrink-0" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#0078D4"/><path d="M8 7h8v2H8V7zm0 4h8v2H8v-2zm0 4h5v2H8v-2z" fill="white"/></svg>}
          <span className="flex-1 truncate">{table.name}</span>
          {!isInWorkspace && <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100">{table._count?.rows || 0}</span>}
        </a>
        <button onClick={function(e) { e.preventDefault(); e.stopPropagation(); var rect = (e.target as HTMLElement).getBoundingClientRect(); setTableContextMenu({ table: table, x: rect.right, y: rect.top }); }}
          className="p-1 rounded-r opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all flex-shrink-0" title="Table options">
          <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
        </button>
      </div>
    );
  }

  return (<><aside className={sidebarClass}>
    {/* Header */}
    <div className="h-11 flex items-center justify-between px-3 border-b border-gray-200 dark:border-gray-700">
      {!isCollapsed && (<Link href="/" className="text-sm font-bold text-gray-900 dark:text-gray-100 hover:text-blue-600 transition-colors flex items-center space-x-1.5"><AgoraLogo size={22} /><span>Agora</span></Link>)}
      <button onClick={function() { setIsCollapsed(!isCollapsed); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors">
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isCollapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7m8 14l-7-7 7-7"} /></svg>
      </button>
    </div>

    {/* Loading overlay for move operations */}
    {isMovingTable && (
      <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 z-50 flex items-center justify-center">
        <div className="flex items-center space-x-2 bg-purple-100 text-purple-700 px-3 py-2 rounded-lg text-xs font-medium">
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-600"></div>
          <span>Moving table...</span>
        </div>
      </div>
    )}

    {/* Expanded sidebar content */}
    {!isCollapsed && (<nav className="flex-1 px-2 py-2 overflow-y-auto">

      {/* ================================================================ */}
      {/* PUBLISHED DASHBOARDS — top of list                               */}
      {/* ================================================================ */}
      {(dashboards || []).length > 0 && (<div className="mb-3">
        <button onClick={function() { toggleSection('dashboards'); }}
          className="w-full flex items-center justify-between px-2 mb-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors py-0.5">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Dashboards</h2>
          <svg className={'w-2.5 h-2.5 text-gray-400 transition-transform ' + (isSectionOpen('dashboards') ? 'rotate-90' : '')} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        {isSectionOpen('dashboards') && (
          <div className="space-y-0.5">
            {(dashboards || []).map(function(d: any) { return (
              <a key={d.id} href={'/insights/' + d.id}
                className="flex items-center px-2 py-1.5 text-xs rounded text-gray-600 hover:bg-blue-50 transition-colors">
                <span className="mr-1.5">{d.icon || '📊'}</span>
                <span className="flex-1 truncate">{d.name}</span>
              </a>
            ); })}
          </div>
        )}
      </div>)}

      {/* ================================================================ */}
      {/* WORKSPACES                                                       */}
      {/* ================================================================ */}
      {workspaces.length > 0 && (<div className="mb-3">
        <button onClick={function() { toggleSection('workspaces'); }}
          className="w-full flex items-center justify-between px-2 mb-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors py-0.5">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Workspaces</h2>
          <svg className={'w-2.5 h-2.5 text-gray-400 transition-transform ' + (isSectionOpen('workspaces') ? 'rotate-90' : '')} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        {isSectionOpen('workspaces') && (
        <div className="space-y-0.5">{workspaces.map(function(workspace: any) {
          var isDropTarget = dragOverWorkspaceId === workspace.id;
          return (<div key={workspace.id}>
            <div
              className={'flex items-center group rounded-lg transition-all ' + (isDropTarget ? 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/20' : '')}
              onContextMenu={function(e) { handleWorkspaceContextMenu(e, workspace); }}
              onDragOver={function(e) { handleWorkspaceDragOver(e, workspace.id); }}
              onDragLeave={handleWorkspaceDragLeave}
              onDrop={function(e) { handleWorkspaceDrop(e, workspace.id); }}
            >
              <button onClick={function() { toggleWorkspace(workspace.id); }} className="flex items-center flex-1 min-w-0 px-2 py-1.5 text-xs rounded-l hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className={'w-2.5 h-2.5 mr-1.5 text-gray-400 transition-transform flex-shrink-0 ' + (expandedWorkspaces.has(workspace.id) ? 'rotate-90' : '')} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                <span className="mr-1 flex-shrink-0">{workspace.icon || '📁'}</span>
                <span className="flex-1 text-left font-medium text-gray-700 dark:text-gray-300 truncate">{workspace.name}</span>
              </button>
              <button
                onClick={function(e) { handleWorkspaceMenuClick(e, workspace); }}
                className="p-1 rounded-r opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex-shrink-0"
                title="Workspace options"
              >
                <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
              </button>
            </div>

            {isDropTarget && draggingTableId && (
              <div className="mx-2 my-1 px-2 py-1.5 text-[10px] text-purple-600 bg-purple-50 dark:bg-purple-900/20 border border-dashed border-purple-300 rounded text-center">
                Drop to move into {workspace.name}
              </div>
            )}

            {expandedWorkspaces.has(workspace.id) && (<div className="ml-3 pl-2 border-l border-gray-200 dark:border-gray-700 space-y-0.5 mt-0.5">
              {(workspace.tables || []).map(function(table: any) {
                return renderTableItem(table, true, 'bg-blue-50 text-blue-700 font-medium');
              })}
              <Link href={'/tables/new?workspace=' + workspace.id} className="flex items-center px-2 py-1 text-[10px] text-purple-500 hover:bg-purple-50 rounded">+ Add table</Link>
            </div>)}
          </div>);
        })}</div>
        )}
      </div>)}

      {/* ================================================================ */}
      {/* GOOGLE SHEET CONNECTIONS                                          */}
      {/* ================================================================ */}
      {isAdmin && (sheetConnections || []).length > 0 && (<div className="mb-3">
        <button onClick={function() { toggleSection('sheets'); }}
          className="w-full flex items-center justify-between px-2 mb-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors py-0.5">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Google Sheets</h2>
          <svg className={'w-2.5 h-2.5 text-gray-400 transition-transform ' + (isSectionOpen('sheets') ? 'rotate-90' : '')} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        {isSectionOpen('sheets') && (
        <div className="space-y-0.5">{(sheetConnections || []).map(function(conn: any) { return (<div key={conn.id}>
          <div className="flex items-center group">
            <button onClick={function() { toggleSheet(conn.id); }} className="flex items-center flex-1 min-w-0 px-2 py-1.5 text-xs rounded-l hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <svg className={'w-2.5 h-2.5 mr-1.5 text-gray-400 transition-transform flex-shrink-0 ' + (expandedSheets.has(conn.id) ? 'rotate-90' : '')} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
              <svg className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" viewBox="0 0 24 24" fill="#0F9D58"><path d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zm-9.75 15h-3v-3h3v3zm0-4.5h-3v-3h3v3zm0-4.5h-3V6h3v3zm4.5 9h-3v-3h3v3zm0-4.5h-3v-3h3v3zm0-4.5h-3V6h3v3zm4.5 9h-3v-3h3v3zm0-4.5h-3v-3h3v3zm0-4.5h-3V6h3v3z"/></svg>
              <span className="flex-1 text-left font-medium text-gray-700 dark:text-gray-300 truncate">{conn.spreadsheetName}</span>
            </button>
            <button onClick={function(e) { e.preventDefault(); e.stopPropagation(); var rect = (e.target as HTMLElement).getBoundingClientRect(); setSheetContextMenu({ conn: conn, x: rect.right, y: rect.top }); }}
              className="p-1 rounded-r opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex-shrink-0" title="Sheet options">
              <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
            </button>
          </div>
          {expandedSheets.has(conn.id) && (<div className="ml-3 pl-2 border-l border-gray-200 dark:border-gray-700 space-y-0.5 mt-0.5">
            {(conn.tabs || []).map(function(tab: any) {
              var tableId = tab.table?.id || tab.tableId;
              var tbl = tab.table || { id: tableId, name: tab.sheetTabName };
              return renderTableItem(tbl, false, 'bg-green-50 text-green-700 font-medium');
            })}
          </div>)}
        </div>); })}</div>
        )}
      </div>)}

      {/* ================================================================ */}
      {/* SHAREPOINT TABLES                                                 */}
      {/* ================================================================ */}
      {tables.filter(function(t: any) { return t.isSharePointBacked; }).length > 0 && (<div className="mb-3">
        <button onClick={function() { toggleSection('sharepoint'); }}
          className="w-full flex items-center justify-between px-2 mb-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors py-0.5">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">SharePoint</h2>
          <svg className={'w-2.5 h-2.5 text-gray-400 transition-transform ' + (isSectionOpen('sharepoint') ? 'rotate-90' : '')} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        {isSectionOpen('sharepoint') && (
          <div className="space-y-0.5">
            {tables.filter(function(t: any) { return t.isSharePointBacked; }).map(function(table: any) {
              return renderTableItem(table, false, 'bg-sky-50 text-sky-700 font-medium');
            })}
          </div>
        )}
      </div>)}

      {/* ================================================================ */}
      {/* STANDALONE TABLES (My Tables) — also a drop target               */}
      {/* ================================================================ */}
      <div
        className={'mb-3 rounded-lg transition-all ' + (dragOverStandalone ? 'ring-2 ring-blue-400 bg-blue-50/50' : '')}
        onDragOver={handleStandaloneDragOver}
        onDragLeave={handleStandaloneDragLeave}
        onDrop={handleStandaloneDrop}
      >
        <div className="flex items-center justify-between px-2 mb-1">
          <button onClick={function() { toggleSection('myTables'); }}
            className="flex-1 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors py-0.5 pr-1">
            <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{workspaces.length > 0 ? 'My Tables' : 'Tables'}</h2>
            <svg className={'w-2.5 h-2.5 text-gray-400 transition-transform ' + (isSectionOpen('myTables') ? 'rotate-90' : '')} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {isSectionOpen('myTables') && (<>
          {dragOverStandalone && draggingTableId && (
            <div className="mx-2 my-1 px-2 py-1.5 text-[10px] text-blue-600 bg-blue-50 border border-dashed border-blue-300 rounded text-center">
              Drop to remove from workspace
            </div>
          )}

         <div className="space-y-0.5">
            {tables.filter(function(t: any) { return !t.isSharePointBacked; }).map(function(table) {
              return renderTableItem(table, false, 'bg-blue-50 text-blue-700 font-medium');
            })}
          </div>
        </>)}
      </div>

      {/* Shared tables */}
      {sharedTables.length > 0 && (<div className="mb-3">
        <button onClick={function() { toggleSection('shared'); }}
          className="w-full flex items-center justify-between px-2 mb-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors py-0.5">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Shared with Me</h2>
          <svg className={'w-2.5 h-2.5 text-gray-400 transition-transform ' + (isSectionOpen('shared') ? 'rotate-90' : '')} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        {isSectionOpen('shared') && (
          <div className="space-y-0.5">{sharedTables.map(function(table: any) { return (<Link key={table.id} href={'/tables/' + table.id} className={'flex items-center px-2 py-1.5 text-xs rounded transition-colors ' + (currentTableId === table.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100')}><span className="truncate">{table.name}</span></Link>); })}</div>
        )}
      </div>)}

      {/* Bottom actions — Create */}
      <div className="border-t border-gray-200 pt-2 mt-2 space-y-0.5">
        <Link href="/tables/new" className="flex items-center px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded">+ Create Table</Link>
        {!showNewWorkspace ? (<button onClick={function() { setShowNewWorkspace(true); }} className="flex items-center w-full px-2 py-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded">+ Create Workspace</button>) : (<div className="px-2 py-1.5 space-y-1.5">
          <input type="text" value={newWorkspaceName} onChange={function(e) { setNewWorkspaceName(e.target.value); }} onKeyDown={function(e) { if (e.key === 'Enter') handleCreateWorkspace(); if (e.key === 'Escape') { setShowNewWorkspace(false); setNewWorkspaceName(''); } }} placeholder="Workspace name..." autoFocus className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 bg-white text-gray-900" />
          <div className="flex space-x-1.5">
            <button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim() || isCreating} className="flex-1 px-2 py-1 text-[10px] bg-purple-600 text-white rounded disabled:opacity-50">{isCreating ? '...' : 'Create'}</button>
            <button onClick={function() { setShowNewWorkspace(false); setNewWorkspaceName(''); }} className="px-2 py-1 text-[10px] text-gray-500">Cancel</button>
          </div>
        </div>)}
		<Link href="/tables/sharepoint-import" className="flex items-center px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded">+ Connect SharePoint List</Link>
        <button onClick={function() { setShowConnectSheet(true); }} className="flex items-center w-full px-2 py-1.5 text-xs text-green-600 hover:bg-green-50 rounded">
          + Connect Google Sheet
        </button>
        {showNewWorkspace ? null : null}
        {false && (<div className="px-2 py-1.5 space-y-1.5">
          <input type="text" value={newWorkspaceName} onChange={function(e) { setNewWorkspaceName(e.target.value); }} onKeyDown={function(e) { if (e.key === 'Enter') handleCreateWorkspace(); if (e.key === 'Escape') { setShowNewWorkspace(false); setNewWorkspaceName(''); } }} placeholder="Workspace name..." autoFocus className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 bg-white text-gray-900" />
          <div className="flex space-x-1.5">
            <button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim() || isCreating} className="flex-1 px-2 py-1 text-[10px] bg-purple-600 text-white rounded disabled:opacity-50">{isCreating ? '...' : 'Create'}</button>
            <button onClick={function() { setShowNewWorkspace(false); setNewWorkspaceName(''); }} className="px-2 py-1 text-[10px] text-gray-500">Cancel</button>
          </div>
        </div>)}
      </div>

      {/* Bottom actions — Automations & Marketplace */}
      <div className="border-t border-gray-200 pt-2 mt-2 space-y-0.5">
        <a href="/automations" className="flex items-center w-full px-2 py-1.5 text-xs text-yellow-600 hover:bg-yellow-50 rounded">
          <span className="mr-1.5">⚡</span> Automations
        </a>
        <a href="/insights" className="flex items-center w-full px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded">
          <span className="mr-1.5">📊</span> Insights
        </a>
        <Link href="/marketplace" className="flex items-center w-full px-2 py-1.5 text-xs text-orange-600 hover:bg-orange-50 rounded">
          <span className="mr-1.5">📦</span> Marketplace
        </Link>
      </div>
    </nav>)}

    {/* Collapsed sidebar */}
    {isCollapsed && (<nav className="flex-1 px-1 py-2 overflow-y-auto"><div className="space-y-1">
      {tables.map(function(table) { return (<Link key={table.id} href={'/tables/' + table.id} className={'flex items-center justify-center p-1 text-lg rounded ' + (currentTableId === table.id ? 'bg-blue-50' : 'hover:bg-gray-100')} title={table.name}>{table.icon || 'T'}</Link>); })}
    </div></nav>)}

    {/* Footer */}
    <div className="border-t border-gray-200 p-2 space-y-1.5">
      {!isCollapsed ? (<>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-[10px]">{userName ? userName.charAt(0) : userEmail.charAt(0).toUpperCase()}</div>
            <p className="text-xs font-medium text-gray-900 truncate max-w-[100px]">{userName || userEmail}</p>
          </div>
          <NotificationBell />
          <Link href="/settings" className="text-gray-400 hover:text-gray-600" title="Settings"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></Link>
        </div>
        {isAdmin && (<Link href="/admin/users" className="flex items-center px-2 py-1 text-[10px] text-purple-600 bg-purple-50 hover:bg-purple-100 rounded w-full">Admin Panel</Link>)}
        <SignOutButton onSignOut={signOutAction} />
      </>) : (<div className="flex flex-col items-center space-y-1">
        <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-[10px]">{userName ? userName.charAt(0) : userEmail.charAt(0).toUpperCase()}</div>
      </div>)}
    </div>

    {/* ================================================================ */}
    {/* Workspace Context Menu                                           */}
    {/* ================================================================ */}
    {contextMenu && (<div ref={contextMenuRef} className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 z-50 min-w-[140px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
      <button onClick={function() { var ws = workspaces.find(function(w: any) { return w.id === contextMenu!.workspaceId; }); if (ws) openEditWorkspace(ws); }}
        className="flex items-center w-full px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
        <svg className="w-3.5 h-3.5 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        Edit Workspace
      </button>
      <button onClick={function() { var ws = workspaces.find(function(w: any) { return w.id === contextMenu!.workspaceId; }); if (ws) openMembersWorkspace(ws); }}
        className="flex items-center w-full px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
        <svg className="w-3.5 h-3.5 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        Manage Members
      </button>
      <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
      <button onClick={function() { var ws = workspaces.find(function(w: any) { return w.id === contextMenu!.workspaceId; }); if (ws) openDeleteWorkspace(ws); }}
        className="flex items-center w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        Delete Workspace
      </button>
    </div>)}

    {/* ================================================================ */}
    {/* Edit Workspace Modal                                             */}
    {/* ================================================================ */}
    {editingWorkspace && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={function() { setEditingWorkspace(null); }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={function(e) { e.stopPropagation(); }}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit Workspace</h3>
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Icon</label>
          <div className="flex flex-wrap gap-1.5">
            {commonIcons.map(function(icon) { return (
              <button key={icon} onClick={function() { setEditIcon(icon); }}
                className={'w-8 h-8 flex items-center justify-center text-base rounded-lg border-2 transition-colors ' + (editIcon === icon ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30' : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700')}
              >{icon}</button>
            ); })}
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
          <input type="text" value={editName} onChange={function(e) { setEditName(e.target.value); }}
            onKeyDown={function(e) { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingWorkspace(null); }}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-gray-100 text-gray-900" autoFocus />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea value={editDescription} onChange={function(e) { setEditDescription(e.target.value); }} rows={2} placeholder="What is this workspace for?"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-gray-100 text-gray-900 resize-none" />
        </div>
        <div className="flex justify-end space-x-2">
          <button onClick={function() { setEditingWorkspace(null); }} className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
          <button onClick={handleSaveEdit} disabled={!editName.trim() || isSavingEdit}
            className="px-4 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">{isSavingEdit ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>)}

    {/* ================================================================ */}
    {/* Delete Workspace Confirmation                                    */}
    {/* ================================================================ */}
    {deletingWorkspace && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={function() { setDeletingWorkspace(null); }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={function(e) { e.stopPropagation(); }}>
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Delete Workspace</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">"{deletingWorkspace.name}"</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">This will delete the workspace. Tables inside it will <span className="font-semibold">not</span> be deleted — they'll become standalone tables.</p>
        <p className="text-xs text-red-600 dark:text-red-400 mb-4">This action cannot be undone.</p>
        <div className="flex justify-end space-x-2">
          <button onClick={function() { setDeletingWorkspace(null); }} className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
          <button onClick={handleDeleteWorkspace} disabled={isDeleting}
            className="px-4 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">{isDeleting ? 'Deleting...' : 'Delete Workspace'}</button>
        </div>
      </div>
    </div>)}

    {/* ================================================================ */}
    {/* Manage Members Modal                                             */}
    {/* ================================================================ */}
    {membersWorkspace && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={function() { setMembersWorkspace(null); }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={function(e) { e.stopPropagation(); }}>
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Members — {membersWorkspace.name}</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Manage who has access to this workspace and all its tables</p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <div className="flex space-x-1 mb-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              {([{ v: 'user', l: '👤 User' }, { v: 'group', l: '👥 Group' }, { v: 'role', l: '🛡 Role' }] as const).map(function(t) { return (
                <button key={t.v} onClick={function() { setMemberTarget(t.v as any); setMemberSelectedId(''); }}
                  className={'flex-1 px-2 py-1 text-[10px] rounded-md transition-all ' + (memberTarget === t.v ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700')}>{t.l}</button>
              ); })}
            </div>
            <div className="flex space-x-1.5">
              <select value={memberSelectedId} onChange={function(e) { setMemberSelectedId(e.target.value); }}
                className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-gray-900">
                <option value="">Select {memberTarget}...</option>
                {getMemberOptions().map(function(o: any) { return <option key={o.id} value={o.id}>{o.label}</option>; })}
              </select>
              <select value={memberPermission} onChange={function(e) { setMemberPermission(e.target.value); }}
                className="w-20 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-gray-900">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={handleAddMember} disabled={!memberSelectedId || isAddingMember}
                className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">{isAddingMember ? '...' : 'Add'}</button>
            </div>
          </div>
          {isMembersLoading ? (
            <p className="text-xs text-gray-500 text-center py-4">Loading...</p>
          ) : (
            <div className="space-y-1.5">
              {wsMembers.map(function(m: any) {
                var mName = m.user?.name || m.user?.email || m.group?.name || m.role?.name || 'Unknown';
                var mIcon = m.user ? (m.user.name?.[0] || m.user.email?.[0] || '?') : m.group ? '👥' : '🛡';
                var mIconBg = m.user ? 'bg-blue-100 text-blue-600' : m.group ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600';
                var mType = m.user ? 'User' : m.group ? 'Group' : 'Role';
                return (
                  <div key={m.id} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg group">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className={'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ' + mIconBg}>{mIcon}</div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{mName}</p>
                        <p className="text-[10px] text-gray-400">{mType}{m.user?.email ? ' · ' + m.user.email : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      {m.permission === 'owner' ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-full">Owner</span>
                      ) : (<>
                        <select value={m.permission} onChange={function(e) { handleUpdateMemberPerm(m.id, e.target.value); }}
                          className={'text-[10px] font-medium px-1.5 py-0.5 rounded-full border-0 cursor-pointer ' + (m.permission === 'admin' ? 'bg-purple-100 text-purple-800' : m.permission === 'editor' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800')}>
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Transfer Ownership</option>
                        </select>
                        <button onClick={function() { handleRemoveMember(m.id); }}
                          className="p-0.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" title="Remove">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </>)}
                    </div>
                  </div>
                );
              })}
              {wsMembers.length === 0 && <p className="text-xs text-gray-500 text-center py-4">No members yet.</p>}
            </div>
          )}
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Permission Levels</p>
            <div className="space-y-1 text-[10px]">
              <div className="flex items-center space-x-2"><span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">Owner</span><span className="text-gray-500">Full control + transfer</span></div>
              <div className="flex items-center space-x-2"><span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-medium">Admin</span><span className="text-gray-500">Manage members + Editor</span></div>
              <div className="flex items-center space-x-2"><span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">Editor</span><span className="text-gray-500">Edit data + Viewer</span></div>
              <div className="flex items-center space-x-2"><span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-800 font-medium">Viewer</span><span className="text-gray-500">View only</span></div>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end flex-shrink-0">
          <button onClick={function() { setMembersWorkspace(null); }} className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Done</button>
        </div>
      </div>
    </div>)}

    {/* ================================================================ */}
    {/* Table Context Menu — with Move to Workspace                      */}
    {/* ================================================================ */}
    {tableContextMenu && (<div ref={tableContextMenuRef}
      className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 z-50 min-w-[180px]"
      style={{ left: tableContextMenu!.x, top: tableContextMenu!.y }}>

      <button onClick={function() { window.location.href = '/tables/' + tableContextMenu!.table.id; setTableContextMenu(null); }}
        className="flex items-center w-full px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
        <svg className="w-3.5 h-3.5 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
        Open Table
      </button>

      {workspaces.length > 0 && (<>
        <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
        <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Move to...</div>
        {workspaces.map(function(ws: any) {
          var currentWsId = getTableWorkspaceId(tableContextMenu!.table.id);
          var isCurrentWs = currentWsId === ws.id;
          return (
            <button key={ws.id}
              onClick={function() {
                if (!isCurrentWs) {
                  moveTableToWorkspace(tableContextMenu!.table.id, ws.id);
                }
                setTableContextMenu(null);
              }}
              disabled={isCurrentWs}
              className={'flex items-center w-full px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ' + (isCurrentWs ? 'text-gray-400 cursor-default' : 'text-purple-600')}>
              <span className="mr-2">{ws.icon || '📁'}</span>
              <span className="truncate">{ws.name}</span>
              {isCurrentWs && <span className="ml-auto text-[9px] text-gray-400">current</span>}
            </button>
          );
        })}
        {getTableWorkspaceId(tableContextMenu!.table.id) && (
          <button onClick={function() { moveTableToWorkspace(tableContextMenu!.table.id, null); setTableContextMenu(null); }}
            className="flex items-center w-full px-3 py-1.5 text-xs text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700">
            <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Remove from workspace
          </button>
        )}
      </>)}

      <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
      <button onClick={function() { setDeletingTable(tableContextMenu!.table); setTableContextMenu(null); }}
        className="flex items-center w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        Delete Table
      </button>
    </div>)}

    {/* Delete Table Confirmation */}
    {deletingTable && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={function() { setDeletingTable(null); }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={function(e) { e.stopPropagation(); }}>
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Delete Table</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">"{deletingTable.name}"</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">This will permanently delete the table and <span className="font-semibold text-red-600">all its data</span>, including rows, columns, views, forms, and charts.</p>
        <p className="text-xs text-red-600 dark:text-red-400 mb-4">This action cannot be undone.</p>
        <div className="flex justify-end space-x-2">
          <button onClick={function() { setDeletingTable(null); }} className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
          <button onClick={handleDeleteTable} disabled={isDeletingTable}
            className="px-4 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">{isDeletingTable ? 'Deleting...' : 'Delete Table'}</button>
        </div>
      </div>
    </div>)}
	
	{/* Sheet Connection Context Menu */}
    {sheetContextMenu && (<div ref={sheetContextMenuRef}
      className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
      style={{ left: sheetContextMenu.x, top: sheetContextMenu.y }}>
      <a href={sheetContextMenu.conn.spreadsheetUrl || ('https://docs.google.com/spreadsheets/d/' + sheetContextMenu.conn.spreadsheetId)} target="_blank" rel="noopener noreferrer"
        className="flex items-center w-full px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
        <svg className="w-3.5 h-3.5 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        Open in Google Sheets
      </a>
      {workspaces.length > 0 && (<>
        <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
        <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Move to...</div>
        {workspaces.map(function(ws: any) { return (
          <button key={ws.id} onClick={function() { setSheetContextMenu(null); }}
            className="flex items-center w-full px-3 py-1.5 text-xs text-purple-600 hover:bg-gray-100 dark:hover:bg-gray-700">
            <span className="mr-2">{ws.icon || '📁'}</span><span className="truncate">{ws.name}</span>
          </button>
        ); })}
      </>)}
      <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
      <button onClick={function() { setDeletingSheet(sheetContextMenu!.conn); setSheetContextMenu(null); }}
        className="flex items-center w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        Delete Connection
      </button>
    </div>)}

    {/* Delete Sheet Connection Confirmation */}
    {deletingSheet && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={function() { setDeletingSheet(null); }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={function(e) { e.stopPropagation(); }}>
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Delete Sheet Connection</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">"{deletingSheet.spreadsheetName}"</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">This will disconnect the Google Sheet and delete all tab mappings. The tables created from this sheet will <span className="font-semibold">not</span> be deleted — they'll become standalone tables.</p>
        <p className="text-xs text-red-600 dark:text-red-400 mb-4">The Google Sheet itself will not be affected.</p>
        <div className="flex justify-end space-x-2">
          <button onClick={function() { setDeletingSheet(null); }} className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
          <button onClick={handleDeleteSheet} disabled={isDeletingSheet}
            className="px-4 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">{isDeletingSheet ? 'Deleting...' : 'Delete Connection'}</button>
        </div>
      </div>
    </div>)}

  </aside>
  {showConnectSheet && <ConnectGoogleSheetModal isOpen={showConnectSheet} onClose={function() { setShowConnectSheet(false); }} />}
  </>);
}