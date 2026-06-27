'use client';

// ============================================================
// components/insights/useDashboardData.ts
// The interaction brain shared by the editor, view mode, and embed.
// Owns: per-widget query data, the live slicer state (incl. ephemeral
// cross-filters), per-widget live-sort overrides, distinct-value options,
// and the auth-vs-embed endpoint switch. Slicer/cross-filter changes are
// ephemeral (anonymous embed viewers never mutate the saved dashboard).
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { slicerToFilters, SlicerValue } from './Slicer';
import { resolveTheme, DashboardTheme } from './theme';

export interface WidgetData { id: string; name: string; type: string; dataConfig: any; vizConfig: any; layoutX: number; layoutY: number; layoutW: number; layoutH: number; sortOrder: number; }

interface SlicerEntry { tableId: string; columnId: string; control: string; value: SlicerValue; ephemeral?: boolean; }

function iso(d: Date): string { return d.toISOString().split('T')[0]; }

// Current vs previous period windows for KPI comparison (vs last month/quarter/year).
function periodWindows(period: string): { cur: { from: string; to: string }; prev: { from: string; to: string } } {
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  if (period === 'year') {
    return { cur: { from: iso(new Date(y, 0, 1)), to: iso(now) }, prev: { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) } };
  }
  if (period === 'quarter') {
    var q = Math.floor(m / 3);
    return { cur: { from: iso(new Date(y, q * 3, 1)), to: iso(now) }, prev: { from: iso(new Date(y, (q - 1) * 3, 1)), to: iso(new Date(y, q * 3, 0)) } };
  }
  // month (default)
  return { cur: { from: iso(new Date(y, m, 1)), to: iso(now) }, prev: { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) } };
}

function dateBetween(columnId: string, from: string, to: string): any[] {
  return [
    { columnId: columnId, operator: 'gte', value: from },
    { columnId: columnId, operator: 'lte', value: to + 'T23:59:59.999Z' },
  ];
}

export interface UseDashboardDataResult {
  data: Record<string, any>;
  slicerState: Record<string, SlicerEntry>;
  options: Record<string, string[]>;
  loading: Record<string, boolean>;
  theme: DashboardTheme;
  anyFilterActive: boolean;
  setSlicerValue: (slicerId: string, value: SlicerValue) => void;
  removeSlicer: (slicerId: string) => void;
  clearAllSlicers: () => void;
  crossFilter: (sourceWidget: WidgetData, label: string) => void;
  setWidgetSort: (widgetId: string, orderBy: { field: string; direction: 'asc' | 'desc' } | null) => void;
  sortOverrides: Record<string, { field: string; direction: 'asc' | 'desc' }>;
  refetchWidget: (widget: WidgetData) => void;
  refetchAll: () => void;
}

