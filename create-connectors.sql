CREATE TABLE IF NOT EXISTS data_connectors (
  id              TEXT PRIMARY KEY,
  "tableId"       TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'rest_api',
  config          JSONB NOT NULL DEFAULT '{}',
  "fieldMapping"  JSONB NOT NULL DEFAULT '{}',
  "syncMode"      TEXT NOT NULL DEFAULT 'manual',
  "syncIntervalMin" INT NOT NULL DEFAULT 60,
  "lastSyncAt"    TIMESTAMP(3),
  "lastSyncStatus" TEXT NOT NULL DEFAULT 'idle',
  "lastSyncError" TEXT,
  "lastSyncStats" JSONB,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdById"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS data_connectors_table_idx ON data_connectors ("tableId");
CREATE INDEX IF NOT EXISTS data_connectors_type_idx ON data_connectors (type);