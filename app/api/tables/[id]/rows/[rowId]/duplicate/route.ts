import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export async function POST(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const permission = await getTablePermission(session.user.id, params.id);
  if (!permission || permission === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const originalRow = await db.agoraRow.findUnique({
    where: { id: params.rowId },
  });
  if (!originalRow || originalRow.tableId !== params.id) {
    return NextResponse.json({ error: 'Row not found' }, { status: 404 });
  }

  if (originalRow.isLocked) {
    return NextResponse.json({ error: 'Cannot duplicate a locked row' }, { status: 403 });
  }

  await db.agoraRow.updateMany({
    where: {
      tableId: params.id,
      position: {
        gt: originalRow.position,
      },
    },
    data: {
      position: {
        increment: 1,
      },
    },
  });

  const duplicateRow = await db.agoraRow.create({
    data: {
      tableId: params.id,
      data: originalRow.data as any,
      position: originalRow.position + 1,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(duplicateRow);
}