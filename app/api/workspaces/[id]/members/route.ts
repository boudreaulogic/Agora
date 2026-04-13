import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST — add a member to workspace
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin/owner
  const member = await db.workspaceMember.findFirst({
    where: {
      workspaceId: params.id,
      userId: session.user.id,
      permission: { in: ['owner', 'admin'] },
    },
  });

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId, roleId, groupId, permission } = await request.json();

  const provided = [userId, roleId, groupId].filter(Boolean);
  if (provided.length !== 1) {
    return NextResponse.json({ error: 'Provide exactly one of userId, roleId, or groupId' }, { status: 400 });
  }

  const validPermissions = ['viewer', 'editor', 'admin', 'owner'];
  if (permission && !validPermissions.includes(permission)) {
    return NextResponse.json({ error: 'Invalid permission level' }, { status: 400 });
  }

  const newMember = await db.workspaceMember.create({
    data: {
      workspaceId: params.id,
      userId: userId || undefined,
      roleId: roleId || undefined,
      groupId: groupId || undefined,
      permission: permission || 'viewer',
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      role: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ member: newMember });
}

// PATCH — update a member's permission (including ownership transfer)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const callerMember = await db.workspaceMember.findFirst({
    where: {
      workspaceId: params.id,
      userId: session.user.id,
      permission: { in: ['owner', 'admin'] },
    },
  });
  if (!callerMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { memberId, permission } = await request.json();
  if (!memberId || !permission) {
    return NextResponse.json({ error: 'memberId and permission are required' }, { status: 400 });
  }

  const validPermissions = ['viewer', 'editor', 'admin', 'owner'];
  if (!validPermissions.includes(permission)) {
    return NextResponse.json({ error: 'Invalid permission level' }, { status: 400 });
  }

  // Only owners can promote someone to owner or transfer ownership
  if (permission === 'owner' && callerMember.permission !== 'owner') {
    return NextResponse.json({ error: 'Only owners can transfer ownership' }, { status: 403 });
  }

  const targetMember = await db.workspaceMember.findUnique({ where: { id: memberId } });
  if (!targetMember || targetMember.workspaceId !== params.id) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  // If transferring ownership, demote current owner to admin
  if (permission === 'owner') {
    await db.workspaceMember.update({
      where: { id: callerMember.id },
      data: { permission: 'admin' },
    });

    // Also transfer workspace creator
    await db.workspace.update({
      where: { id: params.id },
      data: { createdById: targetMember.userId || session.user.id },
    });
  }

  // Prevent owners from demoting themselves if they're the only owner
  if (targetMember.userId === session.user.id && callerMember.permission === 'owner' && permission !== 'owner') {
    const otherOwners = await db.workspaceMember.count({
      where: {
        workspaceId: params.id,
        permission: 'owner',
        id: { not: callerMember.id },
      },
    });
    if (otherOwners === 0) {
      return NextResponse.json({ error: 'Cannot demote yourself — transfer ownership first' }, { status: 400 });
    }
  }

  const updated = await db.workspaceMember.update({
    where: { id: memberId },
    data: { permission },
    include: {
      user: { select: { id: true, name: true, email: true } },
      role: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ member: updated });
}

// DELETE — remove a member
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const member = await db.workspaceMember.findFirst({
    where: {
      workspaceId: params.id,
      userId: session.user.id,
      permission: { in: ['owner', 'admin'] },
    },
  });

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { memberId } = await request.json();

  if (!memberId) {
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
  }

  await db.workspaceMember.delete({ where: { id: memberId } });

  return NextResponse.json({ success: true });
}