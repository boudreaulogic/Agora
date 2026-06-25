// app/api/connectors/college-scorecard/sync/route.ts
// Manual sync trigger. Looks up the connector, scopes auth to its table,
// decrypts the API key, hands plaintext config to the engine.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { getTablePermission } from '@/lib/tablePermissions';
import { runScorecardSync, ScorecardConfig } from '@/lib/connectors/college-scorecard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  var body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  var connectorId = typeof body.connectorId === 'string' ? body.connectorId : '';
  if (!connectorId) {
    return NextResponse.json({ error: 'connectorId is required' }, { status: 400 });
  }

  // Look up connector first so we know which table to scope auth to.
  var connector = await db.dataConnector.findUnique({
    where: { id: connectorId },
  });
  if (!connector || !connector.tableId) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
  }
  if (connector.type !== 'college_scorecard') {
    return NextResponse.json({ error: 'Wrong connector type' }, { status: 400 });
  }

  // Auth scoped to the connector's table.
  var authResult = await authenticateRequest(req, connector.tableId, 'write');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  // Browser session also needs editor permission on the table.
  if (authResult.source === 'session') {
    var permission = await getTablePermission(authResult.userId, connector.tableId);
    if (!permission || permission === 'viewer') {
      return NextResponse.json({ error: 'Editor access required' }, { status: 403 });
    }
  }

  // Decrypt the API key for the engine.
  var encryptionMod = await import('@/lib/encryption');
  var storedConfig: any = connector.config || {};
  var decryptedConfig: ScorecardConfig = {
    apiKey: storedConfig.__apiKeyEncrypted
      ? encryptionMod.decrypt(storedConfig.apiKey)
      : (storedConfig.apiKey || ''),
    filters: storedConfig.filters || {},
  };

  try {
    var stats = await runScorecardSync(connectorId, authResult.userId, decryptedConfig);
    return NextResponse.json({ success: true, stats: stats });
  } catch (err: any) {
    console.error('College Scorecard sync error:', err);
    await db.dataConnector.update({
      where: { id: connectorId },
      data: {
        lastSyncStatus: 'error',
        lastSyncError: process.env.NODE_ENV === 'production'
          ? 'Sync failed'
          : (err && err.message ? err.message : 'Sync failed'),
      },
    });
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}