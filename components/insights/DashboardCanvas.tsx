'use client';

// ============================================================
// components/insights/DashboardCanvas.tsx
// The shared dashboard surface: top filter bar (top-bar slicers +
// active cross-filter chips + clear-all) and the 12-column widget grid
// (data widgets, text blocks, and on-canvas slicer tiles). Rendered
// identically in the editor, view mode, and the public embed. The editor
// injects per-widget chrome (resize/config/delete) via a render-prop.
// ============================================================

import React from 'react';
import { WidgetChart } from './WidgetChart';
import { Slicer } from './Slicer';
import { WidgetData, UseDashboardDataResult } from './useDashboardData';

var WIDGET_ICONS: Record<string, string> = { kpi_card: '🔢', bar: '📊', line: '📈', pie: '🥧', donut: '🍩', area: '📉', scatter: '⚬', combo: '📊', gauge: '◔', data_table: '📋', text: '📝', slicer: '🎛️' };

// Live sort options offered in a widget header (viewer-facing).
function SortControl({ widget, current, onChange, theme }: { widget: WidgetData; current?: { field: string; direction: 'asc' | 'desc' }; onChange: (o: { field: string; direction: 'asc' | 'desc' } | null) => void; theme: any }) {
  var dc = widget.dataConfig || {};
  var isDate = !!(dc.dateGrouping && dc.dateGrouping !== 'none');
  var opts = isDate
    ? [{ k: 'oldest', label: 'Oldest first', o: { field: '_label', direction: 'asc' as const } }, { k: 'newest', label: 'Newest first', o: { field: '_label', direction: 'desc' as const } }]
    : [{ k: 'high', label: 'Highest', o: { field: 'value', direction: 'desc' as const } }, { k: 'low', label: 'Lowest', o: { field: 'value', direction: 'asc' as const } }, { k: 'az', label: 'A → Z', o: { field: '_label', direction: 'asc' as const } }, { k: 'za', label: 'Z → A', o: { field: '_label', direction: 'desc' as const } }];
  var val = '';
  opts.forEach(function(op) { if (current && current.field === op.o.field && current.direction === op.o.direction) val = op.k; });
  return (
    <select value={val} onChange={function(e) { var f = opts.find(function(o) { return o.k === e.target.value; }); onChange(f ? f.o : null); }}
      title="Sort" style={{ fontSize: '10px', padding: '1px 4px', border: '1px solid ' + theme.border, borderRadius: '5px', background: theme.cardBg, color: theme.subtext, cursor: 'pointer', maxWidth: '92px' }}>
      <option value="">⇅ Sort</option>
      {opts.map(function(op) { return <option key={op.k} value={op.k}>{op.label}</option>; })}
    </select>
  );
}

