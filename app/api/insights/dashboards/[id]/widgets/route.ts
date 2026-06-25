import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST — create a widget on a dashboard
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var body = await request.json();

  var maxOrder = await db.widget.findFirst({
    where: { dashboardId: params.id },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  var widget = await db.widget.create({
    data: {
      dashboardId: params.id,
      name: body.name || 'New Widget',
      type: body.type || 'bar',
      dataConfig: body.dataConfig || {},
      vizConfig: body.vizConfig || {},
      layoutX: body.layoutX ?? 0,
      layoutY: body.layoutY ?? 0,
      layoutW: body.layoutW ?? 6,
      layoutH: body.layoutH ?? 4,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json(widget);
}