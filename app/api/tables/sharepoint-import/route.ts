import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST — create a new Agora table from a SharePoint list
export async function POST(request: Request) {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  var body = await request.json();
  var { name, description, icon, workspaceId, connectionId, columns } = body;

  if (!name || !connectionId || !columns || columns.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Authorize against the admin-curated catalog and derive the site/list
  // server-side — a user can only import a list they've been granted, and can't
  // forge an arbitrary siteId/listId from the client.
  var { canAccessConnection } = await import('@/lib/sharepoint-access');
  if (!(await canAccessConnection((session.user as any).id, connectionId))) {
    return NextResponse.json({ error: 'You do not have access to this SharePoint list' }, { status: 403 });
  }
  var connection = await db.sharePointListConnection.findUnique({ where: { id: connectionId } });
  if (!connection) {
    return NextResponse.json({ error: 'SharePoint connection not found' }, { status: 404 });
  }
  var siteId = connection.siteId;
  var listId = connection.listId;
  var listName = connection.listName;

  // Generate unique slug
  var baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
  var slug = baseSlug;
  var counter = 1;
  while (await db.agoraTable.findUnique({ where: { slug: slug } })) {
    slug = baseSlug + '_' + counter;
    counter++;
  }

  // Build field mapping: agoraColumnId → spColumnName (we'll fill in after creating columns)
  var fieldMapping: Record<string, string> = {};

  // Create the table
  var table = await db.agoraTable.create({
    data: {
      name: name,
      slug: slug,
      description: description || 'Synced from SharePoint: ' + listName,
      icon: icon || '📋',
      createdById: (session.user as any).id,
      workspaceId: workspaceId || null,
      isSharePointBacked: true,
      sharePointConfig: {
        siteId: siteId,
        listId: listId,
        listName: listName,
        syncDirection: 'bidirectional',
        autoSyncEnabled: true,
        lastPullAt: null,
        lastPushAt: null,
        lifecycleRules: {
          archiveAfterApproval: false,
          archiveAfterDays: null,
          attachPdfOnApproval: false,
        },
      },
    },
  });

  // Create columns matching SP list columns
  for (var i = 0; i < columns.length; i++) {
    var spCol = columns[i];
    var agoraType = mapSpTypeToAgora(spCol.type);

    var columnSettings: any = {};

    // Build settings based on SP column type
    if (spCol.type === 'choice' && spCol.choices) {
      var colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];
      columnSettings.options = spCol.choices.map(function(c: string, ci: number) {
        return { value: c, label: c, color: colors[ci % colors.length] };
      });
    }

    if (spCol.type === 'dateTime') {
      columnSettings.spDateTimeFormat = spCol.dateTimeFormat || 'dateTime';
    }

    if (spCol.type === 'number') {
      columnSettings.spDecimalPlaces = spCol.decimalPlaces;
    }

    if (spCol.type === 'currency') {
      columnSettings.spCurrencyLocale = spCol.currencyLocale;
    }

    var col = await db.agoraColumn.create({
      data: {
        tableId: table.id,
        name: spCol.displayName,
        type: agoraType,
        position: i,
        settings: columnSettings,
        sharePointConfig: {
          spColumnName: spCol.name,
          spColumnType: spCol.type,
          spDisplayName: spCol.displayName,
          spChoices: spCol.choices || null,
          spDateTimeFormat: spCol.dateTimeFormat || null,
          spRequired: spCol.required || false,
        },
      },
    });

    fieldMapping[col.id] = spCol.name;
  }

  // Add the system Attachments column at the end. This matches the default
  // column set in the "Create Table" flow (app/tables/new/page.tsx) so SP-backed
  // tables behave consistently with native Agora tables. Files attach locally in
  // Agora — they do NOT push to SharePoint automatically.
  await db.agoraColumn.create({
    data: {
      tableId: table.id,
      name: 'Attachments',
      type: 'attachment',
      position: columns.length,
      settings: { isSystem: true },
    },
  });

  // Save the field mapping as sync config in SystemSetting (reuse existing pattern)
  var { encrypt } = await import('@/lib/encryption');
  var syncConfig = {
    siteId: siteId,
    listId: listId,
    listName: listName,
    fieldMapping: fieldMapping,
    enabled: true,
    lastSyncAt: null,
    lastSyncStatus: null,
  };

  await db.systemSetting.upsert({
    where: { key: 'sp_sync_' + table.id },
    update: { value: JSON.stringify(syncConfig), encrypted: false },
    create: { key: 'sp_sync_' + table.id, value: JSON.stringify(syncConfig), encrypted: false },
  });

  // Create default view
  await db.agoraView.create({
    data: {
      tableId: table.id,
      name: 'All Items',
      type: 'grid',
      isDefault: true,
      config: {},
      createdById: (session.user as any).id,
    },
  });

  // Log the creation
  await db.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: 'TABLE_CREATED',
      metadata: {
        tableId: table.id,
        tableName: table.name,
        source: 'sharepoint',
        listName: listName,
        listId: listId,
        columnsImported: columns.length,
      },
    },
  });

  return NextResponse.json({ success: true, tableId: table.id });
}

function mapSpTypeToAgora(spType: string): string {
  switch (spType) {
    case 'text': return 'text';
    case 'note': return 'long_text';
    case 'number': return 'number';
    case 'currency': return 'currency';
    case 'dateTime': return 'datetime';
    case 'boolean': return 'checkbox';
    case 'choice': return 'select';
    case 'multichoice': return 'multi_select';
    case 'personOrGroup': return 'text';
    case 'url': return 'url';
    case 'calculated': return 'text';
    default: return 'text';
  }
}