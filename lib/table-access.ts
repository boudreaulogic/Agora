import { db } from '@/lib/db';
import { getTablePermission, type TablePermissionLevel } from './tablePermissions';

/**
 * Check if a user can access a table (any permission level).
 * Includes sys admin override.
 */
export async function canAccessTable(userId: string, tableId: string): Promise<boolean> {
  const perm = await getTablePermission(userId, tableId);
  return perm !== null;
}

/**
 * Get a user's permission level for a table.
 * Re-exported for convenience.
 */
export async function getTableAccess(userId: string, tableId: string): Promise<TablePermissionLevel> {
  return getTablePermission(userId, tableId);
}

/**
 * Get all tables a user can access, split into owned vs shared.
 * Sys admins see ALL tables.
 */
export async function getAccessibleTables(userId: string) {
  const { isAdmin } = await import('./permissions');
  const isSysAdmin = await isAdmin(userId);

  // Tables owned by user
  const ownedTables = await db.agoraTable.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: 'desc' },
  });

  const ownedIds = ownedTables.map(t => t.id);

  if (isSysAdmin) {
    // Sys admins see all tables they don't own as "shared"
    const allOtherTables = await db.agoraTable.findMany({
      where: {
        id: { notIn: ownedIds },
      },
      include: {
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
        shares: {
          select: { permission: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      owned: ownedTables,
      shared: allOtherTables,
    };
  }

  // Get user's roles and groups
  const userRoles = await db.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });

  const userGroups = await db.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });

  // Tables shared with user (directly, via role, or via group)
  const sharedTables = await db.agoraTable.findMany({
    where: {
      id: { notIn: ownedIds },
      shares: {
        some: {
          OR: [
            { userId },
            ...(userRoles.length > 0
              ? [{ roleId: { in: userRoles.map(ur => ur.roleId) } }]
              : []),
            ...(userGroups.length > 0
              ? [{ groupId: { in: userGroups.map(ug => ug.groupId) } }]
              : []),
          ],
        },
      },
    },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true,
        },
      },
      shares: {
        where: {
          OR: [
            { userId },
            ...(userRoles.length > 0
              ? [{ roleId: { in: userRoles.map(ur => ur.roleId) } }]
              : []),
            ...(userGroups.length > 0
              ? [{ groupId: { in: userGroups.map(ug => ug.groupId) } }]
              : []),
          ],
        },
        select: { permission: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Also check AgoraTablePermission (group-based)
  let groupPermTables: any[] = [];
  if (userGroups.length > 0) {
    const groupPerms = await db.agoraTablePermission.findMany({
      where: {
        groupId: { in: userGroups.map(ug => ug.groupId) },
        tableId: { notIn: [...ownedIds, ...sharedTables.map(t => t.id)] },
      },
      include: {
        table: {
          include: {
            createdBy: {
              select: { name: true, email: true },
            },
          },
        },
      },
    });
    groupPermTables = groupPerms.map(gp => ({
      ...gp.table,
      shares: [{ permission: gp.permission }],
    }));
  }

  return {
    owned: ownedTables,
    shared: [...sharedTables, ...groupPermTables],
  };
}