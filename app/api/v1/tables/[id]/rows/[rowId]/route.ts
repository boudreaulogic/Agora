import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApiRequest, hasTableAccess, hasPermission, addRateLimitHeaders } from '@/lib/apiAuth';
import { wsBroadcast } from '@/lib/wsBroadcast';

// GET /api/v1/tables/:id/rows/:rowId — get a single row
export async function GET(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
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
    const row = await db.agoraRow.findUnique({
      where: { id: params.rowId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!row || row.tableId !== params.id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Row not found' } },
        { status: 404 }
      );
    }

    const response = NextResponse.json({
      data: {
        id: row.id,
        data: row.data,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        isLocked: row.isLocked,
      },
    });
    return addRateLimitHeaders(response, authResult);
  } catch (error) {
    console.error('API v1 row GET error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch row' } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/tables/:id/rows/:rowId — update a row
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
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
    // Get existing row
    const existing = await db.agoraRow.findUnique({
      where: { id: params.rowId },
    });

    if (!existing || existing.tableId !== params.id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Row not found' } },
        { status: 404 }
      );
    }

    // Check if row is locked
    if (existing.isLocked) {
      return NextResponse.json(
        { error: { code: 'LOCKED', message: 'This row is locked and cannot be edited' } },
        { status: 423 }
      );
    }

    const body = await request.json();
    const newData = body.data || body;

    // Merge new data with existing data (partial update)
    const mergedData = {
      ...(existing.data as any),
      ...newData,
    };

    const updated = await db.agoraRow.update({
      where: { id: params.rowId },
      data: { data: mergedData },
    });

    // Broadcast each changed field via WebSocket
    for (const [columnId, value] of Object.entries(newData)) {
      await wsBroadcast(params.id, {
        type: 'cell-update',
        rowId: params.rowId,
        columnId,
        value,
      });
    }

    const response = NextResponse.json({
      data: {
        id: updated.id,
        data: updated.data,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        isLocked: updated.isLocked,
      },
    });
    return addRateLimitHeaders(response, authResult);
  } catch (error) {
    console.error('API v1 row PATCH error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update row' } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/tables/:id/rows/:rowId — delete a row
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
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
    const row = await db.agoraRow.findUnique({
      where: { id: params.rowId },
    });

    if (!row || row.tableId !== params.id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Row not found' } },
        { status: 404 }
      );
    }

    if (row.isLocked) {
      return NextResponse.json(
        { error: { code: 'LOCKED', message: 'This row is locked and cannot be deleted' } },
        { status: 423 }
      );
    }

    await db.agoraRow.delete({ where: { id: params.rowId } });

    const response = NextResponse.json({
      data: { id: params.rowId, deleted: true },
    });
    return addRateLimitHeaders(response, authResult);
  } catch (error) {
    console.error('API v1 row DELETE error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to delete row' } },
      { status: 500 }
    );
  }
}