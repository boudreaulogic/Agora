import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { canAdminTable } from '@/lib/tablePermissions';
import { wsBroadcast } from '@/lib/wsBroadcast';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Owner or admin can view shares
  const hasAdmin = await canAdminTable(session.user.id, params.id);
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Get table with owner info
  const table = await db.agoraTable.findUnique({
    where: { id: params.id },
    select: {
      createdById: true,
      rowLevelSecurity: true,
      inheritPermissions: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Get all shares for this table
  const shares = await db.tableShare.findMany({
    where: { tableId: params.id },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      role: {
        select: { id: true, name: true },
      },
      group: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ shares, owner: table?.createdBy, rowLevelSecurity: table?.rowLevelSecurity, inheritPermissions: table?.inheritPermissions });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Owner or admin can share
  const hasAdmin = await canAdminTable(session.user.id, params.id);
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();
  const { userId, roleId, groupId, permission = 'viewer' } = body;

  // Validate permission level
  if (!['viewer', 'editor', 'admin'].includes(permission)) {
    return NextResponse.json({ error: 'Invalid permission level' }, { status: 400 });
  }

  // Ensure only one of userId, roleId, or groupId is provided
  const provided = [userId, roleId, groupId].filter(Boolean);
  if (provided.length !== 1) {
    return NextResponse.json(
      { error: 'Must provide exactly one of: userId, roleId, or groupId' },
      { status: 400 }
    );
  }

  // Can't share with yourself
  if (userId) {
    const table = await db.agoraTable.findUnique({ where: { id: params.id } });
    if (table?.createdById === userId) {
      return NextResponse.json({ error: 'Cannot share with the table owner' }, { status: 400 });
    }
  }

  // Check if share already exists
  const existing = await db.tableShare.findFirst({
    where: {
      tableId: params.id,
      ...(userId && { userId }),
      ...(roleId && { roleId }),
      ...(groupId && { groupId }),
    },
  });

  if (existing) {
    return NextResponse.json({ error: 'Already shared with this user/role/group' }, { status: 400 });
  }

  // Create share with permission
  const share = await db.tableShare.create({
    data: {
      tableId: params.id,
      userId: userId || undefined,
      roleId: roleId || undefined,
      groupId: groupId || undefined,
      permission,
      sharedBy: session.user.id,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      role: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  });

  await wsBroadcast(params.id, { type: 'permissions-changed', action: 'share-added', shareId: share.id });
  await wsBroadcast(params.id, { type: 'permissions-changed', action: 'share-added' });
  return NextResponse.json({ share });
}

// PATCH to update permission level on existing share (including ownership transfer)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasAdmin = await canAdminTable(session.user.id, params.id);
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { shareId, permission } = await request.json();

  if (!shareId || !['viewer', 'editor', 'admin', 'owner'].includes(permission)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Handle ownership transfer
  if (permission === 'owner') {
    // Only current owner can transfer ownership
    const table = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: { createdById: true },
    });
    if (table?.createdById !== session.user.id) {
      return NextResponse.json({ error: 'Only the table owner can transfer ownership' }, { status: 403 });
    }

    const share = await db.tableShare.findUnique({
      where: { id: shareId },
      select: { userId: true },
    });
    if (!share?.userId) {
      return NextResponse.json({ error: 'Can only transfer ownership to a user (not a group or role)' }, { status: 400 });
    }

    // Transfer: update table creator to the new owner
    await db.agoraTable.update({
      where: { id: params.id },
      data: { createdById: share.userId },
    });

    // Remove the share entry (new owner doesn't need a share — they're the creator now)
    await db.tableShare.delete({ where: { id: shareId } });

    // Create a share for the OLD owner as admin
    await db.tableShare.create({
      data: {
        tableId: params.id,
        userId: session.user.id,
        permission: 'admin',
        sharedBy: share.userId,
      },
    });

    await wsBroadcast(params.id, { type: 'permissions-changed', action: 'ownership-transferred' });
    return NextResponse.json({ transferred: true });
  }

  const updated = await db.tableShare.update({
    where: { id: shareId },
    data: { permission },
    include: {
      user: { select: { id: true, name: true, email: true } },
      role: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  });

  await wsBroadcast(params.id, { type: 'permissions-changed', action: 'share-updated' });
  return NextResponse.json({ share: updated });
}