export function DashboardCanvas(props: {
  widgets: WidgetData[];
  hook: UseDashboardDataResult;
  interactive?: boolean;
  editing?: boolean;
  rowHeight?: number;
  maxWidth?: number;
  renderWidgetChrome?: (widget: WidgetData) => React.ReactNode;
  renderTopbarExtra?: React.ReactNode;
  onRemoveSlicerWidget?: (slicerId: string) => void; // editor: delete a slicer widget
  emptyState?: React.ReactNode;
}) {
  var hook = props.hook;
  var theme = hook.theme;
  var ROW_HEIGHT = props.rowHeight || 80;
  var interactive = props.interactive !== false;

  var settingsExcluded = props.widgets.filter(function(w) { return w.type !== '_settings'; });
  var topbarSlicers = settingsExcluded.filter(function(w) { return w.type === 'slicer' && (w.vizConfig?.placement || 'topbar') === 'topbar'; });
  var gridWidgets = settingsExcluded.filter(function(w) { return !(w.type === 'slicer' && (w.vizConfig?.placement || 'topbar') === 'topbar'); });

  // Active ephemeral cross-filters → chips
  var crossChips = Object.keys(hook.slicerState).filter(function(id) { return hook.slicerState[id].ephemeral; });

  function renderSlicer(sw: WidgetData) {
    return (
      <Slicer
        slicerWidget={sw}
        options={hook.options[sw.id] || []}
        value={hook.slicerState[sw.id] ? hook.slicerState[sw.id].value : (sw.dataConfig?.control === 'daterange' ? {} : [])}
        onChange={function(v) { hook.setSlicerValue(sw.id, v); }}
        theme={theme}
        onRemove={props.editing && props.onRemoveSlicerWidget ? function() { props.onRemoveSlicerWidget!(sw.id); } : undefined}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.bg }}>
      {/* Filter bar */}
      {(topbarSlicers.length > 0 || crossChips.length > 0 || props.renderTopbarExtra || hook.anyFilterActive) && (
        <div style={{ background: theme.panelBg, borderBottom: '1px solid ' + theme.border, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' as const, minHeight: '40px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: theme.subtext, marginRight: '4px' }}>FILTERS</span>
          {topbarSlicers.map(function(sw) { return <span key={sw.id}>{renderSlicer(sw)}</span>; })}
          {crossChips.map(function(id) {
            var s = hook.slicerState[id];
            var labelVal = Array.isArray(s.value) ? s.value.join(', ') : '';
            return (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 6px 3px 10px', background: theme.accent + '22', border: '1px solid ' + theme.accent, borderRadius: '7px', fontSize: '11px', color: theme.accent, fontWeight: 600 }}>
                <span style={{ fontSize: '9px' }}>↪</span> {labelVal}
                <button onClick={function() { hook.removeSlicer(id); }} title="Clear" style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, fontSize: '12px' }}>✕</button>
              </span>
            );
          })}
          {props.renderTopbarExtra}
          {hook.anyFilterActive && (
            <button onClick={hook.clearAllSlicers} style={{ padding: '3px 8px', fontSize: '10px', border: '1px solid #fecaca', borderRadius: '5px', background: '#fef2f2', color: '#991b1b', cursor: 'pointer' }}>Clear all</button>
          )}
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {gridWidgets.length === 0 ? (
          props.emptyState || <div style={{ textAlign: 'center', padding: '80px 24px', color: theme.subtext }}><div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div><p style={{ fontSize: '16px', fontWeight: 500, color: theme.text }}>Empty dashboard</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '12px', maxWidth: (props.maxWidth || 1400) + 'px', margin: '0 auto' }}>
            {gridWidgets.map(function(widget) {
              var isSlicer = widget.type === 'slicer';
              return (
                <div key={widget.id} data-widget-id={widget.id}
                  style={{ gridColumn: 'span ' + (widget.layoutW || 6), minHeight: ((widget.layoutH || 4) * ROW_HEIGHT) + 'px', background: theme.cardBg, border: '1px solid ' + theme.border, borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: theme.name === 'dark' ? '0 1px 3px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ padding: '8px 12px', borderBottom: props.editing ? '1px solid ' + theme.gridStroke : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{ fontSize: '12px' }}>{WIDGET_ICONS[widget.type] || '📊'}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{widget.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {interactive && !isSlicer && (widget.dataConfig?.groupBy) && ['bar', 'line', 'area', 'data_table', 'combo'].indexOf(widget.type) !== -1 && (
                        <SortControl widget={widget} current={hook.sortOverrides[widget.id]} onChange={function(o) { hook.setWidgetSort(widget.id, o); }} theme={theme} />
                      )}
                      {props.renderWidgetChrome && props.renderWidgetChrome(widget)}
                    </div>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, padding: isSlicer ? '12px' : 0, display: isSlicer ? 'flex' : 'block', alignItems: 'center', flexWrap: 'wrap' as const, gap: '6px' }}>
                    {isSlicer ? renderSlicer(widget) : (
                      <WidgetChart widget={widget} queryData={hook.data[widget.id]} theme={theme} interactive={interactive}
                        onCrossFilter={interactive ? function(label) { hook.crossFilter(widget, label); } : undefined} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
