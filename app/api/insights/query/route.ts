import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { executeWidgetQuery, executeKpiQuery, getDistinctValues } from '@/lib/insights/query-builder';

// POST — execute a query for a widget
export async function POST(request: Request) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var body = await request.json();

  try {
    if (body.type === 'kpi') {
      var kpiResult = await executeKpiQuery({
        tableId: body.tableId,
        columnId: body.columnId,
        function: body.function || 'count',
        filters: body.filters,
        compareFilters: body.compareFilters,
        sparkline: body.sparkline,
      });
      return NextResponse.json(kpiResult);
    }

    if (body.type === 'distinct') {
      var values = await getDistinctValues(body.tableId, body.columnId);
      return NextResponse.json({ values: values });
    }
	
	if (body.type === 'multi_table') {
      var { executeMultiTableQuery } = await import('@/lib/insights/query-builder');
      var mtResult = await executeMultiTableQuery({
        primaryTableId: body.primaryTableId,
        joinTableId: body.joinTableId,
        joinColumnId: body.joinColumnId,
        groupBy: body.groupBy,
        aggregations: body.aggregations || [],
        filters: body.filters,
        limit: body.limit,
      });
      return NextResponse.json(mtResult);
    }

    // Default: widget query (with optional pivot via `series`)
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
    console.error('[Insights Query Error]', error);
    return NextResponse.json({ error: error.message || 'Query failed' }, { status: 500 });
  }
}