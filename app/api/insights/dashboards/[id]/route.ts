import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET — get a single dashboard with all widgets
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var dashboard = await db.dashboard.findUnique({
    where: { id: params.id },
    include: {
      widgets: {
        include: { filters: true },
        orderBy: { sortOrder: 'asc' },
      },
      filters: { orderBy: { sortOrder: 'asc' } },
      parameters: { orderBy: { sortOrder: 'asc' } },
      permissions: true,
      oikos: {
        include: {
          tables: true,
          relationships: true,
          measures: true,
        },
      },
    },
  });

  if (!dashboard) {
    return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
  }

  return NextResponse.json(dashboard);
}

// PATCH — update dashboard
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var body = await request.json();
  var updates: any = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.icon !== undefined) updates.icon = body.icon;
  if (body.visibility !== undefined) updates.visibility = body.visibility;
  if (body.status !== undefined) updates.status = body.status;
  if (body.workspaceId !== undefined) updates.workspaceId = body.workspaceId;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  var dashboard = await db.dashboard.update({
    where: { id: params.id },
    data: updates,
  });

  return NextResponse.json(dashboard);
}

// DELETE — delete dashboard
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await db.dashboard.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}