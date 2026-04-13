import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/tables/[id]/members — returns all users, groups, and roles with access to this table
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const table = await db.agoraTable.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      createdById: true,
      workspaceId: true,
      inheritPermissions: true,
      shares: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          group: { select: { id: true, name: true } },
          role: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const users: any[] = [];
  const groups: any[] = [];
  const roles: any[] = [];
  const seenUserIds = new Set<string>();
  const seenGroupIds = new Set<string>();
  const seenRoleIds = new Set<string>();

  // Add table owner
  const owner = await db.user.findUnique({
    where: { id: table.createdById },
    select: { id: true, name: true, email: true },
  });
  if (owner) {
    users.push({ ...owner, access: 'owner' });
    seenUserIds.add(owner.id);
  }

  // Add direct table shares
  for (const share of table.shares) {
    if (share.user && !seenUserIds.has(share.user.id)) {
      users.push({ ...share.user, access: share.permission });
      seenUserIds.add(share.user.id);
    }
    if (share.group && !seenGroupIds.has(share.group.id)) {
      groups.push({ ...share.group, access: share.permission });
      seenGroupIds.add(share.group.id);
    }
    if (share.role && !seenRoleIds.has(share.role.id)) {
      roles.push({ ...share.role, access: share.permission });
      seenRoleIds.add(share.role.id);
    }
  }

  // If table inherits from workspace, add workspace members
  if (table.workspaceId && table.inheritPermissions) {
    const workspace = await db.workspace.findUnique({
      where: { id: table.workspaceId },
      select: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            group: { select: { id: true, name: true } },
            role: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (workspace) {
      for (const member of workspace.members) {
        if (member.user && !seenUserIds.has(member.user.id)) {
          users.push({ ...member.user, access: member.permission + ' (workspace)' });
          seenUserIds.add(member.user.id);
        }
        if (member.group && !seenGroupIds.has(member.group.id)) {
          groups.push({ ...member.group, access: member.permission + ' (workspace)' });
          seenGroupIds.add(member.group.id);
        }
        if (member.role && !seenRoleIds.has(member.role.id)) {
          roles.push({ ...member.role, access: member.permission + ' (workspace)' });
          seenRoleIds.add(member.role.id);
        }
      }
    }
  }

  // Also resolve group members into individual users
  for (const group of groups) {
    const members = await db.groupMember.findMany({
      where: { groupId: group.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    for (const m of members) {
      if (!seenUserIds.has(m.user.id)) {
        users.push({ ...m.user, access: group.access + ' (via ' + group.name + ')' });
        seenUserIds.add(m.user.id);
      }
    }
  }

  return NextResponse.json({ users, groups, roles });
}