import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const permission = await getTablePermission(session.user.id, params.id);
  if (!permission || permission === 'viewer' || permission === 'editor') {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  const table = await db.agoraTable.findUnique({
    where: { id: params.id },
    include: { 
      columns: true,
      rows: true,
    },
  });
  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const { headers, rows } = await request.json();

  const columnMap: { [csvHeader: string]: string } = {};
  headers.forEach((csvHeader: string) => {
    const column = table.columns.find(
      col => col.name.toLowerCase() === csvHeader.toLowerCase()
    );
    if (column) {
      columnMap[csvHeader] = column.id;
    }
  });

  let duplicateCount = 0;
  let newCount = 0;

  for (const csvRow of rows) {
    const rowDataWithIds: any = {};
    
    Object.entries(csvRow).forEach(([csvHeader, value]) => {
      const columnId = columnMap[csvHeader];
      if (columnId) {
        rowDataWithIds[columnId] = String(value || '').trim();
      }
    });

    const mappedColumnIds = Object.keys(rowDataWithIds);
    
    if (mappedColumnIds.length === 0) {
      newCount++;
      continue;
    }

    const isDuplicate = table.rows.some((existingRow: any) => {
      return mappedColumnIds.every((columnId) => {
        const existingValue = String(existingRow.data[columnId] || '').trim().toLowerCase();
        const newValue = String(rowDataWithIds[columnId] || '').trim().toLowerCase();
        return existingValue === newValue;
      });
    });

    if (isDuplicate) {
      duplicateCount++;
    } else {
      newCount++;
    }
  }

  return NextResponse.json({
    duplicates: duplicateCount,
    newRows: newCount,
    totalRows: rows.length,
  });
}