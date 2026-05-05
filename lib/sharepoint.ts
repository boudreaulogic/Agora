
// Microsoft Graph API integration for SharePoint List sync
// Uses client credentials (app-only) auth flow

import { db } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

var TOKEN_CACHE: { token: string; expires: number } | null = null;

// ============================================================================
// AUTH — Get access token via client credentials flow
// ============================================================================

export async function getSharePointConfig(): Promise<{
  clientId: string;
  clientSecret: string;
  tenantId: string;
  siteUrl: string;
} | null> {
  var keys = ['sp_client_id', 'sp_client_secret', 'sp_tenant_id', 'sp_site_url'];
  var settings = await db.systemSetting.findMany({ where: { key: { in: keys } } });
  var map: Record<string, string> = {};
  for (var i = 0; i < settings.length; i++) {
    var s = settings[i];
    map[s.key] = s.encrypted ? decrypt(s.value) : s.value;
  }
  if (!map.sp_client_id || !map.sp_client_secret || !map.sp_tenant_id) return null;
  return {
    clientId: map.sp_client_id,
    clientSecret: map.sp_client_secret,
    tenantId: map.sp_tenant_id,
    siteUrl: map.sp_site_url || '',
  };
}

export async function getAccessToken(): Promise<string> {
  // Check cache
  if (TOKEN_CACHE && TOKEN_CACHE.expires > Date.now() + 60000) {
    return TOKEN_CACHE.token;
  }

  var config = await getSharePointConfig();
  if (!config) throw new Error('SharePoint not configured. Go to Admin Panel → SharePoint Settings.');

  var tokenUrl = 'https://login.microsoftonline.com/' + config.tenantId + '/oauth2/v2.0/token';
  var body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  var res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    var errText = await res.text();
    throw new Error('SharePoint auth failed: ' + res.status + ' — ' + errText);
  }

  var data = await res.json();
  TOKEN_CACHE = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in * 1000),
  };
  return data.access_token;
}

// ============================================================================
// GRAPH API HELPERS
// ============================================================================

