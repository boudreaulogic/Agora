import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST /api/tables/[id]/rows/[rowId]/link/[columnId]
// Sets a single linked record for a cell
export async function POST(
  request: Request,
  { params }: { params: { id: string; rowId: string; columnId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { getTablePermission } = await import('@/lib/tablePermissions');
  const permission = await getTablePermission(session.user.id, params.id);
  if (!permission || permission === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { linkedRowId } = await request.json();

  // Get the column to find the linked table
  const column = await db.agoraColumn.findUnique({
    where: { id: params.columnId },
    select: { id: true, type: true, linkedTableId: true },
  });

  if (!column || column.type !== 'linked_record' || !column.linkedTableId) {
    return NextResponse.json({ error: 'Invalid linked record column' }, { status: 400 });
  }

  // Delete existing link for this cell
  await db.linkedRecord.deleteMany({
    where: {
      fromRowId: params.rowId,
      columnId: params.columnId,
    },
  });

  // If linkedRowId is null/empty, just clear the link
  if (!linkedRowId) {
    // Also clear the cell data
    const row = await db.agoraRow.findUnique({ where: { id: params.rowId } });
    if (row) {
      const data = (row.data as Record<string, any>) || {};
      delete data[params.columnId];
      await db.agoraRow.update({
        where: { id: params.rowId },
        data: { data },
      });
    }
    return NextResponse.json({ success: true, linkedRowId: null });
  }

  // Verify the target row exists in the linked table
  const targetRow = await db.agoraRow.findUnique({
    where: { id: linkedRowId },
    select: { id: true, tableId: true },
  });

  if (!targetRow || targetRow.tableId !== column.linkedTableId) {
    return NextResponse.json({ error: 'Target row not found in linked table' }, { status: 404 });
  }

  // Create the new link
  await db.linkedRecord.create({
    data: {
      fromTableId: params.id,
      fromRowId: params.rowId,
      toTableId: column.linkedTableId,
      toRowId: linkedRowId,
      columnId: params.columnId,
    },
  });

  // Store the linked row ID in the cell data for quick access
  const row = await db.agoraRow.findUnique({ where: { id: params.rowId } });
  if (row) {
    const data = (row.data as Record<string, any>) || {};
    data[params.columnId] = linkedRowId;
    await db.agoraRow.update({
      where: { id: params.rowId },
      data: { data },
    });
  }

  return NextResponse.json({ success: true, linkedRowId });
}

// GET /api/tables/[id]/rows/[rowId]/link/[columnId]
// Gets the current linked record for a cell
export async function GET(
  request: Request,
  { params }: { params: { id: string; rowId: string; columnId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const link = await db.linkedRecord.findFirst({
    where: {
      fromRowId: params.rowId,
      columnId: params.columnId,
    },
    include: {
      toRow: {
        select: { id: true, data: true },
      },
    },
  });

  if (!link) {
    return NextResponse.json({ linkedRowId: null, linkedRow: null });
  }

  return NextResponse.json({
    linkedRowId: link.toRowId,
    linkedRow: link.toRow,
  });
}