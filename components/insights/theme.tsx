// ============================================================
// components/insights/theme.tsx
// Shared visual constants + helpers for Agora Insights.
// One source of truth for colors, number formatting, axis ticks,
// and light/dark dashboard theming — used by the editor, view mode,
// and the public embed renderer alike.
// ============================================================

import React from 'react';

// Default categorical palette (also the "default" color theme).
export var COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];

export var COLOR_THEMES: Record<string, string[]> = {
  default: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'],
  blue: ['#1e3a5f', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#1d4ed8', '#1e40af', '#1e3a8a'],
  green: ['#064e3b', '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#047857', '#065f46', '#064e3b'],
  purple: ['#4c1d95', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#5b21b6', '#4c1d95', '#3b0764'],
  warm: ['#9a3412', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#dc2626', '#ef4444', '#f59e0b', '#eab308', '#ca8a04'],
  mono: ['#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb'],
};

export var NUMERIC_TYPES = ['number', 'currency', 'percent', 'rating', 'progress'];

// ---- Dashboard theming (light / dark) ----

export interface DashboardTheme {
  name: string;        // 'light' | 'dark'
  accent: string;      // primary accent color
  bg: string;          // page / canvas background
  panelBg: string;     // toolbar + filter bar background
  cardBg: string;      // widget card background
  text: string;        // primary text
  subtext: string;     // secondary text
  border: string;      // card / divider border
  gridStroke: string;  // chart gridlines
  axisColor: string;   // axis tick text
  tooltipBg: string;   // recharts tooltip background
  colors: string[];    // categorical palette (accent first)
}

var LIGHT = {
  name: 'light',
  bg: '#f3f4f6', panelBg: '#ffffff', cardBg: '#ffffff',
  text: '#111827', subtext: '#6b7280', border: '#e5e7eb',
  gridStroke: '#f0f0f0', axisColor: '#6b7280', tooltipBg: '#ffffff',
};
var DARK = {
  name: 'dark',
  bg: '#0f172a', panelBg: '#1e293b', cardBg: '#1e293b',
  text: '#f1f5f9', subtext: '#94a3b8', border: '#334155',
  gridStroke: '#334155', axisColor: '#94a3b8', tooltipBg: '#1e293b',
};

export function resolveTheme(name?: string, accent?: string): DashboardTheme {
  var base = name === 'dark' ? DARK : LIGHT;
  var ac = accent || '#3B82F6';
  // Accent leads the palette so the dominant series picks up the dashboard's accent color.
  var palette = [ac].concat(COLORS.filter(function(c) { return c.toLowerCase() !== ac.toLowerCase(); }));
  return {
    name: base.name,
    accent: ac,
    bg: base.bg, panelBg: base.panelBg, cardBg: base.cardBg,
    text: base.text, subtext: base.subtext, border: base.border,
    gridStroke: base.gridStroke, axisColor: base.axisColor, tooltipBg: base.tooltipBg,
    colors: palette,
  };
}

// Resolve the palette a widget should draw with: an explicit colorTheme wins,
// otherwise fall back to the dashboard theme's accent-led palette.
export function widgetColors(colorTheme: string | undefined, theme: DashboardTheme): string[] {
  if (colorTheme && colorTheme !== 'default' && COLOR_THEMES[colorTheme]) return COLOR_THEMES[colorTheme];
  return theme.colors;
}

// ---- Number formatting ----

// Axis / measure formatter. "number" = comma-separated, "compact" = 45K/1.2M,
// "currency" = $-prefixed compact, "percent" = N.N%.
export function formatYAxisValue(value: any, format: string): string {
  var num = Number(value);
  if (isNaN(num)) return String(value);
  if (format === 'percent') return num.toFixed(1) + '%';
  if (format === 'number') return num.toLocaleString();
  var prefix = format === 'currency' ? '$' : '';
  var abs = Math.abs(num);
  if (abs >= 1000000000) return prefix + (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (abs >= 1000000) return prefix + (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1000) return prefix + (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return prefix + num.toLocaleString();
}

// KPI headline formatter — fuller precision than the compact axis formatter.
export function formatKpiValue(value: any, format: string): string {
  var num = Number(value);
  if (isNaN(num)) return String(value);
  if (format === 'currency') return '$' + num.toLocaleString();
  if (format === 'percent') return num.toLocaleString() + '%';
  if (format === 'compact') return formatYAxisValue(num, 'compact');
  return num.toLocaleString();
}

// ---- Axis tick rendering ----

export var MAX_LABEL_CHARS = 18;

// Truncates long category labels on an axis; full label shows in the tooltip / <title>.
export function makeTruncatedTick(color: string) {
  return function renderTruncatedTick(props: any) {
    var payload = props.payload || {};
    var raw = String(payload.value || '');
    var display = raw.length > MAX_LABEL_CHARS ? raw.slice(0, MAX_LABEL_CHARS - 1) + '…' : raw;
    return (
      <g transform={'translate(' + props.x + ',' + props.y + ')'}>
        <text x={0} y={0} dy={4} textAnchor="end" transform="rotate(-45)" fontSize={10} fill={color}>
          <title>{raw}</title>
          {display}
        </text>
      </g>
    );
  };
}
