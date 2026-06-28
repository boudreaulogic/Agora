'use client';

import { useState, useMemo, useRef } from 'react';

interface GanttChartProps {
  rows: any[];
  columns: any[];
  startColumnId: string;
  endColumnId?: string;
  tableId: string;
  onBarClick?: (row: any) => void;
  onBarMove?: (rowId: string, newStart: string, newEnd: string) => void;
}

var DAY_WIDTH = 32;
var ROW_HEIGHT = 36;
var HEADER_HEIGHT = 60;
var LABEL_WIDTH = 200;

var BAR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

function getColor(index: number): string {
  return BAR_COLORS[index % BAR_COLORS.length];
}

function parseDate(val: any): Date | null {
  if (!val) return null;
  var d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(d: Date, n: number): Date {
  var result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function toDateString(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function GanttChart({ rows, columns, startColumnId, endColumnId, tableId, onBarClick, onBarMove }: GanttChartProps) {
  var [zoomLevel, setZoomLevel] = useState<'day'|'week'|'month'>('day');
  var [scrollLeft, setScrollLeft] = useState(0);
  var scrollRef = useRef<HTMLDivElement>(null);

  var dayWidth = zoomLevel === 'day' ? DAY_WIDTH : zoomLevel === 'week' ? 12 : 4;

  // Get the first text/select column for labels
  var labelColumn = columns.find(function(c: any) {
    return c.type === 'text' || c.type === 'select';
  });

  // Parse rows into gantt items
  var items = useMemo(function() {
    return rows.map(function(row, index) {
      var start = parseDate(row.data[startColumnId]);
      var end = endColumnId ? parseDate(row.data[endColumnId]) : null;
      if (!end && start) end = addDays(start, 1);
      var label = labelColumn ? (row.data[labelColumn.id] || 'Row ' + (index + 1)) : 'Row ' + (index + 1);
      return { row: row, start: start, end: end, label: String(label), color: getColor(index) };
    }).filter(function(item) { return item.start !== null; });
  }, [rows, startColumnId, endColumnId, labelColumn]);

  // Calculate date range
  var dateRange = useMemo(function() {
    if (items.length === 0) {
      var today = new Date();
      return { minDate: addDays(today, -7), maxDate: addDays(today, 30), totalDays: 37 };
    }
    var dates: Date[] = [];
    items.forEach(function(item) {
      if (item.start) dates.push(item.start);
      if (item.end) dates.push(item.end);
    });
    var min = new Date(Math.min.apply(null, dates.map(function(d) { return d.getTime(); })));
    var max = new Date(Math.max.apply(null, dates.map(function(d) { return d.getTime(); })));
    // Add padding
    var minDate = addDays(min, -3);
    var maxDate = addDays(max, 7);
    var totalDays = daysBetween(minDate, maxDate) + 1;
    return { minDate: minDate, maxDate: maxDate, totalDays: totalDays };
  }, [items]);

  // Generate day headers
  var dayHeaders = useMemo(function() {
    var headers: { date: Date; label: string; isWeekend: boolean; isFirstOfMonth: boolean; month: string }[] = [];
    for (var i = 0; i < dateRange.totalDays; i++) {
      var d = addDays(dateRange.minDate, i);
      var dayOfWeek = d.getDay();
      var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      headers.push({
        date: d,
        label: String(d.getDate()),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isFirstOfMonth: d.getDate() === 1,
        month: months[d.getMonth()] + ' ' + d.getFullYear(),
      });
    }
    return headers;
  }, [dateRange]);

  // Group headers by month
  var monthHeaders = useMemo(function() {
    var months: { label: string; startIndex: number; span: number }[] = [];
    var currentMonth = '';
    dayHeaders.forEach(function(day, index) {
      var monthKey = day.date.getFullYear() + '-' + day.date.getMonth();
      if (monthKey !== currentMonth) {
        currentMonth = monthKey;
        months.push({ label: day.month, startIndex: index, span: 1 });
      } else {
        months[months.length - 1].span++;
      }
    });
    return months;
  }, [dayHeaders]);

  var chartWidth = dateRange.totalDays * dayWidth;
  var chartHeight = items.length * ROW_HEIGHT;

  // Today line position
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var todayOffset = daysBetween(dateRange.minDate, today);
  var showTodayLine = todayOffset >= 0 && todayOffset <= dateRange.totalDays;

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    setScrollLeft((e.target as HTMLDivElement).scrollLeft);
  }

  if (items.length === 0) {
    return (
      <div className="dark:text-gray-400 dark:bg-gray-900" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', color: '#6b7280' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>═</div>
        <p className="dark:text-gray-300" style={{ fontSize: '16px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>No items to show</p>
        <p style={{ fontSize: '13px' }}>Add rows with date values to see them on the Gantt chart.</p>
      </div>
    );
  }

  return (
    <div className="dark:bg-gray-900 dark:[color-scheme:dark]" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#ffffff' }}>
      {/* Toolbar */}
      <div className="dark:bg-gray-800 dark:border-gray-700" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#e5e7eb', borderRadius: '6px', padding: '2px' }}>
          {(['day', 'week', 'month'] as const).map(function(level) {
            return (
              <button key={level} onClick={function() { setZoomLevel(level); }}
                style={{ padding: '4px 12px', fontSize: '11px', fontWeight: zoomLevel === level ? 600 : 400, borderRadius: '4px', border: 'none', cursor: 'pointer', background: zoomLevel === level ? '#ffffff' : 'transparent', color: zoomLevel === level ? '#111827' : '#6b7280', boxShadow: zoomLevel === level ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            );
          })}
        </div>
        <button onClick={function() {
          if (scrollRef.current && showTodayLine) {
            scrollRef.current.scrollLeft = todayOffset * dayWidth - scrollRef.current.clientWidth / 2;
          }
        }} style={{ padding: '4px 12px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#ffffff', cursor: 'pointer', color: '#374151' }}>
          Today
        </button>
      </div>

      {/* Chart area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Row labels (fixed) */}
        <div className="dark:bg-gray-900 dark:border-gray-700" style={{ width: LABEL_WIDTH + 'px', flexShrink: 0, borderRight: '2px solid #e5e7eb', background: '#ffffff', overflow: 'hidden' }}>
          {/* Label header */}
          <div className="dark:bg-gray-800 dark:border-gray-700" style={{ height: HEADER_HEIGHT + 'px', display: 'flex', alignItems: 'flex-end', padding: '0 12px 8px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Task</span>
          </div>
          {/* Row labels */}
          <div style={{ overflowY: 'hidden' }}>
            {items.map(function(item, index) {
              return (
                <div key={item.row.id} onClick={function() { if (onBarClick) onBarClick(item.row); }}
                  style={{ height: ROW_HEIGHT + 'px', display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, marginRight: '8px', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline (scrollable) */}
        <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <div style={{ width: chartWidth + 'px', minHeight: '100%' }}>
            {/* Date headers */}
            <div className="dark:bg-gray-800 dark:border-gray-700" style={{ height: HEADER_HEIGHT + 'px', position: 'sticky', top: 0, zIndex: 5, background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {/* Month row */}
              <div style={{ display: 'flex', height: '30px' }}>
                {monthHeaders.map(function(month, i) {
                  return (
                    <div key={i} style={{ width: (month.span * dayWidth) + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, color: '#374151', borderRight: '1px solid #e5e7eb', overflow: 'hidden' }}>
                      {month.span * dayWidth > 60 ? month.label : ''}
                    </div>
                  );
                })}
              </div>
              {/* Day row */}
              <div style={{ display: 'flex', height: '30px' }}>
                {dayHeaders.map(function(day, i) {
                  return (
                    <div key={i} style={{ width: dayWidth + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: day.isWeekend ? '#d1d5db' : '#9ca3af', borderRight: '1px solid #f3f4f6', background: day.isWeekend ? '#fafafa' : 'transparent' }}>
                      {dayWidth >= 20 ? day.label : ''}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bars area */}
            <div style={{ position: 'relative' }}>
              {/* Grid lines */}
              {dayHeaders.map(function(day, i) {
                return (
                  <div key={i} style={{ position: 'absolute', left: (i * dayWidth) + 'px', top: 0, width: '1px', height: Math.max(chartHeight, 400) + 'px', background: day.isWeekend ? '#f3f4f6' : (day.isFirstOfMonth ? '#e5e7eb' : '#f9fafb') }} />
                );
              })}

              {/* Weekend shading */}
              {dayHeaders.map(function(day, i) {
                if (!day.isWeekend) return null;
                return (
                  <div key={'bg' + i} style={{ position: 'absolute', left: (i * dayWidth) + 'px', top: 0, width: dayWidth + 'px', height: Math.max(chartHeight, 400) + 'px', background: 'rgba(0,0,0,0.02)' }} />
                );
              })}

              {/* Today line */}
              {showTodayLine && (
                <div style={{ position: 'absolute', left: (todayOffset * dayWidth) + 'px', top: 0, width: '2px', height: Math.max(chartHeight, 400) + 'px', background: '#EF4444', zIndex: 3 }}>
                  <div style={{ position: 'absolute', top: '-4px', left: '-4px', width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444' }} />
                </div>
              )}

              {/* Row backgrounds */}
              {items.map(function(item, index) {
                return (
                  <div key={'row' + item.row.id} style={{ position: 'absolute', left: 0, top: (index * ROW_HEIGHT) + 'px', width: '100%', height: ROW_HEIGHT + 'px', borderBottom: '1px solid #f3f4f6' }} />
                );
              })}

              {/* Bars */}
              {items.map(function(item, index) {
                if (!item.start || !item.end) return null;
                var startOffset = daysBetween(dateRange.minDate, item.start);
                var duration = Math.max(daysBetween(item.start, item.end), 1);
                var left = startOffset * dayWidth;
                var width = Math.max(duration * dayWidth, dayWidth);

                return (
                  <div key={item.row.id}
                    onClick={function() { if (onBarClick) onBarClick(item.row); }}
                    style={{ position: 'absolute', left: left + 'px', top: (index * ROW_HEIGHT + 6) + 'px', width: width + 'px', height: (ROW_HEIGHT - 12) + 'px', background: item.color, borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', paddingLeft: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', transition: 'opacity 0.15s', zIndex: 2 }}
                    onMouseEnter={function(e) { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                    onMouseLeave={function(e) { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    title={item.label + '\n' + formatDate(item.start) + ' → ' + formatDate(item.end) + '\n' + duration + ' day' + (duration !== 1 ? 's' : '')}
                  >
                    {width > 60 && (
                      <span style={{ fontSize: '10px', color: '#ffffff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}