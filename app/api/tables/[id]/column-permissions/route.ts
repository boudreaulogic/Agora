import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { canAdminTable } from '@/lib/tablePermissions';

// GET all column permissions for a table
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const permissions = await db.columnPermission.findMany({
      where: { tableId: params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ permissions });
  } catch (error) {
    console.error('Error fetching column permissions:', error);
    return NextResponse.json({ error: 'Failed to fetch column permissions' }, { status: 500 });
  }
}

// POST — add a column permission rule
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasAdmin = await canAdminTable(session.user.id, params.id);
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  const { columnId, userId, groupId, canView, canEdit } = await request.json();

  if (!columnId) {
    return NextResponse.json({ error: 'columnId is required' }, { status: 400 });
  }

  const provided = [userId, groupId].filter(Boolean);
  if (provided.length !== 1) {
    return NextResponse.json({ error: 'Must provide exactly one of: userId or groupId' }, { status: 400 });
  }

  // Check for existing rule
  const existing = await db.columnPermission.findFirst({
    where: {
      columnId,
      ...(userId && { userId }),
      ...(groupId && { groupId }),
    },
  });

  if (existing) {
    return NextResponse.json({ error: 'Permission rule already exists for this column and target' }, { status: 400 });
  }

  const permission = await db.columnPermission.create({
    data: {
      tableId: params.id,
      columnId,
      userId: userId || undefined,
      groupId: groupId || undefined,
      canView: canView ?? true,
      canEdit: canEdit ?? true,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      group: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ permission });
}

// PATCH — update an existing column permission rule
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
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  const { permissionId, canView, canEdit } = await request.json();

  if (!permissionId) {
    return NextResponse.json({ error: 'permissionId is required' }, { status: 400 });
  }

  const updated = await db.columnPermission.update({
    where: { id: permissionId },
    data: {
      ...(canView !== undefined && { canView }),
      ...(canEdit !== undefined && { canEdit }),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      group: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ permission: updated });
}

// DELETE — remove a column permission rule
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasAdmin = await canAdminTable(session.user.id, params.id);
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const permissionId = searchParams.get('permissionId');

  if (!permissionId) {
    return NextResponse.json({ error: 'permissionId is required' }, { status: 400 });
  }

  await db.columnPermission.delete({
    where: { id: permissionId },
  });

  return NextResponse.json({ success: true });
}