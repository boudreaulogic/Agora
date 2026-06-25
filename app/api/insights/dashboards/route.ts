import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET — list dashboards the user can see
export async function GET() {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var dashboards = await db.dashboard.findMany({
    include: {
      widgets: { select: { id: true, type: true, name: true } },
      _count: { select: { widgets: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(dashboards);
}

// POST — create a new dashboard
export async function POST(request: Request) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var body = await request.json();
  var { name, description, icon, workspaceId, oikosId } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  var baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') || 'dashboard';
  var slug = baseSlug;
  var counter = 1;
  while (await db.dashboard.findUnique({ where: { slug: slug } })) {
    slug = baseSlug + '_' + counter++;
  }

  // If no oikos specified, auto-create one for the workspace
  var finalOikosId = oikosId || null;
  if (!finalOikosId && workspaceId) {
    var existing = await db.oikos.findFirst({ where: { workspaceId: workspaceId } });
    if (existing) {
      finalOikosId = existing.id;
    } else {
      var workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
      var oikosSlug = 'oikos_' + workspaceId.slice(-8);
      var newOikos = await db.oikos.create({
        data: {
          name: (workspace?.name || 'Default') + ' Data Model',
          slug: oikosSlug,
          workspaceId: workspaceId,
          createdById: session.user.id,
        },
      });
      finalOikosId = newOikos.id;
    }
  }

  // If still no oikos, create a default one
  if (!finalOikosId) {
    var defaultOikos = await db.oikos.findFirst({ where: { slug: 'default' } });
    if (!defaultOikos) {
      defaultOikos = await db.oikos.create({
        data: {
          name: 'Default Data Model',
          slug: 'default',
          createdById: session.user.id,
        },
      });
    }
    finalOikosId = defaultOikos.id;
  }

  var dashboard = await db.dashboard.create({
    data: {
      name: name.trim(),
      slug: slug,
      description: description || null,
      icon: icon || '📊',
      oikosId: finalOikosId,
      workspaceId: workspaceId || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(dashboard);
}