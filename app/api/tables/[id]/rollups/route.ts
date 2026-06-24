import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const perm = await getTablePermission(session.user.id, params.id);
  if (!perm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    // Get all rollup columns for this table
    const rollupColumns = await db.agoraColumn.findMany({
      where: {
        tableId: params.id,
        type: 'rollup',
      },
      select: {
        id: true,
        rollupLinkedColumnId: true,
        rollupFieldId: true,
        rollupFunction: true,
      },
    });

    if (rollupColumns.length === 0) {
      return NextResponse.json({});
    }

    // Get all rows in this table
    const rows = await db.agoraRow.findMany({
      where: { tableId: params.id },
      select: { id: true },
    });

    const result: Record<string, Record<string, any>> = {};

    for (const rollupCol of rollupColumns) {
      if (!rollupCol.rollupLinkedColumnId || !rollupCol.rollupFunction) continue;

      result[rollupCol.id] = {};

      // For each row, find linked records and aggregate
      for (const row of rows) {
        // Get linked record IDs via the linked_record column
        const links = await db.linkedRecord.findMany({
          where: {
            fromRowId: row.id,
            columnId: rollupCol.rollupLinkedColumnId,
          },
          select: { toRowId: true },
        });

        const linkedRowIds = links.map(l => l.toRowId);

        if (linkedRowIds.length === 0) {
          result[rollupCol.id][row.id] = rollupCol.rollupFunction === 'COUNT' || rollupCol.rollupFunction === 'COUNTA' ? 0 : null;
          continue;
        }

        // COUNT doesn't need field data
        if (rollupCol.rollupFunction === 'COUNT') {
          result[rollupCol.id][row.id] = linkedRowIds.length;
          continue;
        }

        // Get the linked rows' data
        const linkedRows = await db.agoraRow.findMany({
          where: { id: { in: linkedRowIds } },
          select: { data: true },
        });

        const fieldId = rollupCol.rollupFieldId;
        if (!fieldId) {
          result[rollupCol.id][row.id] = null;
          continue;
        }

        // Extract field values
        const values = linkedRows
          .map(r => (r.data as any)?.[fieldId])
          .filter(v => v !== null && v !== undefined && v !== '');

        switch (rollupCol.rollupFunction) {
          case 'COUNTA':
            result[rollupCol.id][row.id] = values.length;
            break;

          case 'SUM': {
            const nums = values.map(Number).filter(n => !isNaN(n));
            result[rollupCol.id][row.id] = nums.reduce((a, b) => a + b, 0);
            break;
          }

          case 'AVG': {
            const nums = values.map(Number).filter(n => !isNaN(n));
            result[rollupCol.id][row.id] = nums.length > 0
              ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
              : null;
            break;
          }

          case 'MIN': {
            const nums = values.map(Number).filter(n => !isNaN(n));
            result[rollupCol.id][row.id] = nums.length > 0 ? Math.min(...nums) : null;
            break;
          }

          case 'MAX': {
            const nums = values.map(Number).filter(n => !isNaN(n));
            result[rollupCol.id][row.id] = nums.length > 0 ? Math.max(...nums) : null;
            break;
          }

          default:
            result[rollupCol.id][row.id] = null;
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error computing rollups:', error);
    return NextResponse.json({ error: 'Failed to compute rollups' }, { status: 500 });
  }
}