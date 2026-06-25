import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST — migrate old AgoraCharts to Insights dashboards
export async function POST(request: Request) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Get all old charts
    var charts = await db.agoraChart.findMany({
      include: { table: { select: { id: true, name: true } } },
    });

    if (charts.length === 0) {
      return NextResponse.json({ message: 'No charts to migrate', migrated: 0 });
    }

    // Group charts by table
    var chartsByTable = new Map<string, any[]>();
    for (var i = 0; i < charts.length; i++) {
      var tableId = charts[i].tableId;
      if (!chartsByTable.has(tableId)) chartsByTable.set(tableId, []);
      chartsByTable.get(tableId)!.push(charts[i]);
    }

    var migrated = 0;

    // Create one dashboard per table that has charts
    for (var entry of chartsByTable.entries()) {
      var tblId = entry[0];
      var tblCharts = entry[1];
      var tableName = tblCharts[0]?.table?.name || 'Table';

      // Check if already migrated
      var existingSlug = 'migrated_' + tblId.slice(-8);
      var existing = await db.dashboard.findUnique({ where: { slug: existingSlug } });
      if (existing) continue;

      // Create default oikos
      var oikos = await db.oikos.findFirst({ where: { slug: 'default' } });
      if (!oikos) {
        oikos = await db.oikos.create({
          data: { name: 'Default Data Model', slug: 'default', createdById: session.user.id },
        });
      }

      var dashboard = await db.dashboard.create({
        data: {
          name: tableName + ' Charts (Migrated)',
          slug: existingSlug,
          description: 'Auto-migrated from legacy Charts feature',
          icon: '📊',
          oikosId: oikos.id,
          status: 'draft',
          createdById: session.user.id,
        },
      });

      // Convert each chart to a widget
      for (var ci = 0; ci < tblCharts.length; ci++) {
        var chart = tblCharts[ci];
        var config = chart.config as any || {};

        var widgetType = 'bar';
        if (chart.type === 'line') widgetType = 'line';
        else if (chart.type === 'pie') widgetType = 'pie';
        else if (chart.type === 'donut' || chart.type === 'doughnut') widgetType = 'donut';
        else if (chart.type === 'area') widgetType = 'area';
        else if (chart.type === 'scatter') widgetType = 'scatter';

        await db.widget.create({
          data: {
            dashboardId: dashboard.id,
            name: chart.name,
            type: widgetType,
            dataConfig: {
              tableId: chart.tableId,
              groupBy: config.groupByColumnId || config.xAxisColumnId || '',
              columnId: config.valueColumnId || config.yAxisColumnId || '*',
              function: config.aggregation || 'count',
            },
            vizConfig: {},
            layoutX: 0,
            layoutY: ci * 4,
            layoutW: 6,
            layoutH: 4,
            sortOrder: ci,
          },
        });
        migrated++;
      }
    }

    return NextResponse.json({ success: true, migrated: migrated, dashboards: chartsByTable.size });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Migration failed' }, { status: 500 });
  }
}