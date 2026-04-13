import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export const dynamic = 'force-dynamic';

// GET /api/tables/[id]/connectors — list connectors for a table
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var permission = await getTablePermission(session.user.id, params.id);
  if (!permission) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  var connectors = await db.dataConnector.findMany({
    where: { tableId: params.id },
    orderBy: { createdAt: 'asc' },
  });

  // Strip sensitive auth values from config before sending to client
  var safeConnectors = connectors.map(function(c: any) {
    var config = c.config as any;
    var safeConfig = Object.assign({}, config);
    if (safeConfig.authValue) safeConfig.authValue = '••••••••';
    if (safeConfig.password) safeConfig.password = '••••••••';
    return Object.assign({}, c, { config: safeConfig });
  });

  return NextResponse.json({ connectors: safeConnectors });
}

// POST /api/tables/[id]/connectors — create a new connector
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var permission = await getTablePermission(session.user.id, params.id);
  if (permission !== 'owner' && permission !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  var body = await request.json();
  var { name, type, config, fieldMapping, syncMode, syncIntervalMin } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Type is required' }, { status: 400 });

  var connector = await db.dataConnector.create({
    data: {
      tableId: params.id,
      name: name.trim(),
      type: type || 'rest_api',
      config: config || {},
      fieldMapping: fieldMapping || {},
      syncMode: syncMode || 'manual',
      syncIntervalMin: syncIntervalMin || 60,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ connector: connector });
}

// PATCH /api/tables/[id]/connectors — update a connector
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var permission = await getTablePermission(session.user.id, params.id);
  if (permission !== 'owner' && permission !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  var body = await request.json();
  var { connectorId, name, config, fieldMapping, syncMode, syncIntervalMin, isActive } = body;

  if (!connectorId) return NextResponse.json({ error: 'connectorId is required' }, { status: 400 });

  var existing = await db.dataConnector.findUnique({ where: { id: connectorId } });
  if (!existing || existing.tableId !== params.id) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
  }

  // If config has masked authValue, keep the existing one
  if (config && config.authValue === '••••••••') {
    var existingConfig = existing.config as any;
    config.authValue = existingConfig.authValue;
  }
  if (config && config.password === '••••••••') {
    var existingConfig2 = existing.config as any;
    config.password = existingConfig2.password;
  }

  var updated = await db.dataConnector.update({
    where: { id: connectorId },
    data: {
      ...(name !== undefined && { name: name }),
      ...(config !== undefined && { config: config }),
      ...(fieldMapping !== undefined && { fieldMapping: fieldMapping }),
      ...(syncMode !== undefined && { syncMode: syncMode }),
      ...(syncIntervalMin !== undefined && { syncIntervalMin: syncIntervalMin }),
      ...(isActive !== undefined && { isActive: isActive }),
    },
  });

  return NextResponse.json({ connector: updated });
}

// DELETE /api/tables/[id]/connectors — delete a connector
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var permission = await getTablePermission(session.user.id, params.id);
  if (permission !== 'owner' && permission !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  var body = await request.json();
  var connectorId = body.connectorId;
  if (!connectorId) return NextResponse.json({ error: 'connectorId is required' }, { status: 400 });

  var existing = await db.dataConnector.findUnique({ where: { id: connectorId } });
  if (!existing || existing.tableId !== params.id) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
  }

  await db.dataConnector.delete({ where: { id: connectorId } });
  return NextResponse.json({ success: true });
}