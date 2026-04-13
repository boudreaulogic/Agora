import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { logActivity } from '@/lib/activityLog';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string; columnId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, rowId, columnId } = await params;

    const links = await db.linkedRecord.findMany({
      where: {
        fromTableId: id,
        fromRowId: rowId,
        columnId: columnId,
      },
      include: {
        toRow: true,
      },
    });

    return NextResponse.json(links);
  } catch (error) {
    console.error('Error fetching links:', error);
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string; columnId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, rowId, columnId } = await params;
    const { linkedRecordIds } = await req.json();

    // Get existing links before deleting
    const existingLinks = await db.linkedRecord.findMany({
      where: {
        fromTableId: id,
        fromRowId: rowId,
        columnId: columnId,
      },
      select: { toRowId: true },
    });
    const existingIds = existingLinks.map(l => l.toRowId);

    // Delete existing links
    await db.linkedRecord.deleteMany({
      where: {
        fromTableId: id,
        fromRowId: rowId,
        columnId: columnId,
      },
    });

    const column = await db.agoraColumn.findUnique({
      where: { id: columnId },
      select: { linkedTableId: true, name: true },
    });

    if (!column?.linkedTableId) {
      return NextResponse.json({ error: 'Column is not a linked record type' }, { status: 400 });
    }

    // Create new links
    const links = await Promise.all(
      linkedRecordIds.map((toRowId: string) =>
        db.linkedRecord.create({
          data: {
            fromTableId: id,
            fromRowId: rowId,
            toTableId: column.linkedTableId!,
            toRowId: toRowId,
            columnId: columnId,
          },
          include: {
            toRow: true,
          },
        })
      )
    );

    // Log added links
    const addedIds = linkedRecordIds.filter((rid: string) => !existingIds.includes(rid));
    const removedIds = existingIds.filter(rid => !linkedRecordIds.includes(rid));

    if (addedIds.length > 0) {
      await logActivity({
        tableId: id,
        rowId,
        columnId,
        userId: session.user.id,
        action: 'LINK_ADDED',
        details: {
          columnName: column.name,
          linkedRowIds: addedIds,
          count: addedIds.length,
        },
      });
    }

    if (removedIds.length > 0) {
      await logActivity({
        tableId: id,
        rowId,
        columnId,
        userId: session.user.id,
        action: 'LINK_REMOVED',
        details: {
          columnName: column.name,
          linkedRowIds: removedIds,
          count: removedIds.length,
        },
      });
    }

    return NextResponse.json(links);
  } catch (error) {
    console.error('Error updating links:', error);
    return NextResponse.json({ error: 'Failed to update links' }, { status: 500 });
  }
}