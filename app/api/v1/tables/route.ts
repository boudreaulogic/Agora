import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApiRequest, hasPermission, addRateLimitHeaders } from '@/lib/apiAuth';

// GET /api/v1/tables — list tables the API key has access to
export async function GET(request: Request) {
  const authResult = await authenticateApiRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!hasPermission(authResult, 'read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This API key does not have read permission' } },
      { status: 403 }
    );
  }

  try {
    let tables;

    if (authResult.tableScope.length > 0) {
      // Key is scoped to specific tables
      tables = await db.agoraTable.findMany({
        where: { id: { in: authResult.tableScope } },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          icon: true,
          createdAt: true,
          updatedAt: true,
          columns: {
            select: {
              id: true,
              name: true,
              type: true,
              settings: true,
              position: true,
            },
            orderBy: { position: 'asc' },
          },
          _count: { select: { rows: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    } else {
      // Key has access to all tables the user owns or has shares on
      tables = await db.agoraTable.findMany({
        where: { createdById: authResult.userId },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          icon: true,
          createdAt: true,
          updatedAt: true,
          columns: {
            select: {
              id: true,
              name: true,
              type: true,
              settings: true,
              position: true,
            },
            orderBy: { position: 'asc' },
          },
          _count: { select: { rows: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    // Format columns to be more API-friendly
    const formatted = tables.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      icon: t.icon,
      rowCount: t._count.rows,
      columns: t.columns.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        settings: c.settings,
        position: c.position,
      })),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    const response = NextResponse.json({
      data: formatted,
      meta: { total: formatted.length },
    });
    return addRateLimitHeaders(response, authResult);
  } catch (error) {
    console.error('API v1 tables error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch tables' } },
      { status: 500 }
    );
  }
}