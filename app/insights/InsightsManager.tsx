'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ---- Types ----
interface TableInfo { id: string; name: string; columns: { id: string; name: string; type: string; settings?: any }[]; }
interface WorkspaceInfo { id: string; name: string; icon?: string | null; }
interface DashboardSummary { id: string; name: string; slug: string; description?: string; icon?: string; status: string; visibility: string; workspaceId?: string; createdAt: string; updatedAt: string; _count?: { widgets: number }; }

// ---- Styles ----
var btnPrimary: React.CSSProperties = { background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' };
var btnSecondary: React.CSSProperties = { background: 'none', border: '1px solid #d1d5db', borderRadius: '8px', color: '#6b7280', padding: '8px 16px', fontSize: '12px', cursor: 'pointer' };
var cardStyle: React.CSSProperties = { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' };
var inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#111827', fontSize: '13px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };
var selectStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#111827', fontSize: '13px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, cursor: 'pointer' };
var labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' };

var WIDGET_TYPES = [
  { value: 'kpi_card', label: 'KPI Card', icon: '🔢', desc: 'Single metric with trend' },
  { value: 'bar', label: 'Bar Chart', icon: '📊', desc: 'Compare categories' },
  { value: 'line', label: 'Line Chart', icon: '📈', desc: 'Trends over time' },
  { value: 'pie', label: 'Pie Chart', icon: '🥧', desc: 'Part of whole' },
  { value: 'donut', label: 'Donut Chart', icon: '🍩', desc: 'Part of whole (hollow)' },
  { value: 'area', label: 'Area Chart', icon: '📉', desc: 'Filled trend line' },
  { value: 'data_table', label: 'Data Table', icon: '📋', desc: 'Tabular data view' },
  { value: 'text', label: 'Text Block', icon: '📝', desc: 'Static text or markdown' },
];

var NUMERIC_TYPES = ['number', 'currency', 'percent', 'rating', 'progress'];
var AGG_FUNCTIONS = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count_distinct', label: 'Count Distinct' },
];

// ---- Main Component ----
export function InsightsManager({ tables, workspaces }: { tables: TableInfo[]; workspaces: WorkspaceInfo[] }) {
  var router = useRouter();
  var [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  var [loading, setLoading] = useState(true);
  var [view, setView] = useState<'list' | 'create'>('list');

  // Create form
  var [newName, setNewName] = useState('');
  var [newDesc, setNewDesc] = useState('');
  var [newIcon, setNewIcon] = useState('📊');
  var [newWorkspace, setNewWorkspace] = useState('');
  var [creating, setCreating] = useState(false);

  var fetchDashboards = useCallback(async function() {
    try {
      var r = await fetch('/api/insights/dashboards');
      if (r.ok) setDashboards(await r.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(function() { fetchDashboards(); }, [fetchDashboards]);

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      var r = await fetch('/api/insights/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null, icon: newIcon, workspaceId: newWorkspace || null }),
      });
      if (r.ok) {
        var d = await r.json();
        router.push('/insights/' + d.id);
      } else {
        var e = await r.json();
        alert(e.error || 'Failed to create');
      }
    } finally { setCreating(false); }
  }
  
  async function handleDuplicate(id: string) {
    try {
      // Fetch the full dashboard with widgets
      var r = await fetch('/api/insights/dashboards/' + id);
      if (!r.ok) return;
      var original = await r.json();

      // Create new dashboard
      var createRes = await fetch('/api/insights/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: original.name + ' (copy)', description: original.description, icon: original.icon, workspaceId: original.workspaceId }),
      });
      if (!createRes.ok) return;
      var newDash = await createRes.json();

      // Duplicate all widgets
      var widgets = original.widgets || [];
      for (var i = 0; i < widgets.length; i++) {
        var w = widgets[i];
        await fetch('/api/insights/dashboards/' + newDash.id + '/widgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: w.name, type: w.type, dataConfig: w.dataConfig || w.data_config || {}, vizConfig: w.vizConfig || w.viz_config || {}, layoutX: w.layoutX || w.layout_x || 0, layoutY: w.layoutY || w.layout_y || 0, layoutW: w.layoutW || w.layout_w || 6, layoutH: w.layoutH || w.layout_h || 4 }),
        });
      }

      fetchDashboards();
    } catch (e) { console.error('Duplicate failed:', e); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this dashboard and all its widgets?')) return;
    await fetch('/api/insights/dashboards/' + id, { method: 'DELETE' });
    fetchDashboards();
  }

  var icons = ['📊', '📈', '📉', '🔢', '📋', '🎯', '💰', '👥', '🏫', '⚡', '🌍', '🏥', '📦', '🛒', '🎓', '🏛️'];

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading dashboards...</div>;

  // ---- CREATE ----
  if (view === 'create') {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '32px 24px' }}>
        <button onClick={function() { setView('list'); }} style={btnSecondary}>← Back</button>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: '16px 0' }}>New Dashboard</h1>
        <div style={Object.assign({}, cardStyle, { display: 'flex', flexDirection: 'column' as const, gap: '16px' })}>
          <div>
            <label style={labelStyle}>Icon</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px' }}>
              {icons.map(function(ic) { return (
                <button key={ic} onClick={function() { setNewIcon(ic); }}
                  style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', borderRadius: '8px', border: newIcon === ic ? '2px solid #2563eb' : '2px solid transparent', background: newIcon === ic ? '#eff6ff' : '#f9fafb', cursor: 'pointer' }}>
                  {ic}
                </button>
              ); })}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Name</label>
            <input type="text" value={newName} onChange={function(e) { setNewName(e.target.value); }} style={inputStyle} placeholder="e.g. Student Enrollment Dashboard" autoFocus onKeyDown={function(e) { if (e.key === 'Enter') handleCreate(); }} />
          </div>
          <div>
            <label style={labelStyle}>Description (optional)</label>
            <input type="text" value={newDesc} onChange={function(e) { setNewDesc(e.target.value); }} style={inputStyle} placeholder="What does this dashboard track?" />
          </div>
          <div>
            <label style={labelStyle}>Workspace (optional)</label>
            <select value={newWorkspace} onChange={function(e) { setNewWorkspace(e.target.value); }} style={selectStyle}>
              <option value="">None — standalone</option>
              {workspaces.map(function(ws) { return <option key={ws.id} value={ws.id}>{ws.icon || '📁'} {ws.name}</option>; })}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button onClick={function() { setView('list'); }} style={btnSecondary}>Cancel</button>
            <button onClick={handleCreate} disabled={!newName.trim() || creating} style={Object.assign({}, btnPrimary, { opacity: creating || !newName.trim() ? 0.6 : 1 })}>{creating ? 'Creating...' : 'Create Dashboard'}</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- LIST ----
  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: 0 }}>📊 Insights</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Build dashboards and visualize your data</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={function() { router.push('/insights/model'); }} style={btnSecondary}>🗺️ Data Model</button>
		  <button onClick={async function() {
            if (!confirm('Migrate existing charts to Insights dashboards?')) return;
            var r = await fetch('/api/insights/migrate-charts', { method: 'POST' });
            if (r.ok) { var d = await r.json(); alert('Migrated ' + (d.migrated || 0) + ' charts to ' + (d.dashboards || 0) + ' dashboard(s)'); fetchDashboards(); }
            else { var e = await r.json(); alert(e.error || 'Migration failed'); }
          }} style={btnSecondary}>📦 Migrate Charts</button>
          <button onClick={function() { setView('create'); }} style={btnPrimary}>+ New Dashboard</button>
        </div>
      </div>

      {dashboards.length === 0 ? (
        <div style={Object.assign({}, cardStyle, { textAlign: 'center' as const, padding: '60px 24px', color: '#6b7280' })}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
          <p style={{ fontSize: '16px', fontWeight: 500, color: '#374151' }}>No dashboards yet</p>
          <p style={{ fontSize: '13px', marginTop: '4px', marginBottom: '16px' }}>Create your first dashboard to start visualizing data.</p>
          <button onClick={function() { setView('create'); }} style={btnPrimary}>+ New Dashboard</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {dashboards.map(function(d) { return (
            <div key={d.id} style={Object.assign({}, cardStyle, { cursor: 'pointer', transition: 'all 0.15s' })}
              onClick={function() { router.push('/insights/' + d.id); }}
              onMouseEnter={function(e) { (e.currentTarget as HTMLElement).style.borderColor = '#93c5fd'; }}
              onMouseLeave={function(e) { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '28px' }}>{d.icon || '📊'}</span>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>{d.name}</h3>
                    {d.description && <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>{d.description}</p>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button onClick={function(e) { e.stopPropagation(); handleDuplicate(d.id); }}
                    style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '14px', padding: '4px' }}
                    title="Duplicate">⧉</button>
                  <button onClick={function(e) { e.stopPropagation(); handleDelete(d.id); }}
                    style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '14px', padding: '4px' }}
                    title="Delete">✕</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', fontSize: '11px', color: '#9ca3af' }}>
                <span>{d._count?.widgets || 0} widget{(d._count?.widgets || 0) !== 1 ? 's' : ''}</span>
                <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: d.status === 'published' ? '#dcfce7' : '#f3f4f6', color: d.status === 'published' ? '#166534' : '#6b7280' }}>
                  {d.status === 'published' ? 'Published' : 'Draft'}
                </span>
                <span>{d.visibility}</span>
              </div>
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}