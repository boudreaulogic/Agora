// ============================================================
// app/api/insights/embed-query/route.ts
// PUBLIC, token-scoped query endpoint for embedded dashboards.
// No session — the embed token is the credential. To prevent a published
// embed from being abused as an open query proxy over the whole workspace,
// every query is authorized against the set of tables actually used by the
// dashboard's own widgets.
// ============================================================

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyEmbedToken } from '@/lib/insights/embed-token';
import { executeWidgetQuery, executeKpiQuery, getDistinctValues, executeMultiTableQuery } from '@/lib/insights/query-builder';

export async function POST(request: Request) {
  var body = await request.json();
  var dashboardId = body.dashboardId;
  var token = body.token;

  if (!dashboardId || !verifyEmbedToken(token, dashboardId)) {
    return NextResponse.json({ error: 'Invalid or expired embed token' }, { status: 403 });
  }

  // Load the dashboard + widgets; only published dashboards are embeddable.
  var dashboard = await db.dashboard.findUnique({
    where: { id: dashboardId, status: 'published' },
    include: { widgets: { select: { type: true, dataConfig: true } } },
  });
  if (!dashboard) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });

  // Build the allow-list of tables this dashboard actually references.
  var allowed = new Set<string>();
  for (var i = 0; i < dashboard.widgets.length; i++) {
    var dc = (dashboard.widgets[i].dataConfig || {}) as any;
    if (dc.tableId) allowed.add(dc.tableId);
    if (dc.primaryTableId) allowed.add(dc.primaryTableId);
    if (dc.joinTableId) allowed.add(dc.joinTableId);
  }

  function tableAllowed(id: string | undefined): boolean { return !!id && allowed.has(id); }

  try {
    if (body.type === 'kpi') {
      if (!tableAllowed(body.tableId)) return NextResponse.json({ error: 'Table not permitted for this embed' }, { status: 403 });
      var kpiResult = await executeKpiQuery({
        tableId: body.tableId, columnId: body.columnId, function: body.function || 'count',
        filters: body.filters, compareFilters: body.compareFilters, sparkline: body.sparkline,
      });
      return NextResponse.json(kpiResult);
    }

    if (body.type === 'distinct') {
      if (!tableAllowed(body.tableId)) return NextResponse.json({ error: 'Table not permitted for this embed' }, { status: 403 });
      return NextResponse.json({ values: await getDistinctValues(body.tableId, body.columnId) });
    }

    if (body.type === 'multi_table') {
      if (!tableAllowed(body.primaryTableId) || !tableAllowed(body.joinTableId)) return NextResponse.json({ error: 'Table not permitted for this embed' }, { status: 403 });
      var mt = await executeMultiTableQuery({
        primaryTableId: body.primaryTableId, joinTableId: body.joinTableId, joinColumnId: body.joinColumnId,
        groupBy: body.groupBy, aggregations: body.aggregations || [], filters: body.filters, limit: body.limit,
      });
      return NextResponse.json(mt);
    }

    // Default widget query
    if (!tableAllowed(body.tableId)) return NextResponse.json({ error: 'Table not permitted for this embed' }, { status: 403 });
    var result = await executeWidgetQuery({
      tableId: body.tableId,
      groupBy: body.groupBy,
      dateGrouping: body.dateGrouping || undefined,
      series: body.series || undefined,
      seriesDateGrouping: body.seriesDateGrouping || undefined,
      seriesLimit: body.seriesLimit || undefined,
      aggregations: body.aggregations || [],
      filters: body.filters,
      orderBy: body.orderBy,
      limit: body.limit,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Insights Embed Query Error]', error);
    return NextResponse.json({ error: error.message || 'Query failed' }, { status: 500 });
  }
}
