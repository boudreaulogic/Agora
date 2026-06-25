// lib/connectors/college-scorecard.ts
// College Scorecard sync engine. Mirrors the established Agora REST connector
// pattern: row data keyed by column ID (cuid), not column name. Uses
// fieldMapping on DataConnector to translate Scorecard source paths to
// Agora column IDs.

import { db } from '@/lib/db';

export var SCORECARD_BASE_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';
export var SCORECARD_PER_PAGE = 100;

// Fields requested from the API. Keep this list narrow — Scorecard responses
// are huge by default and we only want what we map.
export var SCORECARD_FIELDS = [
  'id',
  'school.name',
  'school.city',
  'school.state',
  'school.ownership',
  'school.minority_serving.tribal',
  'latest.student.size',
  'latest.cost.tuition.in_state',
  'latest.cost.tuition.out_of_state',
  'latest.admissions.admission_rate.overall',
  'latest.completion.rate_suppressed.overall',
  'latest.student.demographics.race_ethnicity.aian',
  'latest.earnings.10_yrs_after_entry.median',
].join(',');

// Column definitions — drives table creation order and shape.
// `source` is the dotted Scorecard path; `column` is the Agora column to create.
// `isUpsertKey` flags the Scorecard ID as the unique-key field.
export type ScorecardFieldDef = {
  source: string;
  column: string;
  type: string;
  isUpsertKey?: boolean;
  selectOptions?: string[];
};

export var FIELD_MAP: ScorecardFieldDef[] = [
  { source: 'id', column: 'Scorecard ID', type: 'number', isUpsertKey: true },
  { source: 'school.name', column: 'School Name', type: 'text' },
  { source: 'school.city', column: 'City', type: 'text' },
  { source: 'school.state', column: 'State', type: 'text' },
  { source: 'school.ownership', column: 'Ownership', type: 'select', selectOptions: ['Public', 'Private Non-Profit', 'Private For-Profit'] },
  { source: 'school.minority_serving.tribal', column: 'Tribal College', type: 'checkbox' },
  { source: 'latest.student.size', column: 'Enrollment', type: 'number' },
  { source: 'latest.cost.tuition.in_state', column: 'In-State Tuition', type: 'currency' },
  { source: 'latest.cost.tuition.out_of_state', column: 'Out-of-State Tuition', type: 'currency' },
  { source: 'latest.admissions.admission_rate.overall', column: 'Admission Rate', type: 'percent' },
  { source: 'latest.completion.rate_suppressed.overall', column: 'Completion Rate', type: 'percent' },
  { source: 'latest.student.demographics.race_ethnicity.aian', column: 'AIAN %', type: 'percent' },
  { source: 'latest.earnings.10_yrs_after_entry.median', column: 'Median Earnings (10yr)', type: 'currency' },
];

export var OWNERSHIP_LABELS: Record<number, string> = {
  1: 'Public',
  2: 'Private Non-Profit',
  3: 'Private For-Profit',
};

export type ScorecardConfig = {
  apiKey: string;
  filters: {
    state?: string;
    tribalOnly?: boolean;
  };
};

export type SyncStats = {
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  pagesFetched: number;
  durationMs: number;
};

// Build the request URL for a given page.
export function buildScorecardUrl(config: ScorecardConfig, page: number): string {
  var params = new URLSearchParams();
  params.set('api_key', config.apiKey);
  params.set('fields', SCORECARD_FIELDS);
  params.set('per_page', String(SCORECARD_PER_PAGE));
  params.set('page', String(page));

  if (config.filters && config.filters.state) {
    params.set('school.state', config.filters.state);
  }
  if (config.filters && config.filters.tribalOnly) {
    params.set('school.minority_serving.tribal', '1');
  }

  return SCORECARD_BASE_URL + '?' + params.toString();
}

// Pull a value from a Scorecard record. When you pass `fields=` to the
// Scorecard API the response is FLAT — the dotted path is the literal key
// (e.g. record["school.name"]), NOT nested objects. Try the flat lookup
// first, then fall back to nested traversal in case the API ever returns
// nested data for endpoints we add later.
export function readField(record: any, source: string): any {
  if (record === null || record === undefined) {
    return null;
  }

  // Flat-key lookup (the normal case for Scorecard responses with fields=).
  if (Object.prototype.hasOwnProperty.call(record, source)) {
    var flatValue = record[source];
    return flatValue === undefined ? null : flatValue;
  }

  // Nested traversal fallback.
  var parts = source.split('.');
  var cursor: any = record;
  for (var i = 0; i < parts.length; i++) {
    if (cursor === null || cursor === undefined) {
      return null;
    }
    cursor = cursor[parts[i]];
  }
  return cursor === undefined ? null : cursor;
}

// Convert a raw Scorecard value into the shape Agora expects. Agora cell
// values are stored as strings in row data JSON.
export function coerceValue(raw: any, type: string): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (type === 'number' || type === 'currency') {
    var n = Number(raw);
    return Number.isFinite(n) ? String(n) : null;
  }

  if (type === 'percent') {
    // Scorecard returns 0..1, Agora percent expects 0..100.
    var p = Number(raw);
    if (!Number.isFinite(p)) {
      return null;
    }
    return String(Math.round(p * 10000) / 100);
  }

  if (type === 'checkbox') {
    return (raw === 1 || raw === true || raw === '1') ? 'true' : 'false';
  }

  if (type === 'select') {
    // Ownership decode.
    var code = Number(raw);
    return OWNERSHIP_LABELS[code] || null;
  }

  return String(raw);
}

