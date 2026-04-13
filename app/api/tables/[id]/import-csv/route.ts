import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
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
      },
    });
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    const { headers, rows } = await request.json();

    const columnMap = new Map<string, string>();
    headers.forEach((csvHeader: string) => {
      const column = table.columns.find(
        col => col.name.toLowerCase() === csvHeader.toLowerCase()
      );
      if (column) {
        columnMap.set(csvHeader, column.id);
      }
    });

    const csvRowsWithIds = rows.map((csvRow: any) => {
      const rowData: any = {};
      Object.entries(csvRow).forEach(([header, value]) => {
        const colId = columnMap.get(header);
        if (colId) {
          rowData[colId] = value;
        }
      });
      return rowData;
    });

    const maxRow = await db.agoraRow.findFirst({
      where: { tableId: params.id },
      orderBy: { position: 'desc' },
    });
    let position = (maxRow?.position ?? -1) + 1;

    const created = [];
    for (const rowData of csvRowsWithIds) {
      const newRow = await db.agoraRow.create({
        data: {
          tableId: params.id,
          data: rowData,
          position: position++,
          createdById: session.user.id,
        },
      });
      created.push(newRow);
    }

    return NextResponse.json({ 
      imported: created.length,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}