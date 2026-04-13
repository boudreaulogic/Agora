import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST — add an existing table to this workspace
export async function POST(
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
      permission: { in: ['admin', 'owner'] },
    },
  });

  if (!member) {
    return NextResponse.json({ error: 'Forbidden — workspace admin required' }, { status: 403 });
  }

  const { tableId } = await request.json();

  if (!tableId) {
    return NextResponse.json({ error: 'tableId is required' }, { status: 400 });
  }

  const table = await db.agoraTable.findUnique({ where: { id: tableId } });
  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  await db.tableShare.deleteMany({ where: { tableId } });

  const updated = await db.agoraTable.update({
    where: { id: tableId },
    data: { workspaceId: params.id },
  });

  return NextResponse.json({ table: updated, sharesCleared: true });
}

// DELETE — remove a table from workspace (doesn't delete the table)
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
      permission: { in: ['admin', 'owner'] },
    },
  });

  if (!member) {
    return NextResponse.json({ error: 'Forbidden — workspace admin required' }, { status: 403 });
  }

  const { tableId } = await request.json();

  if (!tableId) {
    return NextResponse.json({ error: 'tableId is required' }, { status: 400 });
  }

  await db.agoraTable.update({
    where: { id: tableId },
    data: { workspaceId: null },
  });

  return NextResponse.json({ success: true, message: 'Table removed from workspace. Table owner still has access.' });
}