import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';
import { wsBroadcast } from '@/lib/wsBroadcast';
import { authenticateRequest } from '@/lib/authenticateRequest';

export const dynamic = 'force-dynamic';

// Decrypt sensitive fields before use
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

// POST /api/tables/[id]/connectors/sync — trigger a sync for a connector
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  var authResult = await authenticateRequest(request, params.id, 'write');
  if (authResult instanceof NextResponse) return authResult;

  if (authResult.source === 'session') {
    var permission = await getTablePermission(authResult.userId, params.id);
    if (!permission || permission === 'viewer') {
      return NextResponse.json({ error: 'Editor access required' }, { status: 403 });
    }
  }

  var body = await request.json();
  var connectorId = body.connectorId;
  if (!connectorId) return NextResponse.json({ error: 'connectorId is required' }, { status: 400 });

  var connector = await db.dataConnector.findUnique({ where: { id: connectorId } });
  if (!connector || connector.tableId !== params.id) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
  }

  if (!connector.isActive) {
    return NextResponse.json({ error: 'Connector is inactive' }, { status: 400 });
  }

  await db.dataConnector.update({
    where: { id: connectorId },
    data: { lastSyncStatus: 'syncing' },
  });

  try {
    // Decrypt credentials before use
    var config = await decryptConfig(connector.config as any);
    var fieldMapping = connector.fieldMapping as Record<string, string>;

    if (connector.type === 'rest_api') {
      var result = await syncRestApi(params.id, connector.id, config, fieldMapping, authResult.userId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported connector type: ' + connector.type }, { status: 400 });
  } catch (error: any) {
    console.error('Connector sync error:', error);
    await db.dataConnector.update({
      where: { id: connectorId },
      data: {
        lastSyncStatus: 'error',
        lastSyncError: process.env.NODE_ENV === 'production' ? 'Sync failed' : (error.message || 'Sync failed'),
      },
    });
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

// ============================================================================
// REST API SYNC ENGINE (with SSRF protection)
// ============================================================================
async function syncRestApi(
  tableId: string,
  connectorId: string,
  config: any,
  fieldMapping: Record<string, string>,
  userId: string
) {
  var url = config.url;
  if (!url) throw new Error('No URL configured');

  // Build request headers
  var headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (config.headers) {
    Object.assign(headers, config.headers);
  }

  // Add auth
  if (config.authType === 'bearer' && config.authValue) {
    headers['Authorization'] = 'Bearer ' + config.authValue;
  } else if (config.authType === 'api_key' && config.authValue) {
    var authHeader = config.authHeader || 'X-API-Key';
    headers[authHeader] = config.authValue;
  } else if (config.authType === 'basic' && config.username && config.password) {
    var encoded = Buffer.from(config.username + ':' + config.password).toString('base64');
    headers['Authorization'] = 'Basic ' + encoded;
  }

  // Use SSRF-protected fetch instead of raw fetch
  var { safeFetch } = await import('@/lib/ssrfProtection');
  var response = await safeFetch(url, {
    method: config.method || 'GET',
    headers: headers,
    body: (config.body && (config.method || 'GET') !== 'GET')
      ? (typeof config.body === 'string' ? config.body : JSON.stringify(config.body))
      : undefined,
    timeoutMs: 30000,
  });

  if (!response.ok) {
    throw new Error('API returned ' + response.status + ': ' + response.statusText);
  }

  var responseData = await response.json();

  // Navigate to the data array using responseDataPath
  var records = responseData;
  if (config.responseDataPath) {
    var pathParts = config.responseDataPath.split('.');
    for (var p = 0; p < pathParts.length; p++) {
      if (records && typeof records === 'object') {
        records = records[pathParts[p]];
      } else {
        throw new Error('Could not find data at path: ' + config.responseDataPath);
      }
    }
  }

  if (!Array.isArray(records)) {
    if (records && typeof records === 'object') {
      records = [records];
    } else {
      throw new Error('API response is not an array. Set responseDataPath to point to the array in the response.');
    }
  }

  // Get existing rows for upsert matching
  var existingRows = await db.agoraRow.findMany({
    where: { tableId: tableId },
    orderBy: { position: 'asc' },
    select: { id: true, data: true, position: true },
  });

  var uniqueKeyField = config.uniqueKeyField || null;
  var uniqueKeyColumn = uniqueKeyField ? fieldMapping[uniqueKeyField] : null;

  var existingByKey: Record<string, any> = {};
  if (uniqueKeyColumn) {
    existingRows.forEach(function(row) {
      var data = row.data as any;
      var keyVal = data[uniqueKeyColumn!];
      if (keyVal !== undefined && keyVal !== null && String(keyVal).trim() !== '') {
        existingByKey[String(keyVal)] = row;
      }
    });
  }

  var stats = { rowsCreated: 0, rowsUpdated: 0, rowsSkipped: 0 };
  var maxPosition = existingRows.length > 0 ? Math.max.apply(null, existingRows.map(function(r) { return r.position; })) : -1;

  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    if (!record || typeof record !== 'object') continue;

    var rowData: Record<string, any> = {};
    var mappingKeys = Object.keys(fieldMapping);
    for (var m = 0; m < mappingKeys.length; m++) {
      var apiField = mappingKeys[m];
      var columnId = fieldMapping[apiField];
      var value = getNestedValue(record, apiField);
      if (value !== undefined && value !== null) {
        rowData[columnId] = String(value);
      }
    }

    if (Object.keys(rowData).length === 0) {
      stats.rowsSkipped++;
      continue;
    }

    if (uniqueKeyColumn && uniqueKeyField) {
      var recordKey = getNestedValue(record, uniqueKeyField);
      if (recordKey !== undefined && recordKey !== null) {
        var existingRow = existingByKey[String(recordKey)];
        if (existingRow) {
          var currentData = existingRow.data as any;
          var changed = false;
          for (var col in rowData) {
            if (String(currentData[col] || '') !== String(rowData[col] || '')) {
              changed = true;
              break;
            }
          }

          if (changed) {
            var mergedData = Object.assign({}, currentData, rowData);
            await db.agoraRow.update({
              where: { id: existingRow.id },
              data: { data: mergedData },
            });

            for (var broadcastCol in rowData) {
              if (String(currentData[broadcastCol] || '') !== String(rowData[broadcastCol] || '')) {
                wsBroadcast(tableId, { type: 'cell-update', rowId: existingRow.id, columnId: broadcastCol, value: rowData[broadcastCol] });
              }
            }
            stats.rowsUpdated++;
          } else {
            stats.rowsSkipped++;
          }
          continue;
        }
      }
    }

    maxPosition++;
    var newRow = await db.agoraRow.create({
      data: {
        tableId: tableId,
        data: rowData,
        position: maxPosition,
        createdById: userId,
      },
    });

    wsBroadcast(tableId, { type: 'row-inserted', row: Object.assign({}, newRow, { data: rowData }) });
    stats.rowsCreated++;
  }

  await db.dataConnector.update({
    where: { id: connectorId },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: 'success',
      lastSyncError: null,
      lastSyncStats: stats,
    },
  });

  return {
    success: true,
    stats: stats,
    message: stats.rowsCreated + ' created, ' + stats.rowsUpdated + ' updated, ' + stats.rowsSkipped + ' skipped',
  };
}

function getNestedValue(obj: any, path: string): any {
  var parts = path.split('.');
  var current = obj;
  for (var i = 0; i < parts.length; i++) {
    if (current === null || current === undefined) return undefined;
    current = current[parts[i]];
  }
  return current;
}