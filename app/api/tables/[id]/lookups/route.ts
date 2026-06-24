import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { getTablePermission } from '@/lib/tablePermissions';

// GET /api/tables/[id]/lookups
// Resolves all lookup column values for a table
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const perm = await getTablePermission(session.user.id, params.id);
    if (!perm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const tableId = params.id;

    // Find all lookup columns in this table
    const lookupColumns = await db.agoraColumn.findMany({
      where: {
        tableId,
        type: 'lookup',
        lookupLinkedColumnId: { not: null },
        lookupFieldId: { not: null },
      },
      select: {
        id: true,
        lookupLinkedColumnId: true,
        lookupFieldId: true,
      },
    });

    if (lookupColumns.length === 0) {
      return NextResponse.json({});
    }

    const result: Record<string, Record<string, any[]>> = {};

    for (const lookupCol of lookupColumns) {
      const linkedColumnId = lookupCol.lookupLinkedColumnId!;
      const lookupFieldId = lookupCol.lookupFieldId!;

      const links = await db.linkedRecord.findMany({
        where: {
          fromTableId: tableId,
          columnId: linkedColumnId,
        },
        include: {
          toRow: {
            select: {
              id: true,
              data: true,
            },
          },
        },
      });

      const valuesByRow: Record<string, any[]> = {};

      for (const link of links) {
        const fromRowId = link.fromRowId;
        const rowData = link.toRow.data as Record<string, any>;
        const fieldValue = rowData[lookupFieldId];

        if (!valuesByRow[fromRowId]) {
          valuesByRow[fromRowId] = [];
        }

        if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
          valuesByRow[fromRowId].push(fieldValue);
        }
      }

      result[lookupCol.id] = valuesByRow;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error resolving lookups:', error);
    return NextResponse.json({ error: 'Failed to resolve lookups' }, { status: 500 });
  }
}