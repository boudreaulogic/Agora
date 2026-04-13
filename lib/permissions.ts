import { db } from './db';

export async function userHasPermission(userId: string, permission: string): Promise<boolean> {
  // Get user's roles
  const userRoles = await db.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  // Check if any role has this permission
  for (const userRole of userRoles) {
    const hasPermission = userRole.role.permissions.some(
      rp => rp.permission.slug === permission
    );
    if (hasPermission) return true;
  }

  // Check direct user permissions
  const directPermissions = await db.userPermission.findMany({
    where: { 
      userId,
      granted: true,
    },
    include: {
      permission: true,
    },
  });

  const hasDirectPermission = directPermissions.some(
    up => up.permission.slug === permission
  );
  if (hasDirectPermission) return true;

  // Check group permissions
  const groupMemberships = await db.groupMember.findMany({
    where: { userId },
    include: {
      group: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  for (const membership of groupMemberships) {
    const hasGroupPermission = membership.group.permissions.some(
      gp => gp.permission.slug === permission
    );
    if (hasGroupPermission) return true;
  }

  return false;
}

export async function requirePermission(userId: string, permission: string) {
  const hasPermission = await userHasPermission(userId, permission);
  if (!hasPermission) {
    throw new Error(`Missing required permission: ${permission}`);
  }
}

export async function isAdmin(userId: string): Promise<boolean> {
  // Check if user has admin access permission
  return await userHasPermission(userId, 'admin.access');
}

// Alias for backwards compatibility
export const isSuperAdmin = isAdmin;