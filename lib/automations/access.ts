import { db } from '@/lib/db';

// Shared access checks for automations. Single source of truth used by the
// automation CRUD routes and the run-history / rerun / analytics routes.

export async function isSystemAdmin(userId: string): Promise<boolean> {
  var userRoles = await db.userRole.findMany({
    where: { userId: userId },
    include: { role: true },
  });
  return userRoles.some(function(ur) {
    return ur.role.slug === 'admin' || ur.role.slug === 'super_admin';
  });
}

export async function canUserAccessTable(userId: string, tableId: string): Promise<boolean> {
  var table = await db.agoraTable.findUnique({ where: { id: tableId }, select: { createdById: true, workspaceId: true } });
  if (!table) return false;
  if (table.createdById === userId) return true;
  var share = await db.tableShare.findUnique({ where: { tableId_userId: { tableId: tableId, userId: userId } } });
  if (share) return true;
  if (table.workspaceId) {
    var wsMember = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: table.workspaceId, userId: userId } } });
    if (wsMember) return true;
  }
  return false;
}

export async function canAccessAutomation(
  userId: string,
  automation: any
): Promise<'owner' | 'workspace_member' | 'table_member' | 'admin' | null> {
  if (automation.createdById === userId) return 'owner';
  var admin = await isSystemAdmin(userId);
  if (admin) return 'admin';
  if (automation.workspaceId) {
    var membership = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: automation.workspaceId, userId: userId } },
    });
    if (membership) return 'workspace_member';
  }
  if (automation.tableId) {
    var hasTableAccess = await canUserAccessTable(userId, automation.tableId);
    if (hasTableAccess) return 'table_member';
  }
  return null;
}

// Prisma `where` matching every automation the user can see — admins see all,
// everyone else sees ones they created, or in their workspaces/tables. Returns
// `{}` for admins (no filter).
export async function accessibleAutomationWhere(userId: string): Promise<any> {
  if (await isSystemAdmin(userId)) return {};

  var memberships = await db.workspaceMember.findMany({
    where: { userId: userId },
    select: { workspaceId: true },
  });
  var workspaceIds = memberships.map(function(m) { return m.workspaceId; });

  var ownTables = await db.agoraTable.findMany({ where: { createdById: userId }, select: { id: true } });
  var sharedTables = await db.tableShare.findMany({ where: { userId: userId }, select: { tableId: true } });
  var wsTables = workspaceIds.length > 0
    ? await db.agoraTable.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })
    : [];
  var tableIdSet = new Set<string>();
  ownTables.forEach(function(t) { tableIdSet.add(t.id); });
  sharedTables.forEach(function(t) { tableIdSet.add(t.tableId); });
  wsTables.forEach(function(t) { tableIdSet.add(t.id); });

  return {
    OR: [
      { createdById: userId },
      { workspaceId: { in: workspaceIds } },
      { tableId: { in: Array.from(tableIdSet) } },
    ],
  };
}

// Edit-level access — also the bar for mutating actions like re-running, since a
// run executes the automation's actions (writes data, sends email, etc.).
export async function canEditAutomation(userId: string, automation: any): Promise<boolean> {
  if (automation.createdById === userId) return true;
  var admin = await isSystemAdmin(userId);
  if (admin) return true;
  if (automation.workspaceId) {
    var membership = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: automation.workspaceId, userId: userId } },
    });
    if (membership && (membership.permission === 'admin' || membership.permission === 'owner')) return true;
  }
  return false;
}
