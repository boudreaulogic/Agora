// app/api/connectors/college-scorecard/setup/route.ts
// Provisions a College Scorecard connector: creates the AgoraTable + columns,
// captures the generated column IDs into the connector's fieldMapping, and
// stores the API key in encrypted form.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth as getSession } from '@/lib/auth';
import { FIELD_MAP, ScorecardConfig } from '@/lib/connectors/college-scorecard';

export const dynamic = 'force-dynamic';

function slugify(input: string): string {
  var base = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!base) {
    base = 'college-scorecard';
  }
  // Add a short random suffix so repeated setups don't collide on the unique slug.
  var suffix = Math.random().toString(36).slice(2, 8);
  return base + '-' + suffix;
}

export async function POST(req: NextRequest) {
  var session = await getSession();
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  var userId = session.user.id;

  var body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  var apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  // workspaceId is optional — empty/missing means create a personal table (no workspace).
  var workspaceId = typeof body.workspaceId === 'string' && body.workspaceId.trim() ? body.workspaceId.trim() : null;
  var tableName = typeof body.tableName === 'string' && body.tableName.trim()
    ? body.tableName.trim()
    : 'College Scorecard';
  var stateFilter = typeof body.state === 'string' && body.state.trim()
    ? body.state.trim().toUpperCase()
    : undefined;
  var tribalOnly = body.tribalOnly === true;

  if (!apiKey) {
    return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
  }

  // If a workspace was specified, verify the user has access to it.
  // Otherwise the table will be personal (workspaceId stays null).
  if (workspaceId) {
    var workspace = await db.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { createdById: userId },
          { members: { some: { userId: userId } } },
        ],
      },
    });
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 404 });
    }
  }

  // Create the destination table. workspaceId is null for personal tables.
  var table = await db.agoraTable.create({
    data: {
      name: tableName,
      slug: slugify(tableName),
      workspaceId: workspaceId, // null = personal table, appears under "My Tables"
      createdById: userId,
    },
  });

  // Create columns in FIELD_MAP order. Capture the generated IDs to build
  // the connector's fieldMapping (source path → column ID).
  var fieldMapping: Record<string, string> = {};

  for (var i = 0; i < FIELD_MAP.length; i++) {
    var f = FIELD_MAP[i];

    var settings: any = {};
    if (f.type === 'select' && f.selectOptions) {
      settings.options = f.selectOptions.map(function (label) {
        return { label: label, value: label };
      });
    }
    if (f.type === 'currency') {
      settings.currency = 'USD';
    }
    if (f.type === 'percent') {
      settings.precision = 2;
    }

    var col = await db.agoraColumn.create({
      data: {
        tableId: table.id,
        name: f.column,
        type: f.type,
        position: i,
        settings: settings,
      },
    });

    fieldMapping[f.source] = col.id;
  }

  // Encrypt the API key before storing.
  var encryptionMod = await import('@/lib/encryption');
  var encryptedApiKey = encryptionMod.encrypt(apiKey);

  var config: any = {
    apiKey: encryptedApiKey,
    __apiKeyEncrypted: true,
    filters: {
      state: stateFilter,
      tribalOnly: tribalOnly,
    },
  };

  var connector = await db.dataConnector.create({
    data: {
      tableId: table.id,
      name: tableName,
      type: 'college_scorecard',
      config: config,
      fieldMapping: fieldMapping,
      syncMode: 'manual',
      createdById: userId,
    },
  });

  return NextResponse.json({
    connectorId: connector.id,
    tableId: table.id,
    columnCount: FIELD_MAP.length,
  });
}