export function useDashboardData(args: {
  dashboardId: string;
  widgets: WidgetData[];
  mode: 'auth' | 'embed';
  embedToken?: string;
}): UseDashboardDataResult {
  var { dashboardId, widgets, mode, embedToken } = args;

  var [data, setData] = useState<Record<string, any>>({});
  var [slicerState, setSlicerState] = useState<Record<string, SlicerEntry>>({});
  var [options, setOptions] = useState<Record<string, string[]>>({});
  var [loading, setLoading] = useState<Record<string, boolean>>({});
  var [sortOverrides, setSortOverrides] = useState<Record<string, { field: string; direction: 'asc' | 'desc' }>>({});

  // Keep a live ref of slicer/sort state so async fetches never read stale values.
  var slicerRef = useRef(slicerState); slicerRef.current = slicerState;
  var sortRef = useRef(sortOverrides); sortRef.current = sortOverrides;

  // ---- Derive widget partitions + theme from props ----
  var dataWidgets = useMemo(function() {
    return widgets.filter(function(w) { return w.type !== 'slicer' && w.type !== '_settings' && w.type !== 'text'; });
  }, [widgets]);
  var slicerWidgets = useMemo(function() { return widgets.filter(function(w) { return w.type === 'slicer'; }); }, [widgets]);
  var theme = useMemo(function() {
    var settings = widgets.find(function(w) { return w.type === '_settings'; });
    var vc = (settings && settings.vizConfig) || {};
    return resolveTheme(vc.theme, vc.accent);
  }, [widgets]);

  // ---- The query call (endpoint differs by mode) ----
  var runQuery = useCallback(async function(body: any): Promise<any | null> {
    try {
      var url = mode === 'embed' ? '/api/insights/embed-query' : '/api/insights/query';
      var payload = mode === 'embed' ? Object.assign({ token: embedToken, dashboardId: dashboardId }, body) : body;
      var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }, [mode, embedToken, dashboardId]);

  // ---- Build the effective filters for a widget from the current slicer snapshot ----
  var buildFilters = useCallback(function(widget: WidgetData, snapshot: Record<string, SlicerEntry>): any[] {
    var dc = widget.dataConfig || {};
    var out: any[] = [];
    Object.keys(snapshot).forEach(function(id) {
      var s = snapshot[id];
      if (s.tableId !== dc.tableId) return;
      var f = slicerToFilters(s.columnId, s.control, s.value);
      for (var i = 0; i < f.length; i++) out.push(f[i]);
    });
    if (dc.filters && Array.isArray(dc.filters)) out = dc.filters.concat(out);
    return out;
  }, []);

  // ---- Fetch one widget's data ----
  var fetchWidget = useCallback(async function(widget: WidgetData, snapshot: Record<string, SlicerEntry>) {
    var dc = widget.dataConfig || {};
    var vc = widget.vizConfig || {};
    if (!dc.tableId) return;
    var filters = buildFilters(widget, snapshot);

    var body: any;
    if (widget.type === 'kpi_card' || widget.type === 'gauge') {
      body = { type: 'kpi', tableId: dc.tableId, columnId: dc.columnId || '*', function: dc.function || 'count', filters: filters };
      if (widget.type === 'kpi_card') {
        if (vc.sparklineDateColumn) body.sparkline = { dateColumnId: vc.sparklineDateColumn, dateGrouping: vc.sparklineGrain || 'month' };
        if (vc.comparePeriod && vc.comparePeriod !== 'none' && vc.compareDateColumn) {
          var w = periodWindows(vc.comparePeriod);
          body.filters = filters.concat(dateBetween(vc.compareDateColumn, w.cur.from, w.cur.to));
          body.compareFilters = filters.concat(dateBetween(vc.compareDateColumn, w.prev.from, w.prev.to));
        }
      }
    } else {
      var orderBy = sortRef.current[widget.id] || dc.orderBy || (dc.groupBy ? { field: 'value', direction: 'desc' } : undefined);
      body = {
        tableId: dc.tableId,
        groupBy: dc.groupBy || undefined,
        dateGrouping: dc.dateGrouping || undefined,
        series: dc.series || undefined,
        seriesDateGrouping: dc.seriesDateGrouping || undefined,
        seriesLimit: dc.seriesLimit || undefined,
        aggregations: [{ columnId: dc.columnId || '*', function: dc.function || 'count', alias: 'value' }],
        filters: filters,
        orderBy: orderBy,
        limit: dc.limit || undefined,
      };
    }

    setLoading(function(p) { var n = Object.assign({}, p); n[widget.id] = true; return n; });
    var result = await runQuery(body);
    setLoading(function(p) { var n = Object.assign({}, p); n[widget.id] = false; return n; });
    if (result) setData(function(p) { var n = Object.assign({}, p); n[widget.id] = result; return n; });
  }, [buildFilters, runQuery]);

  // ---- Reconcile slicer state when slicer widgets change (preserve live values & ephemerals) ----
  var slicerSig = slicerWidgets.map(function(s) { return s.id + ':' + (s.dataConfig?.columnId || '') + ':' + (s.dataConfig?.control || ''); }).join('|');
  useEffect(function() {
    setSlicerState(function(prev) {
      var next: Record<string, SlicerEntry> = {};
      // keep ephemeral cross-filter entries
      Object.keys(prev).forEach(function(id) { if (prev[id].ephemeral) next[id] = prev[id]; });
      slicerWidgets.forEach(function(sw) {
        var dc = sw.dataConfig || {};
        var existing = prev[sw.id];
        var control = dc.control || 'checklist';
        var defaultVal: SlicerValue = control === 'daterange' ? ((sw.vizConfig && sw.vizConfig.defaultValue) || {}) : ((sw.vizConfig && sw.vizConfig.defaultValue) || []);
        next[sw.id] = { tableId: dc.tableId, columnId: dc.columnId, control: control, value: existing ? existing.value : defaultVal };
      });
      return next;
    });
  }, [slicerSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Load distinct options for value slicers ----
  useEffect(function() {
    slicerWidgets.forEach(function(sw) {
      var dc = sw.dataConfig || {};
      if (!dc.tableId || !dc.columnId || dc.control === 'daterange') return;
      if (options[sw.id]) return;
      runQuery({ type: 'distinct', tableId: dc.tableId, columnId: dc.columnId }).then(function(res) {
        if (res && res.values) setOptions(function(p) { var n = Object.assign({}, p); n[sw.id] = res.values; return n; });
      });
    });
  }, [slicerSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Initial / incremental data load: fetch any data widget we don't have yet ----
  var dataSig = dataWidgets.map(function(w) { return w.id; }).join('|');
  useEffect(function() {
    var snap = slicerRef.current;
    dataWidgets.forEach(function(w) { if (!data[w.id]) fetchWidget(w, snap); });
  }, [dataSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Actions ----
  var refetchWidget = useCallback(function(widget: WidgetData) { fetchWidget(widget, slicerRef.current); }, [fetchWidget]);
  var refetchAll = useCallback(function() { var snap = slicerRef.current; dataWidgets.forEach(function(w) { fetchWidget(w, snap); }); }, [fetchWidget, dataWidgets]);

  function refetchForTable(snapshot: Record<string, SlicerEntry>, tableId: string | null) {
    dataWidgets.forEach(function(w) {
      if (tableId === null || (w.dataConfig && w.dataConfig.tableId === tableId)) fetchWidget(w, snapshot);
    });
  }

  // Actions read the live ref, commit next state, then fetch OUTSIDE the updater
  // (never trigger a fetch's setState from inside another component's render).
  var setSlicerValue = useCallback(function(slicerId: string, value: SlicerValue) {
    var entry = slicerRef.current[slicerId];
    if (!entry) return;
    var next = Object.assign({}, slicerRef.current); next[slicerId] = Object.assign({}, entry, { value: value });
    slicerRef.current = next; setSlicerState(next);
    refetchForTable(next, entry.tableId);
  }, [dataWidgets, fetchWidget]);

  var crossFilter = useCallback(function(sourceWidget: WidgetData, label: string) {
    var dc = sourceWidget.dataConfig || {};
    if (!dc.groupBy || !dc.tableId) return;
    var id = 'xf:' + dc.tableId + ':' + dc.groupBy;
    var next = Object.assign({}, slicerRef.current);
    var cur = next[id];
    var already = cur && Array.isArray(cur.value) && cur.value.length === 1 && cur.value[0] === label;
    if (already) delete next[id];
    else next[id] = { tableId: dc.tableId, columnId: dc.groupBy, control: 'checklist', value: [label], ephemeral: true };
    slicerRef.current = next; setSlicerState(next);
    refetchForTable(next, dc.tableId);
  }, [dataWidgets, fetchWidget]);

  var removeSlicer = useCallback(function(slicerId: string) {
    var entry = slicerRef.current[slicerId];
    if (!entry) return;
    var next = Object.assign({}, slicerRef.current);
    if (entry.ephemeral) delete next[slicerId];
    else next[slicerId] = Object.assign({}, entry, { value: entry.control === 'daterange' ? {} : [] });
    slicerRef.current = next; setSlicerState(next);
    refetchForTable(next, entry.tableId);
  }, [dataWidgets, fetchWidget]);

  var clearAllSlicers = useCallback(function() {
    var next: Record<string, SlicerEntry> = {};
    Object.keys(slicerRef.current).forEach(function(id) {
      if (slicerRef.current[id].ephemeral) return; // drop cross-filters entirely
      next[id] = Object.assign({}, slicerRef.current[id], { value: slicerRef.current[id].control === 'daterange' ? {} : [] });
    });
    slicerRef.current = next; setSlicerState(next);
    refetchForTable(next, null);
  }, [dataWidgets, fetchWidget]);

  var setWidgetSort = useCallback(function(widgetId: string, orderBy: { field: string; direction: 'asc' | 'desc' } | null) {
    var next = Object.assign({}, sortRef.current);
    if (orderBy) next[widgetId] = orderBy; else delete next[widgetId];
    sortRef.current = next; setSortOverrides(next);
    var widget = dataWidgets.find(function(w) { return w.id === widgetId; });
    if (widget) fetchWidget(widget, slicerRef.current);
  }, [dataWidgets, fetchWidget]);

  var anyFilterActive = useMemo(function() {
    return Object.keys(slicerState).some(function(id) {
      var s = slicerState[id];
      if (s.control === 'daterange') { var v = s.value as any; return !!(v && ((v.preset && v.preset !== 'all') || v.from || v.to)); }
      return Array.isArray(s.value) && s.value.length > 0;
    });
  }, [slicerState]);

  return {
    data, slicerState, options, loading, theme, anyFilterActive,
    setSlicerValue, removeSlicer, clearAllSlicers, crossFilter, setWidgetSort, sortOverrides, refetchWidget, refetchAll,
  };
}
