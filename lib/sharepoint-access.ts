// Access control for SharePoint list connections.
// Admins see/manage every connection. Regular users see a connection only if it
// is visibleToAll or they belong to one of its granted groups (mirrors the
// group-based AgoraTablePermission model).
import { db } from '@/lib/db';

export async function isSharePointAdmin(userId: string): Promise<boolean> {
  var userRoles = await db.userRole.findMany({
    where: { userId: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return userRoles.some(function(ur) {
    return ur.role.slug === 'admin' || ur.role.slug === 'super_admin' ||
      ur.role.permissions.some(function(rp) { return rp.permission.slug === 'admin.access'; });
  });
}

export async function getAccessibleConnections(userId: string) {
  if (await isSharePointAdmin(userId)) {
    return db.sharePointListConnection.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }
  var memberships = await db.groupMember.findMany({ where: { userId: userId }, select: { groupId: true } });
  var groupIds = memberships.map(function(m) { return m.groupId; });
  return db.sharePointListConnection.findMany({
    where: {
      isActive: true,
      OR: [
        { visibleToAll: true },
        { access: { some: { groupId: { in: groupIds } } } },
      ],
    },
    orderBy: { name: 'asc' },
  });
}

export async function canAccessConnection(userId: string, connectionId: string): Promise<boolean> {
  if (await isSharePointAdmin(userId)) return true;
  var conn = await db.sharePointListConnection.findFirst({
    where: { id: connectionId, isActive: true },
    select: { visibleToAll: true, access: { select: { groupId: true } } },
  });
  if (!conn) return false;
  if (conn.visibleToAll) return true;
  if (conn.access.length === 0) return false;
  var memberships = await db.groupMember.findMany({ where: { userId: userId }, select: { groupId: true } });
  var groupIds = new Set(memberships.map(function(m) { return m.groupId; }));
  return conn.access.some(function(a) { return groupIds.has(a.groupId); });
}
