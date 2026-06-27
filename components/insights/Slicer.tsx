'use client';

// ============================================================
// components/insights/Slicer.tsx
// Interactive, viewer-facing filter controls ("the form on the dashboard").
// One component, five control types: checklist, dropdown, search, buttons,
// daterange. Value-controls carry string[] (empty = "All"); daterange carries
// { preset?, from?, to? }. Used in the top filter bar AND as on-canvas tiles,
// in the editor, view mode, and the public embed.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { DashboardTheme } from './theme';

export type SlicerValue = string[] | { preset?: string; from?: string; to?: string };

// ---- Relative date presets (resolved client-side to concrete from/to) ----

export var DATE_PRESETS: { value: string; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
];

function iso(d: Date): string { return d.toISOString().split('T')[0]; }

// Resolve a preset to concrete { from, to } ISO dates. Empty strings mean "unbounded".
export function resolveDatePreset(preset?: string): { from: string; to: string } {
  var now = new Date();
  var to = iso(now);
  switch (preset) {
    case 'last7': { var d = new Date(now); d.setDate(d.getDate() - 6); return { from: iso(d), to: to }; }
    case 'last30': { var d2 = new Date(now); d2.setDate(d2.getDate() - 29); return { from: iso(d2), to: to }; }
    case 'last90': { var d3 = new Date(now); d3.setDate(d3.getDate() - 89); return { from: iso(d3), to: to }; }
    case 'this_month': return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: to };
    case 'this_quarter': { var q = Math.floor(now.getMonth() / 3); return { from: iso(new Date(now.getFullYear(), q * 3, 1)), to: to }; }
    case 'this_year': return { from: iso(new Date(now.getFullYear(), 0, 1)), to: to };
    default: return { from: '', to: '' };
  }
}

// Translate a slicer's current value into concrete query filters on its column.
// Value controls → an `in` filter; daterange → gte/lte pair (resolved from preset or explicit dates).
export function slicerToFilters(columnId: string, control: string, value: SlicerValue): any[] {
  if (control === 'daterange') {
    var v = (value || {}) as { preset?: string; from?: string; to?: string };
    var range = (v.preset && v.preset !== 'all') ? resolveDatePreset(v.preset) : { from: v.from || '', to: v.to || '' };
    var out: any[] = [];
    if (range.from) out.push({ columnId: columnId, operator: 'gte', value: range.from });
    if (range.to) out.push({ columnId: columnId, operator: 'lte', value: range.to + 'T23:59:59.999Z' });
    return out;
  }
  var vals = (value as string[]) || [];
  if (!vals.length) return []; // "All"
  if (vals.length === 1 && vals[0] === '__none__') return [{ columnId: columnId, operator: 'in', values: ['__never_matches__'] }];
  return [{ columnId: columnId, operator: 'in', values: vals }];
}

function isActive(control: string, value: SlicerValue): boolean {
  if (control === 'daterange') { var v = value as any; return !!(v && ((v.preset && v.preset !== 'all') || v.from || v.to)); }
  return Array.isArray(value) && value.length > 0;
}

// ---- Popover shell (shared by checklist / dropdown / search / daterange) ----

