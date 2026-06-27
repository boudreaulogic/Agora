'use client';

// Public, fully-interactive embedded dashboard. Uses the SAME shared rendering
// + interaction layer as the editor and view mode, so slicers, date-range
// controls, live sort, and click-to-cross-filter all work for anonymous
// viewers — data flows through the token-scoped /api/insights/embed-query.

import { useDashboardData, WidgetData } from '@/components/insights/useDashboardData';
import { DashboardCanvas } from '@/components/insights/DashboardCanvas';

export function EmbedDashboardViewer({ dashboard, token }: { dashboard: any; token: string }) {
  var widgets: WidgetData[] = dashboard.widgets || [];
  var hook = useDashboardData({ dashboardId: dashboard.id, widgets: widgets, mode: 'embed', embedToken: token });
  var theme = hook.theme;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: theme.bg }}>
      <div style={{ padding: '14px 20px', background: theme.panelBg, borderBottom: '1px solid ' + theme.border, display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <span style={{ fontSize: '22px' }}>{dashboard.icon || '📊'}</span>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: theme.text, margin: 0 }}>{dashboard.name}</h1>
        {dashboard.description && <span style={{ fontSize: '12px', color: theme.subtext }}>— {dashboard.description}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DashboardCanvas widgets={widgets} hook={hook} interactive={true} editing={false} />
      </div>
      <div style={{ textAlign: 'center', padding: '12px', fontSize: '10px', color: theme.subtext, background: theme.bg }}>Powered by Agora</div>
    </div>
  );
}