// Run the sync against an already-provisioned connector. `fieldMapping` on the
// DataConnector record maps source path → column ID, so we use those IDs as
// the keys in row data (matching how the REST API sync engine works).
// The caller passes a decryptedConfig because the stored connector.config
// keeps the API key in encrypted form.
export async function runScorecardSync(
  connectorId: string,
  userId: string,
  decryptedConfig: ScorecardConfig
): Promise<SyncStats> {
  var startedAt = Date.now();

  var connector = await db.dataConnector.findUnique({
    where: { id: connectorId },
  });
  if (!connector) {
    throw new Error('Connector not found: ' + connectorId);
  }
  if (!connector.isActive) {
    throw new Error('Connector is inactive');
  }

  var config = decryptedConfig;
  if (!config || !config.apiKey) {
    throw new Error('Connector config missing apiKey');
  }

  var fieldMapping = connector.fieldMapping as Record<string, string>;
  if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
    throw new Error('Connector has no fieldMapping');
  }

  // The Scorecard ID column is the upsert key.
  var upsertColumnId = fieldMapping['id'];
  if (!upsertColumnId) {
    throw new Error('fieldMapping has no entry for "id" (upsert key)');
  }

  // Mark syncing.
  await db.dataConnector.update({
    where: { id: connectorId },
    data: { lastSyncStatus: 'syncing' },
  });

  // Build a quick lookup of type info by source path for value coercion.
  var typeBySource: Record<string, string> = {};
  for (var i = 0; i < FIELD_MAP.length; i++) {
    typeBySource[FIELD_MAP[i].source] = FIELD_MAP[i].type;
  }

  // Existing rows for upsert matching.
  var existingRows = await db.agoraRow.findMany({
    where: { tableId: connector.tableId },
    orderBy: { position: 'asc' },
    select: { id: true, data: true, position: true },
  });

  var existingByKey: Record<string, { id: string; data: any; position: number }> = {};
  for (var r = 0; r < existingRows.length; r++) {
    var row = existingRows[r];
    var data = row.data as any;
    var keyVal = data[upsertColumnId];
    if (keyVal !== undefined && keyVal !== null && String(keyVal).trim() !== '') {
      existingByKey[String(keyVal)] = { id: row.id, data: data, position: row.position };
    }
  }

  var stats: SyncStats = {
    rowsCreated: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    pagesFetched: 0,
    durationMs: 0,
  };

  var maxPosition = existingRows.length > 0
    ? Math.max.apply(null, existingRows.map(function (rr) { return rr.position; }))
    : -1;

  var page = 0;
  var totalReported = Infinity;

  while (page * SCORECARD_PER_PAGE < totalReported) {
    var url = buildScorecardUrl(config, page);

    var response = await fetch(url);
    if (!response.ok) {
      var body = await response.text();
      throw new Error('Scorecard API ' + response.status + ': ' + body.slice(0, 200));
    }

    var payload = await response.json();
    stats.pagesFetched += 1;
    totalReported = payload.metadata && typeof payload.metadata.total === 'number'
      ? payload.metadata.total
      : 0;

    var records: any[] = Array.isArray(payload.results) ? payload.results : [];

    for (var k = 0; k < records.length; k++) {
      var record = records[k];
      var scorecardId = record.id;
      if (scorecardId === null || scorecardId === undefined) {
        stats.rowsSkipped += 1;
        continue;
      }

      // Build row data keyed by column ID.
      var rowData: Record<string, any> = {};
      var sourcePaths = Object.keys(fieldMapping);
      for (var s = 0; s < sourcePaths.length; s++) {
        var sourcePath = sourcePaths[s];
        var columnId = fieldMapping[sourcePath];
        var rawValue = readField(record, sourcePath);
        var coerced = coerceValue(rawValue, typeBySource[sourcePath] || 'text');
        if (coerced !== null) {
          rowData[columnId] = coerced;
        }
      }

      var keyValue = String(scorecardId);
      var existing = existingByKey[keyValue];

      if (existing) {
        // Check if anything actually changed before writing.
        var changed = false;
        var dataKeys = Object.keys(rowData);
        for (var d = 0; d < dataKeys.length; d++) {
          var col = dataKeys[d];
          if (String(existing.data[col] || '') !== String(rowData[col] || '')) {
            changed = true;
            break;
          }
        }

        if (changed) {
          var merged = Object.assign({}, existing.data, rowData);
          await db.agoraRow.update({
            where: { id: existing.id },
            data: { data: merged },
          });
          stats.rowsUpdated += 1;
        } else {
          stats.rowsSkipped += 1;
        }
      } else {
        maxPosition += 1;
        await db.agoraRow.create({
          data: {
            tableId: connector.tableId,
            data: rowData,
            position: maxPosition,
            createdById: userId,
          },
        });
        stats.rowsCreated += 1;
      }
    }

    page += 1;

    // Safety valve.
    if (page > 100) {
      break;
    }
  }

  stats.durationMs = Date.now() - startedAt;

  await db.dataConnector.update({
    where: { id: connectorId },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: 'success',
      lastSyncError: null,
      lastSyncStats: stats as any,
    },
  });

  return stats;
}