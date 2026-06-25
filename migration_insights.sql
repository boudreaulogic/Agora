-- Agora Insights Schema Migration

-- Oikos (semantic model)
CREATE TABLE IF NOT EXISTS oikos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Oikos Tables (which tables belong to an Oikos)
CREATE TABLE IF NOT EXISTS oikos_tables (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  oikos_id TEXT NOT NULL REFERENCES oikos(id) ON DELETE CASCADE,
  table_id TEXT NOT NULL REFERENCES agora_tables(id) ON DELETE CASCADE,
  alias TEXT,
  position_x DOUBLE PRECISION DEFAULT 0,
  position_y DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(oikos_id, table_id)
);

-- Oikos Relationships (how tables join)
CREATE TABLE IF NOT EXISTS oikos_relationships (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  oikos_id TEXT NOT NULL REFERENCES oikos(id) ON DELETE CASCADE,
  from_table_id TEXT NOT NULL REFERENCES agora_tables(id) ON DELETE CASCADE,
  from_column_id TEXT NOT NULL,
  to_table_id TEXT NOT NULL REFERENCES agora_tables(id) ON DELETE CASCADE,
  to_column_id TEXT NOT NULL,
  join_type TEXT NOT NULL DEFAULT 'inner',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Oikos Measures (reusable calculated measures)
CREATE TABLE IF NOT EXISTS oikos_measures (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  oikos_id TEXT NOT NULL REFERENCES oikos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  expression TEXT NOT NULL,
  format TEXT DEFAULT 'number',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Dashboards
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '📊',
  oikos_id TEXT REFERENCES oikos(id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'draft',
  sort_order INTEGER DEFAULT 0,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Dashboard Permissions
CREATE TABLE IF NOT EXISTS dashboard_permissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(dashboard_id, user_id),
  UNIQUE(dashboard_id, role_id),
  UNIQUE(dashboard_id, group_id)
);

-- Dashboard Filters (server-side filter definitions)
CREATE TABLE IF NOT EXISTS dashboard_filters (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  table_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT 'eq',
  default_value TEXT,
  parameter_key TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Dashboard Parameters (user-facing controls)
CREATE TABLE IF NOT EXISTS dashboard_parameters (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'select',
  config JSONB NOT NULL DEFAULT '{}',
  default_value TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(dashboard_id, key)
);

-- Widgets
CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bar',
  data_config JSONB NOT NULL DEFAULT '{}',
  viz_config JSONB NOT NULL DEFAULT '{}',
  layout_x INTEGER DEFAULT 0,
  layout_y INTEGER DEFAULT 0,
  layout_w INTEGER DEFAULT 6,
  layout_h INTEGER DEFAULT 4,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Widget Filters (per-widget filter overrides)
CREATE TABLE IF NOT EXISTS widget_filters (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  widget_id TEXT NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
  table_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT 'eq',
  value TEXT,
  parameter_key TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oikos_workspace ON oikos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_oikos_tables_oikos ON oikos_tables(oikos_id);
CREATE INDEX IF NOT EXISTS idx_oikos_relationships_oikos ON oikos_relationships(oikos_id);
CREATE INDEX IF NOT EXISTS idx_oikos_measures_oikos ON oikos_measures(oikos_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_workspace ON dashboards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_oikos ON dashboards(oikos_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_status ON dashboards(status);
CREATE INDEX IF NOT EXISTS idx_dashboards_creator ON dashboards(created_by_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_permissions_dashboard ON dashboard_permissions(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_filters_dashboard ON dashboard_filters(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_parameters_dashboard ON dashboard_parameters(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_widgets_dashboard ON widgets(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_widget_filters_widget ON widget_filters(widget_id);

-- GIN index on row data for fast JSON queries
CREATE INDEX IF NOT EXISTS idx_agora_rows_data_gin ON agora_rows USING GIN (data);
