import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/tables — list all tables the user can access
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  // Check if user is admin
  const isAdmin = await db.userRole.findFirst({
    where: {
      userId,
      role: { permissions: { some: { permission: { slug: 'admin.access' } } } },
    },
  });

  let tables;
  if (isAdmin) {
    tables = await db.agoraTable.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        isSheetBacked: true,
        createdById: true,
        workspaceId: true,
        createdAt: true,
        columns: {
          select: {
            id: true,
            name: true,
            type: true,
            settings: true,
          },
          orderBy: { position: 'asc' as const },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  } else {
    // Get tables user owns or has access to
    const userRoles = await db.userRole.findMany({ where: { userId }, select: { roleId: true } });
    const userGroups = await db.groupMember.findMany({ where: { userId }, select: { groupId: true } });
    const roleIds = userRoles.map(r => r.roleId);
    const groupIds = userGroups.map(g => g.groupId);

    tables = await db.agoraTable.findMany({
      where: {
        OR: [
          { createdById: userId },
          { shares: { some: { userId } } },
          { shares: { some: { roleId: { in: roleIds } } } },
          { shares: { some: { groupId: { in: groupIds } } } },
          { workspace: { members: { some: { userId } } } },
          { workspace: { members: { some: { roleId: { in: roleIds } } } } },
          { workspace: { members: { some: { groupId: { in: groupIds } } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        isSheetBacked: true,
        createdById: true,
        workspaceId: true,
        createdAt: true,
        columns: {
          select: {
            id: true,
            name: true,
            type: true,
            settings: true,
          },
          orderBy: { position: 'asc' as const },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  return NextResponse.json(tables);
}