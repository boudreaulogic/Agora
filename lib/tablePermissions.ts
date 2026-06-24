import { db } from './db';
import { isAdmin } from './permissions';

export type TablePermissionLevel = 'owner' | 'admin' | 'editor' | 'viewer' | null;

/**
 * Get a user's permission level for a specific table.
 * Checks in order: sys admin → owner → direct share → group share → role share → table permission
 * Returns null if no access.
 */
export async function getTablePermission(
  userId: string,
  tableId: string
): Promise<TablePermissionLevel> {
  // 1. System admin always has full access
  const isSysAdmin = await isAdmin(userId);
  if (isSysAdmin) return 'owner';

  // 2. Table owner
  const table = await db.agoraTable.findUnique({
    where: { id: tableId },
    select: { createdById: true, workspaceId: true, inheritPermissions: true },
  });
  if (!table) return null;
  if (table.createdById === userId) return 'owner';

  // 2.5. Workspace inheritance — if table is in a workspace, check workspace membership
  if (table.workspaceId) {
    const workspace = await db.workspace.findUnique({
      where: { id: table.workspaceId },
      select: { createdById: true },
    });

    // Workspace creator = owner of all tables inside (always, regardless of inheritance)
    if (workspace?.createdById === userId) return 'owner';

    // If table has BROKEN inheritance, skip workspace perms and fall through to table-level shares
    if (table.inheritPermissions !== false) {
      // Direct workspace membership
      const wsMember = await db.workspaceMember.findFirst({
        where: { workspaceId: table.workspaceId, userId },
        select: { permission: true },
      });
      if (wsMember?.permission) {
        return wsMember.permission as TablePermissionLevel;
      }

      // Group workspace membership
      const userGroups = await db.groupMember.findMany({
        where: { userId },
        select: { groupId: true },
      });
      const groupIds = userGroups.map(g => g.groupId);

      if (groupIds.length > 0) {
        const wsGroupMember = await db.workspaceMember.findFirst({
          where: {
            workspaceId: table.workspaceId,
            groupId: { in: groupIds },
          },
          select: { permission: true },
        });
        if (wsGroupMember?.permission) {
          return wsGroupMember.permission as TablePermissionLevel;
        }
      }

      // Role workspace membership
      const userRoles = await db.userRole.findMany({
        where: { userId },
        select: { roleId: true },
      });
      const roleIds = userRoles.map(r => r.roleId);

      if (roleIds.length > 0) {
        const wsRoleMember = await db.workspaceMember.findFirst({
          where: {
            workspaceId: table.workspaceId,
            roleId: { in: roleIds },
          },
          select: { permission: true },
        });
        if (wsRoleMember?.permission) {
          return wsRoleMember.permission as TablePermissionLevel;
        }
      }

      // Inheriting but user isn't a workspace member = no access (don't fall through)
      return null;
    }
    // If inheritPermissions === false, fall through to table-level shares below
  }

  // 3. Direct user share
  const userShare = await db.tableShare.findFirst({
    where: { tableId, userId },
    select: { permission: true },
  });
  if (userShare?.permission) {
    return userShare.permission as TablePermissionLevel;
  }

  // 4. Group shares (user might be in multiple groups — take highest permission)
  const userGroups = await db.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const groupIds = userGroups.map(g => g.groupId);

  if (groupIds.length > 0) {
    // Check TableShare by group
    const groupShares = await db.tableShare.findMany({
      where: {
        tableId,
        groupId: { in: groupIds },
      },
      select: { permission: true },
    });

    // Check AgoraTablePermission by group
    const groupPerms = await db.agoraTablePermission.findMany({
      where: {
        tableId,
        groupId: { in: groupIds },
      },
      select: { permission: true },
    });

    const allPerms = [
      ...groupShares.map(s => s.permission),
      ...groupPerms.map(p => p.permission),
    ].filter(Boolean) as string[];

    if (allPerms.length > 0) {
      return getHighestPermission(allPerms);
    }
  }

  // 5. Role shares
  const userRoles = await db.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });
  const roleIds = userRoles.map(r => r.roleId);

  if (roleIds.length > 0) {
    const roleShares = await db.tableShare.findMany({
      where: {
        tableId,
        roleId: { in: roleIds },
      },
      select: { permission: true },
    });

    if (roleShares.length > 0) {
      const perms = roleShares.map(s => s.permission).filter(Boolean) as string[];
      return getHighestPermission(perms);
    }
  }

  return null; // No access
}