function Popover({ trigger, children, theme }: { trigger: (open: boolean, toggle: () => void) => React.ReactNode; children: (close: () => void) => React.ReactNode; theme: DashboardTheme }) {
  var [open, setOpen] = useState(false);
  var anchorRef = useRef<HTMLDivElement | null>(null);
  var popRef = useRef<HTMLDivElement | null>(null);
  useEffect(function() {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node) && anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return function() { document.removeEventListener('mousedown', onDown); };
  }, [open]);
  return (
    <div style={{ position: 'relative' as const, display: 'inline-block' }}>
      <div ref={anchorRef}>{trigger(open, function() { setOpen(!open); })}</div>
      {open && (
        <div ref={popRef} style={{ position: 'absolute' as const, top: 'calc(100% + 4px)', left: 0, zIndex: 100, width: '260px', maxHeight: '360px', background: theme.cardBg, border: '1px solid ' + theme.border, borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' as const }}>
          {children(function() { setOpen(false); })}
        </div>
      )}
    </div>
  );
}

function PillTrigger({ label, summary, active, theme, onRemove, toggle }: { label: string; summary: string; active: boolean; theme: DashboardTheme; onRemove?: () => void; toggle: () => void }) {
  return (
    <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px 4px 10px', background: active ? theme.accent + '22' : (theme.name === 'dark' ? '#0f172a' : '#f3f4f6'), border: '1px solid ' + (active ? theme.accent : theme.border), borderRadius: '7px', cursor: 'pointer' }}>
      <span style={{ fontSize: '10px', color: theme.subtext, fontWeight: 500 }}>{label}:</span>
      <span style={{ fontSize: '11px', color: active ? theme.accent : theme.text, fontWeight: 600, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{summary}</span>
      <span style={{ fontSize: '8px', color: theme.subtext }}>▼</span>
      {onRemove && <button onClick={function(e) { e.stopPropagation(); onRemove(); }} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.subtext, fontSize: '12px', padding: '0 2px' }}>✕</button>}
    </div>
  );
}

// ============================================================
// Slicer
// ============================================================
export function Slicer({ slicerWidget, options, value, onChange, theme, onRemove }: {
  slicerWidget: { dataConfig: any; vizConfig: any };
  options: string[];
  value: SlicerValue;
  onChange: (next: SlicerValue) => void;
  theme: DashboardTheme;
  onRemove?: () => void;
}) {
  var dc = slicerWidget.dataConfig || {};
  var vc = slicerWidget.vizConfig || {};
  var control = dc.control || 'checklist';
  var label = vc.label || 'Filter';
  var [search, setSearch] = useState('');
  var active = isActive(control, value);

  // ---- Buttons: inline pill toggles, no popover ----
  if (control === 'buttons') {
    var sel = (value as string[]) || [];
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: '10px', color: theme.subtext, fontWeight: 600, marginRight: '2px' }}>{label}:</span>
        {options.slice(0, 12).map(function(opt) {
          var on = sel.indexOf(opt) !== -1;
          return (
            <button key={opt} onClick={function() { onChange(on ? sel.filter(function(s) { return s !== opt; }) : sel.concat([opt])); }}
              style={{ padding: '3px 10px', fontSize: '11px', borderRadius: '14px', border: '1px solid ' + (on ? theme.accent : theme.border), background: on ? theme.accent : 'transparent', color: on ? '#fff' : theme.text, cursor: 'pointer', fontWeight: 600 }}>
              {opt}
            </button>
          );
        })}
        {onRemove && <button onClick={onRemove} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.subtext, fontSize: '12px' }}>✕</button>}
      </div>
    );
  }

  // ---- Daterange ----
  if (control === 'daterange') {
    var dv = (value || {}) as { preset?: string; from?: string; to?: string };
    var summaryD = dv.preset && dv.preset !== 'all'
      ? (DATE_PRESETS.find(function(p) { return p.value === dv.preset; })?.label || 'Custom')
      : (dv.from || dv.to ? (dv.from || '…') + ' → ' + (dv.to || '…') : 'All time');
    return (
      <Popover theme={theme} trigger={function(open, toggle) { return <PillTrigger label={'📅 ' + label} summary={summaryD} active={active} theme={theme} onRemove={onRemove} toggle={toggle} />; }}
        children={function() {
          return (
            <div style={{ padding: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                {DATE_PRESETS.map(function(p) {
                  var on = (dv.preset || 'all') === p.value;
                  return <button key={p.value} onClick={function() { onChange({ preset: p.value }); }}
                    style={{ padding: '5px 6px', fontSize: '11px', borderRadius: '6px', border: '1px solid ' + (on ? theme.accent : theme.border), background: on ? theme.accent + '22' : 'transparent', color: on ? theme.accent : theme.text, cursor: 'pointer', fontWeight: on ? 600 : 400 }}>{p.label}</button>;
                })}
              </div>
              <div style={{ borderTop: '1px solid ' + theme.border, paddingTop: '8px', display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
                <label style={{ fontSize: '10px', color: theme.subtext }}>Custom range</label>
                <input type="date" value={dv.from || ''} onChange={function(e) { onChange({ from: e.target.value, to: dv.to }); }} style={{ padding: '5px 8px', fontSize: '11px', border: '1px solid ' + theme.border, borderRadius: '6px', background: theme.cardBg, color: theme.text }} />
                <input type="date" value={dv.to || ''} onChange={function(e) { onChange({ from: dv.from, to: e.target.value }); }} style={{ padding: '5px 8px', fontSize: '11px', border: '1px solid ' + theme.border, borderRadius: '6px', background: theme.cardBg, color: theme.text }} />
              </div>
            </div>
          );
        }} />
    );
  }

  // ---- Dropdown (single-select) ----
  if (control === 'dropdown') {
    var selD = (value as string[]) || [];
    var summaryDd = selD.length ? selD[0] : 'All';
    return (
      <Popover theme={theme} trigger={function(open, toggle) { return <PillTrigger label={label} summary={summaryDd} active={active} theme={theme} onRemove={onRemove} toggle={toggle} />; }}
        children={function(close) {
          var filtered = search.trim() ? options.filter(function(o) { return o.toLowerCase().includes(search.toLowerCase()); }) : options;
          return (
            <>
              <div style={{ padding: '8px', borderBottom: '1px solid ' + theme.border }}>
                <input autoFocus value={search} onChange={function(e) { setSearch(e.target.value); }} placeholder="Search…" style={{ width: '100%', padding: '5px 8px', border: '1px solid ' + theme.border, borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' as const, background: theme.cardBg, color: theme.text }} />
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
                <div onClick={function() { onChange([]); close(); }} style={{ padding: '5px 12px', fontSize: '11px', cursor: 'pointer', color: theme.subtext }}>All</div>
                {filtered.map(function(opt) {
                  return <div key={opt} onClick={function() { onChange([opt]); close(); }} style={{ padding: '5px 12px', fontSize: '11px', cursor: 'pointer', color: theme.text, fontWeight: selD[0] === opt ? 700 : 400 }}>{opt}</div>;
                })}
              </div>
            </>
          );
        }} />
    );
  }

  // ---- Checklist / Search (multi-select) ----
  var selected = (value as string[]) || [];
  var allSelected = selected.length === 0;
  var noneSelected = selected.length === 1 && selected[0] === '__none__';
  var summaryC = allSelected ? 'All' : noneSelected ? 'None' : selected.length === 1 ? selected[0] : selected.length + ' selected';
  return (
    <Popover theme={theme} trigger={function(open, toggle) { return <PillTrigger label={label} summary={summaryC} active={active} theme={theme} onRemove={onRemove} toggle={toggle} />; }}
      children={function() {
        var filteredOpts = search.trim() ? options.filter(function(o) { return o.toLowerCase().includes(search.toLowerCase()); }) : options;
        return (
          <>
            <div style={{ padding: '8px', borderBottom: '1px solid ' + theme.border }}>
              <input autoFocus value={search} onChange={function(e) { setSearch(e.target.value); }} placeholder="Search values…" style={{ width: '100%', padding: '5px 8px', border: '1px solid ' + theme.border, borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' as const, background: theme.cardBg, color: theme.text }} />
            </div>
            <div style={{ padding: '6px 8px', borderBottom: '1px solid ' + theme.border, display: 'flex', gap: '8px', fontSize: '10px' }}>
              <button onClick={function() { onChange([]); }} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontWeight: 600 }}>Select all</button>
              <button onClick={function() { onChange(['__none__']); }} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Select none</button>
              {search.trim() && filteredOpts.length > 0 && <button onClick={function() { onChange(filteredOpts.slice()); }} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontWeight: 600 }}>Select {filteredOpts.length} visible</button>}
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '4px 0', maxHeight: '240px' }}>
              {filteredOpts.length === 0 && <div style={{ padding: '12px', fontSize: '11px', color: theme.subtext, textAlign: 'center' as const }}>No matches</div>}
              {filteredOpts.map(function(opt) {
                var checked = allSelected || selected.indexOf(opt) !== -1;
                if (noneSelected) checked = false;
                return (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', fontSize: '11px', cursor: 'pointer', color: theme.text }}>
                    <input type="checkbox" checked={checked} onChange={function() {
                      if (allSelected) { onChange([opt]); return; }
                      var current = noneSelected ? [] : selected;
                      if (current.indexOf(opt) === -1) onChange(current.concat([opt]));
                      else onChange(current.filter(function(s) { return s !== opt; }));
                    }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{opt}</span>
                  </label>
                );
              })}
            </div>
          </>
        );
      }} />
  );
}