async function graphGet(path: string): Promise<any> {
  var token = await getAccessToken();
  var res = await fetch('https://graph.microsoft.com/v1.0' + path, {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('Graph API GET ' + path + ' failed: ' + res.status + ' — ' + errText);
  }
  return res.json();
}

async function graphPost(path: string, body: any): Promise<any> {
  var token = await getAccessToken();
  var res = await fetch('https://graph.microsoft.com/v1.0' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('Graph API POST ' + path + ' failed: ' + res.status + ' — ' + errText);
  }
  return res.json();
}

async function graphPatch(path: string, body: any): Promise<any> {
  var token = await getAccessToken();
  var res = await fetch('https://graph.microsoft.com/v1.0' + path, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('Graph API PATCH ' + path + ' failed: ' + res.status + ' — ' + errText);
  }
  // PATCH may return 204 No Content
  if (res.status === 204) return {};
  return res.json();
}

// ============================================================================
// SITE & LIST DISCOVERY
// ============================================================================

export async function getSiteId(siteUrl: string): Promise<string> {
  // Parse "https://tenant.sharepoint.com/sites/SiteName" into host + path
  var url = new URL(siteUrl);
  var host = url.hostname;
  var sitePath = url.pathname;
  // Remove trailing slash
  if (sitePath.endsWith('/')) sitePath = sitePath.slice(0, -1);

  var data = await graphGet('/sites/' + host + ':' + sitePath);
  return data.id;
}

export async function getLists(siteId: string): Promise<any[]> {
  var data = await graphGet('/sites/' + siteId + '/lists?$top=100&$select=id,displayName,description,list');
  // Filter to only show generic/custom lists, not document libraries
  return (data.value || []).filter(function(list: any) {
    return list.list?.template === 'genericList' || list.list?.template === 'customList' || !list.list?.template;
  });
}

export async function getListColumns(siteId: string, listId: string): Promise<any[]> {
  var data = await graphGet('/sites/' + siteId + '/lists/' + listId + '/columns?$top=200');
  // Filter out system/hidden columns
  return (data.value || []).filter(function(col: any) {
    if (col.readOnly && col.name !== 'Title') return false;
    if (col.hidden) return false;
    if (['Attachments', 'Edit', 'LinkTitle', 'LinkTitleNoMenu', 'DocIcon', 'ItemChildCount', 'FolderChildCount', '_UIVersionString', 'ContentType', 'Modified', 'Created', 'Author', 'Editor'].includes(col.name)) return false;
    return true;
  });
}

// ============================================================================
// LIST ITEM CRUD
// ============================================================================

export async function getListItems(siteId: string, listId: string, top: number = 100): Promise<any[]> {
  var data = await graphGet('/sites/' + siteId + '/lists/' + listId + '/items?$expand=fields&$top=' + top);
  return data.value || [];
}

export async function createListItem(siteId: string, listId: string, fields: Record<string, any>): Promise<any> {
  return graphPost('/sites/' + siteId + '/lists/' + listId + '/items', { fields: fields });
}

export async function updateListItem(siteId: string, listId: string, itemId: string, fields: Record<string, any>): Promise<any> {
  return graphPatch('/sites/' + siteId + '/lists/' + listId + '/items/' + itemId + '/fields', fields);
}

// ============================================================================
// FIELD TYPE MAPPING — Agora ↔ SharePoint
// ============================================================================

export function mapAgoraValueToSharePoint(value: any, agoraType: string, spColumnType: string): any {
  if (value === null || value === undefined || value === '') return null;
  if (value === false && agoraType !== 'checkbox') return null;

  switch (agoraType) {
    case 'number':
    case 'currency':
    case 'percent':
    case 'rating':
    case 'progress':
      var num = parseFloat(String(value));
      return isNaN(num) ? null : num;
    case 'checkbox':
      return value === 'true' || value === true;
    case 'date':
      try { 
        var d = String(value);
        if (d.length === 10) d = d + 'T12:00:00Z';
        else if (!d.endsWith('Z') && !d.includes('+')) d = d + ':00Z';
        return new Date(d).toISOString(); 
      } catch { return null; }
    case 'datetime':
      try { 
        var dt = String(value);
        if (!dt.endsWith('Z') && !dt.includes('+')) {
          if (dt.length === 16) dt = dt + ':00Z';
          else if (!dt.endsWith('Z')) dt = dt + 'Z';
        }
        return new Date(dt).toISOString(); 
      } catch { return null; }
    case 'multi_select':
      if (Array.isArray(value)) return value;
      return String(value).split(',').map(function(v) { return v.trim(); }).filter(Boolean);
    default:
      return String(value);
  }
}

// ============================================================================
// SYNC — Push Agora row data to SharePoint list
// ============================================================================

export interface SharePointSyncConfig {
  siteId: string;
  listId: string;
  fieldMapping: Record<string, string>; // agoraColumnId → spColumnName
  uniqueKeyColumnId?: string; // Agora column used to match existing SP items
  uniqueKeySpColumn?: string; // Corresponding SP column name
}

export async function syncRowToSharePoint(
  syncConfig: SharePointSyncConfig,
  rowData: Record<string, any>,
  agoraColumns: { id: string; type: string; name: string }[],
  mode: 'create' | 'upsert' = 'create'
): Promise<{ success: boolean; itemId?: string; error?: string }> {
  try {
    // Build SharePoint fields object from mapping
    var spFields: Record<string, any> = {};
    var entries = Object.entries(syncConfig.fieldMapping);
    for (var i = 0; i < entries.length; i++) {
      var agoraColId = entries[i][0];
      var spColName = entries[i][1];
      var agoraCol = agoraColumns.find(function(c) { return c.id === agoraColId; });
      var agoraValue = rowData[agoraColId];
      var mapped = mapAgoraValueToSharePoint(agoraValue, agoraCol?.type || 'text', '');
      if (mapped !== null && mapped !== undefined) {
        spFields[spColName] = mapped;
      }
    }

    if (Object.keys(spFields).length === 0) {
      return { success: false, error: 'No fields to sync — check field mapping' };
    }

    // Upsert: find existing item by unique key
    if (mode === 'upsert' && syncConfig.uniqueKeyColumnId && syncConfig.uniqueKeySpColumn) {
      var keyValue = rowData[syncConfig.uniqueKeyColumnId];
      if (keyValue) {
        var existingItems = await getListItems(syncConfig.siteId, syncConfig.listId, 5000);
        var existing = existingItems.find(function(item: any) {
          return String(item.fields?.[syncConfig.uniqueKeySpColumn!]) === String(keyValue);
        });
        if (existing) {
          await updateListItem(syncConfig.siteId, syncConfig.listId, existing.id, spFields);
          return { success: true, itemId: existing.id };
        }
      }
    }

    // Create new item
    var created = await createListItem(syncConfig.siteId, syncConfig.listId, spFields);
    return { success: true, itemId: created.id };
  } catch (err: any) {
    console.error('[SharePoint Sync Error]', err);
    return { success: false, error: err.message || 'Unknown error' };
  }
}

// ============================================================================
// TEST CONNECTION
// ============================================================================

export async function testConnection(): Promise<{ success: boolean; siteName?: string; error?: string }> {
  try {
    var config = await getSharePointConfig();
    if (!config) return { success: false, error: 'SharePoint not configured' };
    if (!config.siteUrl) return { success: false, error: 'No SharePoint site URL configured' };

    var token = await getAccessToken();
    var siteId = await getSiteId(config.siteUrl);
    var siteData = await graphGet('/sites/' + siteId);

    return {
      success: true,
      siteName: siteData.displayName || siteData.name || 'Connected',
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}