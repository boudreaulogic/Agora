import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { NextResponse } from 'next/server';
import { evaluateFormula } from '@/lib/formula';
import { logActivity } from '@/lib/activityLog';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    var authResult = await authenticateRequest(request, params.id, 'read');
    if (authResult instanceof NextResponse) return authResult;
    if (authResult.source === 'session') {
      var { getTablePermission: checkPerm } = await import('@/lib/tablePermissions');
      var perm = await checkPerm(authResult.userId, params.id);
      if (!perm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const columns = await db.agoraColumn.findMany({
      where: { tableId: params.id },
      orderBy: { position: 'asc' },
      include: {
        linkedTable: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
      },
    });

    return NextResponse.json(columns);
  } catch (error: any) {
    console.error('[API Error] Columns GET:', error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, type, settings, formula, linkedTableId, linkedDisplayColumnId, lookupLinkedColumnId, lookupFieldId, rollupLinkedColumnId, rollupFieldId, rollupFunction, required } = await request.json();

    if (type === 'formula') {
      if (!formula || !formula.trim()) {
        return NextResponse.json({ error: 'Formula is required for formula columns' }, { status: 400 });
      }

      try {
        const columns = await db.agoraColumn.findMany({
          where: { tableId: params.id },
          select: { id: true, name: true, type: true },
        });

        const testResult = evaluateFormula(formula, {}, columns);
        
        if (!testResult.success) {
          return NextResponse.json({ 
            error: `Invalid formula: ${testResult.error}` 
          }, { status: 400 });
        }
      } catch (error) {
        return NextResponse.json({ 
          error: 'Formula validation failed' 
        }, { status: 400 });
      }
    }

    if (type === 'linked_record') {
      if (!linkedTableId || !linkedTableId.trim()) {
        return NextResponse.json({ error: 'Linked table is required for linked record columns' }, { status: 400 });
      }

      const linkedTable = await db.agoraTable.findUnique({
        where: { id: linkedTableId },
      });

      if (!linkedTable) {
        return NextResponse.json({ error: 'Linked table not found' }, { status: 404 });
      }
    }

    if (type === 'lookup') {
      if (!lookupLinkedColumnId) {
        return NextResponse.json({ error: 'Please select a linked record column to look up from' }, { status: 400 });
      }
      if (!lookupFieldId) {
        return NextResponse.json({ error: 'Please select a field to display' }, { status: 400 });
      }

      const linkedColumn = await db.agoraColumn.findUnique({
        where: { id: lookupLinkedColumnId },
        select: { id: true, type: true, linkedTableId: true, tableId: true },
      });

      if (!linkedColumn || linkedColumn.type !== 'linked_record') {
        return NextResponse.json({ error: 'Selected column is not a linked record column' }, { status: 400 });
      }

      if (linkedColumn.tableId !== params.id) {
        return NextResponse.json({ error: 'Linked record column must be in the same table' }, { status: 400 });
      }

      const lookupField = await db.agoraColumn.findUnique({
        where: { id: lookupFieldId },
        select: { id: true, tableId: true },
      });

      if (!lookupField || lookupField.tableId !== linkedColumn.linkedTableId) {
        return NextResponse.json({ error: 'Lookup field must belong to the linked table' }, { status: 400 });
      }
    }
    
    if (type === 'rollup') {
      if (!rollupLinkedColumnId) {
        return NextResponse.json({ error: 'Please select a linked record column' }, { status: 400 });
      }
      if (!rollupFieldId && rollupFunction !== 'COUNT' && rollupFunction !== 'COUNTA') {
        return NextResponse.json({ error: 'Please select a field to aggregate' }, { status: 400 });
      }
      if (!rollupFunction) {
        return NextResponse.json({ error: 'Please select an aggregation function' }, { status: 400 });
      }

      const linkedColumn = await db.agoraColumn.findUnique({
        where: { id: rollupLinkedColumnId },
        select: { id: true, type: true, linkedTableId: true, tableId: true },
      });

      if (!linkedColumn || linkedColumn.type !== 'linked_record') {
        return NextResponse.json({ error: 'Selected column is not a linked record column' }, { status: 400 });
      }

      if (linkedColumn.tableId !== params.id) {
        return NextResponse.json({ error: 'Linked record column must be in the same table' }, { status: 400 });
      }
    }

    const { getTablePermission } = await import('@/lib/tablePermissions');
    const permission = await getTablePermission(session.user.id, params.id);
    if (!permission || permission === 'viewer' || permission === 'editor') {
      return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
    }

    const maxColumn = await db.agoraColumn.findFirst({
      where: { tableId: params.id },
      orderBy: { position: 'desc' },
    });

    const newPosition = (maxColumn?.position ?? -1) + 1;

    const column = await db.agoraColumn.create({
      data: {
        tableId: params.id,
        name: name.trim(),
        type,
        position: newPosition,
        settings: settings || {},
        required: required || false,
        formula: type === 'formula' ? formula : null,
        linkedTableId: type === 'linked_record' ? linkedTableId : null,
        linkedDisplayColumnId: type === 'linked_record' ? linkedDisplayColumnId : null,
        lookupLinkedColumnId: type === 'lookup' ? lookupLinkedColumnId : null,
        lookupFieldId: type === 'lookup' ? lookupFieldId : null,
        rollupLinkedColumnId: type === 'rollup' ? rollupLinkedColumnId : null,
        rollupFieldId: type === 'rollup' ? rollupFieldId : null,
        rollupFunction: type === 'rollup' ? rollupFunction : null,
      },
    });

    await logActivity({
      tableId: params.id,
      columnId: column.id,
      userId: session.user.id,
      action: 'COLUMN_ADDED',
      details: {
        columnName: name,
        columnType: type,
      },
    });

    return NextResponse.json(column);
  } catch (error: any) {
    console.error('[API Error] Column create:', error);
    if (error?.code === 'P2002') return NextResponse.json({ error: 'A column with this name already exists' }, { status: 409 });
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message },
      { status: 500 }
    );
  }
}