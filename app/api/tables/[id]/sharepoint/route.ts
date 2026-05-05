import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { encrypt, decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET — fetch sync config for a table
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  var { id } = await params;
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var setting = await db.systemSetting.findUnique({ where: { key: 'sp_sync_' + id } });
  if (!setting) return NextResponse.json({ config: null });

  try {
    var config = JSON.parse(setting.encrypted ? decrypt(setting.value) : setting.value);
    return NextResponse.json({ config: config });
  } catch {
    return NextResponse.json({ config: null });
  }
}

// PUT — save sync config for a table
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  var { id } = await params;
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var body = await request.json();
  var configJson = JSON.stringify(body.config);

  await db.systemSetting.upsert({
    where: { key: 'sp_sync_' + id },
    update: { value: configJson, encrypted: false },
    create: { key: 'sp_sync_' + id, value: configJson, encrypted: false },
  });

  return NextResponse.json({ success: true });
}

// POST — trigger manual sync for a table
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  var { id } = await params;
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Load sync config
  var setting = await db.systemSetting.findUnique({ where: { key: 'sp_sync_' + id } });
  if (!setting) return NextResponse.json({ error: 'No SharePoint sync configured for this table' }, { status: 400 });

  var config: any;
  try {
    config = JSON.parse(setting.encrypted ? decrypt(setting.value) : setting.value);
  } catch {
    return NextResponse.json({ error: 'Invalid sync config' }, { status: 400 });
  }

  if (!config.enabled || !config.siteId || !config.listId || !config.fieldMapping) {
    return NextResponse.json({ error: 'Sync not fully configured' }, { status: 400 });
  }

  // Get all rows
  var rows = await db.agoraRow.findMany({
    where: { tableId: id },
    orderBy: { position: 'asc' },
  });

  // Get columns for type info
  var columns = await db.agoraColumn.findMany({
    where: { tableId: id },
    select: { id: true, name: true, type: true },
  });

  var { syncRowToSharePoint } = await import('@/lib/sharepoint');
  var results = { synced: 0, errors: 0, errorDetails: [] as string[] };

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowData = row.data as Record<string, any>;
    var syncResult = await syncRowToSharePoint(
      {
        siteId: config.siteId,
        listId: config.listId,
        fieldMapping: config.fieldMapping,
        uniqueKeyColumnId: config.uniqueKeyColumnId,
        uniqueKeySpColumn: config.uniqueKeySpColumn,
      },
      rowData,
      columns as any[],
      config.uniqueKeyColumnId ? 'upsert' : 'create'
    );

    if (syncResult.success) {
      results.synced++;
    } else {
      results.errors++;
      results.errorDetails.push('Row ' + (i + 1) + ': ' + (syncResult.error || 'Unknown'));
    }
  }

  // Update last sync timestamp
  config.lastSyncAt = new Date().toISOString();
  config.lastSyncStatus = results.errors > 0 ? 'partial' : 'success';
  config.lastSyncStats = { synced: results.synced, errors: results.errors };
  await db.systemSetting.upsert({
    where: { key: 'sp_sync_' + id },
    update: { value: JSON.stringify(config) },
    create: { key: 'sp_sync_' + id, value: JSON.stringify(config), encrypted: false },
  });

  return NextResponse.json(results);
}