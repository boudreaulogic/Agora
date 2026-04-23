import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export const dynamic = 'force-dynamic';

// Encrypt sensitive fields before storing
async function encryptConfig(config: any): Promise<any> {
  if (!config) return config;
  var { encrypt } = await import('@/lib/encryption');
  var encrypted = Object.assign({}, config);
  if (encrypted.authValue && encrypted.authValue !== '••••••••') {
    encrypted.authValue = encrypt(encrypted.authValue);
    encrypted.__authValueEncrypted = true;
  }
  if (encrypted.password && encrypted.password !== '••••••••') {
    encrypted.password = encrypt(encrypted.password);
    encrypted.__passwordEncrypted = true;
  }
  return encrypted;
}

// Decrypt sensitive fields for use (NOT for sending to client)
async function decryptConfig(config: any): Promise<any> {
  if (!config) return config;
  var { decrypt } = await import('@/lib/encryption');
  var decrypted = Object.assign({}, config);
  if (decrypted.__authValueEncrypted && decrypted.authValue) {
    try { decrypted.authValue = decrypt(decrypted.authValue); } catch {}
  }
  if (decrypted.__passwordEncrypted && decrypted.password) {
    try { decrypted.password = decrypt(decrypted.password); } catch {}
  }
  return decrypted;
}

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
    // Remove encryption flags from client response
    delete safeConfig.__authValueEncrypted;
    delete safeConfig.__passwordEncrypted;
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

  // Encrypt credentials before storing
  var encryptedConfig = await encryptConfig(config || {});

  var connector = await db.dataConnector.create({
    data: {
      tableId: params.id,
      name: name.trim(),
      type: type || 'rest_api',
      config: encryptedConfig,
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

  // If config has masked values, keep the existing encrypted ones
  if (config) {
    var existingConfig = existing.config as any;
    if (config.authValue === '••••••••') {
      config.authValue = existingConfig.authValue;
      config.__authValueEncrypted = existingConfig.__authValueEncrypted;
    } else if (config.authValue) {
      // New value — encrypt it
      var { encrypt } = await import('@/lib/encryption');
      config.authValue = encrypt(config.authValue);
      config.__authValueEncrypted = true;
    }
    if (config.password === '••••••••') {
      config.password = existingConfig.password;
      config.__passwordEncrypted = existingConfig.__passwordEncrypted;
    } else if (config.password) {
      // New value — encrypt it
      var { encrypt: encrypt2 } = await import('@/lib/encryption');
      config.password = encrypt2(config.password);
      config.__passwordEncrypted = true;
    }
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