/**
 * Given multiple permission levels, return the highest one.
 */
function getHighestPermission(perms: string[]): TablePermissionLevel {
  const hierarchy: Record<string, number> = {
    owner: 4,
    admin: 3,
    editor: 2,
    viewer: 1,
  };
  let highest: TablePermissionLevel = null;
  let highestLevel = 0;

  for (const perm of perms) {
    const level = hierarchy[perm] || 0;
    if (level > highestLevel) {
      highestLevel = level;
      highest = perm as TablePermissionLevel;
    }
  }

  return highest;
}

/**
 * Quick boolean checks for common permission needs
 */
export async function canViewTable(userId: string, tableId: string): Promise<boolean> {
  const perm = await getTablePermission(userId, tableId);
  return perm !== null;
}

export async function canEditTable(userId: string, tableId: string): Promise<boolean> {
  const perm = await getTablePermission(userId, tableId);
  return perm === 'owner' || perm === 'admin' || perm === 'editor';
}

/**
 * requireTablePermission — use this in route handlers instead of inlining the check.
 *
 * Returns a 403 NextResponse when the user lacks the required level, or null
 * when access is granted. Callers early-return the response:
 *
 *   const denied = await requireTablePermission(userId, tableId, 'write');
 *   if (denied) return denied;
 *
 * 'read'  → any non-null permission (viewer, editor, admin, owner)
 * 'write' → editor, admin, or owner (viewer is explicitly blocked)
 * 'admin' → admin or owner only
 */
export async function requireTablePermission(
  userId: string,
  tableId: string,
  level: 'read' | 'write' | 'admin'
): Promise<import('next/server').NextResponse | null> {
  const { NextResponse } = await import('next/server');
  const perm = await getTablePermission(userId, tableId);
  if (perm === null) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (level === 'write' && perm === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (level === 'admin' && perm !== 'admin' && perm !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function canAdminTable(userId: string, tableId: string): Promise<boolean> {
  const perm = await getTablePermission(userId, tableId);
  return perm === 'owner' || perm === 'admin';
}

export async function isTableOwner(userId: string, tableId: string): Promise<boolean> {
  const perm = await getTablePermission(userId, tableId);
  return perm === 'owner';
}


/**
 * Get column-level permissions for a user on a specific table.
 * Returns a map of columnId -> { canView, canEdit }
 * 
 * Logic:
 * - If NO restrictions exist on a column, everyone can view and edit it
 * - If ANY restriction exists on a column, only listed users/groups have access
 * - Owner/Admin always bypass column restrictions
 */
export async function getColumnPermissions(
  userId: string,
  tableId: string
): Promise<Record<string, { canView: boolean; canEdit: boolean }>> {
  // Owner/Admin bypass all column restrictions
  const tablePerm = await getTablePermission(userId, tableId);
  if (tablePerm === 'owner' || tablePerm === 'admin') {
    return {}; // Empty means no restrictions (full access)
  }

  // Get all column permission rules for this table
  const allRules = await db.columnPermission.findMany({
    where: { tableId },
  });

  if (allRules.length === 0) return {}; // No restrictions

  // Get user's group IDs
  const userGroups = await db.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const groupIds = userGroups.map(g => g.groupId);

  // Group rules by column
  const rulesByColumn: Record<string, typeof allRules> = {};
  for (const rule of allRules) {
    if (!rulesByColumn[rule.columnId]) {
      rulesByColumn[rule.columnId] = [];
    }
    rulesByColumn[rule.columnId].push(rule);
  }

  // For each column with rules, determine this user's access
  const result: Record<string, { canView: boolean; canEdit: boolean }> = {};

  for (const [columnId, rules] of Object.entries(rulesByColumn)) {
    // Find rules that apply to this user (direct or via group)
    const userRules = rules.filter(
      r => r.userId === userId || (r.groupId && groupIds.includes(r.groupId))
    );

    if (userRules.length === 0) {
      // Column has restrictions but user is NOT listed → no access
      result[columnId] = { canView: false, canEdit: false };
    } else {
      // User is listed — take the most permissive access across all matching rules
      const canView = userRules.some(r => r.canView);
      const canEdit = userRules.some(r => r.canEdit);
      result[columnId] = { canView, canEdit };
    }
  }

  return result;
}