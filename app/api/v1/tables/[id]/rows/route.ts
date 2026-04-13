import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApiRequest, hasTableAccess, hasPermission, addRateLimitHeaders } from '@/lib/apiAuth';
import { wsBroadcast } from '@/lib/wsBroadcast';

// GET /api/v1/tables/:id/rows — list rows with optional filtering, sorting, pagination
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authResult = await authenticateApiRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!hasPermission(authResult, 'read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This API key does not have read permission' } },
      { status: 403 }
    );
  }

  if (!hasTableAccess(authResult, params.id)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This API key does not have access to this table' } },
      { status: 403 }
    );
  }

  try {
    // Parse query params
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const sortBy = url.searchParams.get('sort');
    const sortDir = url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc';

    // Verify table exists
    const table = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        columns: {
          select: { id: true, name: true, type: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!table) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Table not found' } },
        { status: 404 }
      );
    }

    // Get total count
    const total = await db.agoraRow.count({ where: { tableId: params.id } });

    // Get rows
    const rows = await db.agoraRow.findMany({
      where: { tableId: params.id },
      orderBy: { position: 'asc' },
      skip: offset,
      take: limit,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Get lookup data if table has lookup columns
    const lookupColumns = table.columns.filter(c => c.type === 'lookup');
    let lookupData: Record<string, Record<string, any>> = {};
    if (lookupColumns.length > 0) {
      try {
        const lookupRes = await fetch(`${getInternalUrl()}/api/tables/${params.id}/lookups`);
        if (lookupRes.ok) lookupData = await lookupRes.json();
      } catch {}
    }

    // Get rollup data if table has rollup columns
    const rollupColumns = table.columns.filter(c => c.type === 'rollup');
    let rollupData: Record<string, Record<string, any>> = {};
    if (rollupColumns.length > 0) {
      try {
        const rollupRes = await fetch(`${getInternalUrl()}/api/tables/${params.id}/rollups`);
        if (rollupRes.ok) rollupData = await rollupRes.json();
      } catch {}
    }

    // Format rows
    const formatted = rows.map(row => {
      const result: any = {
        id: row.id,
        data: row.data,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        isLocked: row.isLocked,
      };

      // Merge in lookup values
      if (lookupColumns.length > 0) {
        result.lookups = {};
        for (const col of lookupColumns) {
          result.lookups[col.id] = lookupData[col.id]?.[row.id] || [];
        }
      }

      // Merge in rollup values
      if (rollupColumns.length > 0) {
        result.rollups = {};
        for (const col of rollupColumns) {
          result.rollups[col.id] = rollupData[col.id]?.[row.id] || null;
        }
      }

      return result;
    });

    // Sort by a data column if requested
    if (sortBy) {
      formatted.sort((a: any, b: any) => {
        const aVal = a.data?.[sortBy] || '';
        const bVal = b.data?.[sortBy] || '';
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    const response = NextResponse.json({
      data: formatted,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
    return addRateLimitHeaders(response, authResult);
  } catch (error) {
    console.error('API v1 rows GET error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch rows' } },
      { status: 500 }
    );
  }
}

// POST /api/v1/tables/:id/rows — create one or more rows
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authResult = await authenticateApiRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!hasPermission(authResult, 'write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This API key does not have write permission' } },
      { status: 403 }
    );
  }

  if (!hasTableAccess(authResult, params.id)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This API key does not have access to this table' } },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // Support single row or array of rows
    const rowsInput = Array.isArray(body) ? body : [body];

    if (rowsInput.length === 0) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'No rows provided' } },
        { status: 400 }
      );
    }

    if (rowsInput.length > 100) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Maximum 100 rows per request' } },
        { status: 400 }
      );
    }

    // Get max position
    const maxRow = await db.agoraRow.findFirst({
      where: { tableId: params.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    let nextPosition = (maxRow?.position ?? -1) + 1;

    const createdRows = [];

    for (const input of rowsInput) {
      const data = input.data || input;

      const row = await db.agoraRow.create({
        data: {
          tableId: params.id,
          data: data,
          position: nextPosition++,
          createdById: authResult.userId,
        },
      });

      createdRows.push({
        id: row.id,
        data: row.data,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        isLocked: row.isLocked,
      });

      // Broadcast via WebSocket so the UI updates live
      await wsBroadcast(params.id, {
        type: 'row-inserted',
        row: { ...row, data: row.data || {} },
      });
    }

    const response = NextResponse.json({
      data: Array.isArray(body) ? createdRows : createdRows[0],
      meta: { created: createdRows.length },
    }, { status: 201 });
    return addRateLimitHeaders(response, authResult);
  } catch (error) {
    console.error('API v1 rows POST error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create rows' } },
      { status: 500 }
    );
  }
}

function getInternalUrl(): string {
  return process.env.NEXTAUTH_URL || 'http://localhost:3000';
}