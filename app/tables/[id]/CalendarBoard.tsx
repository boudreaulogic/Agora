'use client';

import { useState, useEffect } from 'react';

interface CalendarProps {
  rows: any[];
  columns: any[];
  dateColumnId: string;
  tableId: string;
  onEventClick: (row: any) => void;
  onEventMove: (rowId: string, newDate: string) => void;
  bookingConfig?: { startColumnId: string; endColumnId: string; resourceColumnId: string } | null;
}

var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function CalendarBoard({
  rows,
  columns,
  dateColumnId,
  tableId,
  onEventClick,
  onEventMove,
  bookingConfig,
}: CalendarProps) {
  var today = new Date();
  var [currentMonth, setCurrentMonth] = useState(today.getMonth());
  var [currentYear, setCurrentYear] = useState(today.getFullYear());
  var [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  var [dragOverDate, setDragOverDate] = useState<string | null>(null);
  var [conflicts, setConflicts] = useState<Record<string, string[]>>({});

  var isBookingMode = !!bookingConfig;
  var startColId = bookingConfig?.startColumnId || dateColumnId;
  var endColId = bookingConfig?.endColumnId || '';
  var resourceColId = bookingConfig?.resourceColumnId || '';

  var dateColumn = columns.find(function(c: any) { return c.id === dateColumnId; });
  if (!dateColumn && !isBookingMode) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Date column not found. Please edit this view.
      </div>
    );
  }

  var titleColumn = columns.find(function(c: any) { return c.type === 'text' && c.id !== dateColumnId && c.id !== startColId && c.id !== endColId; }) || columns[0];
  var statusColumn = columns.find(function(c: any) { return c.type === 'select' && c.id !== dateColumnId && c.id !== resourceColId; });

  // Detect conflicts for booking mode
  useEffect(function() {
    if (!isBookingMode) return;
    var conflictMap: Record<string, string[]> = {};
    // Group by resource
    var byResource: Record<string, any[]> = {};
    rows.forEach(function(row) {
      var resource = row.data?.[resourceColId] || '__none';
      if (!byResource[resource]) byResource[resource] = [];
      byResource[resource].push(row);
    });
    // Check overlaps within each resource
    Object.keys(byResource).forEach(function(resource) {
      var bookings = byResource[resource];
      for (var a = 0; a < bookings.length; a++) {
        var aStart = new Date(bookings[a].data?.[startColId]);
        var aEnd = new Date(bookings[a].data?.[endColId]);
        if (isNaN(aStart.getTime()) || isNaN(aEnd.getTime())) continue;
        for (var b = a + 1; b < bookings.length; b++) {
          var bStart = new Date(bookings[b].data?.[startColId]);
          var bEnd = new Date(bookings[b].data?.[endColId]);
          if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) continue;
          if (aStart < bEnd && aEnd > bStart) {
            if (!conflictMap[bookings[a].id]) conflictMap[bookings[a].id] = [];
            if (!conflictMap[bookings[b].id]) conflictMap[bookings[b].id] = [];
            conflictMap[bookings[a].id].push(bookings[b].id);
            conflictMap[bookings[b].id].push(bookings[a].id);
          }
        }
      }
    });
    setConflicts(conflictMap);
  }, [rows, isBookingMode, startColId, endColId, resourceColId]);

  function goToPrevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  }
  function goToNextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  }
  function goToToday() { setCurrentMonth(today.getMonth()); setCurrentYear(today.getFullYear()); }

  function getCalendarDays() {
    var firstDay = new Date(currentYear, currentMonth, 1);
    var startDayOfWeek = firstDay.getDay();
    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    var days: { date: Date; isCurrentMonth: boolean }[] = [];
    var prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (var i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({ date: new Date(currentYear, currentMonth - 1, prevMonthLastDay - i), isCurrentMonth: false });
    }
    for (var d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(currentYear, currentMonth, d), isCurrentMonth: true });
    }
    var remaining = 42 - days.length;
    for (var r = 1; r <= remaining; r++) {
      days.push({ date: new Date(currentYear, currentMonth + 1, r), isCurrentMonth: false });
    }
    return days;
  }

  function formatDateKey(date: Date): string {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function isToday(date: Date): boolean { return formatDateKey(date) === formatDateKey(today); }

  // Get events for a specific date — supports both single-date and date-range
  function getEventsForDate(date: Date): any[] {
    var dateStr = formatDateKey(date);
    var dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    var dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);

    return rows.filter(function(row) {
      if (isBookingMode && endColId) {
        // Date range mode: event shows on all days between start and end
        var evStart = row.data?.[startColId];
        var evEnd = row.data?.[endColId];
        if (!evStart || !evEnd) return false;
        try {
          var s = new Date(evStart);
          var e = new Date(evEnd);
          // Event overlaps this day if: eventStart <= dayEnd AND eventEnd >= dayStart
          return s <= dayEnd && e >= dayStart;
        } catch { return false; }
      } else {
        // Single date mode
        var val = row.data?.[dateColumnId];
        if (!val) return false;
        try { return formatDateKey(new Date(val)) === dateStr; }
        catch { return false; }
      }
    });
  }

  // Determine if an event starts, continues, or ends on a given day
  function getEventDayPosition(row: any, date: Date): 'single' | 'start' | 'middle' | 'end' {
    if (!isBookingMode || !endColId) return 'single';
    var evStart = row.data?.[startColId];
    var evEnd = row.data?.[endColId];
    if (!evStart || !evEnd) return 'single';
    var s = formatDateKey(new Date(evStart));
    var e = formatDateKey(new Date(evEnd));
    var d = formatDateKey(date);
    if (s === e) return 'single';
    if (d === s) return 'start';
    if (d === e) return 'end';
    return 'middle';
  }

  function getEventColor(row: any): { bg: string; text: string; border: string } {
    // Conflict override — red
    if (conflicts[row.id]) {
      return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' };
    }

    if (!statusColumn) return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' };
    var val = row.data?.[statusColumn.id];
    if (!val) return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' };

    var rawOptions = statusColumn.settings?.options || [];
    var colors: Record<string, string> = Object.assign({}, statusColumn.settings?.colors || {});
    if (rawOptions.length > 0 && typeof rawOptions[0] === 'object') {
      rawOptions.forEach(function(opt: any) { if (opt.value && opt.color) colors[opt.value] = opt.color; });
    }

    var color = colors[val];
    var colorMap: Record<string, { bg: string; text: string; border: string }> = {
      red: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
      blue: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
      green: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
      yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' },
      purple: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
      pink: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-200' },
      orange: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
      teal: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200' },
      indigo: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
      gray: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' },
    };
    return colorMap[color] || { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' };
  }

  function handleDragStart(e: React.DragEvent, rowId: string) { setDraggedEventId(rowId); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', rowId); }
  function handleDragEnd() { setDraggedEventId(null); setDragOverDate(null); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  function handleDragEnter(e: React.DragEvent, dateKey: string) { e.preventDefault(); setDragOverDate(dateKey); }
  function handleDragLeave(e: React.DragEvent, dateKey: string) {
    var relatedTarget = e.relatedTarget as HTMLElement;
    var currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) { if (dragOverDate === dateKey) setDragOverDate(null); }
  }
  function handleDrop(e: React.DragEvent, dateKey: string) {
    e.preventDefault();
    var rowId = e.dataTransfer.getData('text/plain');
    if (rowId && draggedEventId) onEventMove(rowId, dateKey);
    setDraggedEventId(null); setDragOverDate(null);
  }

  var calendarDays = getCalendarDays();

  var monthEvents = rows.filter(function(row) {
    var monthStart = new Date(currentYear, currentMonth, 1);
    var monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    if (isBookingMode && endColId) {
      var evStart = row.data?.[startColId];
      var evEnd = row.data?.[endColId];
      if (!evStart || !evEnd) return false;
      try { var s = new Date(evStart); var e = new Date(evEnd); return s <= monthEnd && e >= monthStart; }
      catch { return false; }
    } else {
      var val = row.data?.[dateColumnId];
      if (!val) return false;
      try { var d = new Date(val); return d.getMonth() === currentMonth && d.getFullYear() === currentYear; }
      catch { return false; }
    }
  }).length;

  var conflictCount = Object.keys(conflicts).length;

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
      {/* Calendar Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{MONTHS[currentMonth]} {currentYear}</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">{monthEvents} event{monthEvents !== 1 ? 's' : ''}</span>
          {isBookingMode && (<span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Booking Mode</span>)}
          {conflictCount > 0 && (<span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full animate-pulse">⚠ {conflictCount / 2 | 0} conflict{(conflictCount / 2 | 0) !== 1 ? 's' : ''}</span>)}
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={goToToday} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">Today</button>
          <button onClick={goToPrevMonth} className="p-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={goToNextMonth} className="p-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {DAYS.map(function(day) {
          return (<div key={day} className="px-2 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{day}</div>);
        })}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto">
        {calendarDays.map(function(dayInfo, index) {
          var dateKey = formatDateKey(dayInfo.date);
          var events = getEventsForDate(dayInfo.date);
          var isTodayDate = isToday(dayInfo.date);
          var isDropTarget = dragOverDate === dateKey && draggedEventId !== null;
          var maxVisible = 3;
          var hasMore = events.length > maxVisible;

          return (
            <div key={index}
              className={'border-b border-r border-gray-200 dark:border-gray-700 p-1 min-h-[100px] transition-colors ' +
                (!dayInfo.isCurrentMonth ? 'bg-gray-50 dark:bg-gray-950' : 'bg-white dark:bg-gray-900') +
                (isDropTarget ? ' bg-blue-50 ring-1 ring-inset ring-blue-300' : '')}
              onDragOver={handleDragOver}
              onDragEnter={function(e) { handleDragEnter(e, dateKey); }}
              onDragLeave={function(e) { handleDragLeave(e, dateKey); }}
              onDrop={function(e) { handleDrop(e, dateKey); }}>
              {/* Date Number */}
              <div className="flex items-center justify-between mb-1">
                <span className={'inline-flex items-center justify-center w-6 h-6 text-xs rounded-full ' +
                  (isTodayDate ? 'bg-blue-600 text-white font-bold' :
                   dayInfo.isCurrentMonth ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400 dark:text-gray-600')}>
                  {dayInfo.date.getDate()}
                </span>
                {events.length > 0 && !isTodayDate && (<span className="text-xs text-gray-400 dark:text-gray-500">{events.length}</span>)}
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {events.slice(0, maxVisible).map(function(row) {
                  var title = row.data?.[titleColumn?.id];
                  var displayTitle = (title && typeof title !== 'object') ? String(title) : 'Untitled';
                  var colors = getEventColor(row);
                  var isDragging = draggedEventId === row.id;
                  var hasConflict = !!conflicts[row.id];
                  var position = getEventDayPosition(row, dayInfo.date);

                  // Resource label for booking mode
                  var resourceLabel = '';
                  if (isBookingMode && resourceColId) {
                    var rv = row.data?.[resourceColId];
                    if (rv) {
                      var resCol = columns.find(function(c: any) { return c.id === resourceColId; });
                      var opts = resCol?.settings?.options || [];
                      var opt = opts.find(function(o: any) { return o.value === rv; });
                      resourceLabel = opt ? opt.label : rv;
                    }
                  }

                  // Style based on position in range
                  var positionClass = '';
                  if (position === 'start') positionClass = ' rounded-r-none mr-0';
                  else if (position === 'middle') positionClass = ' rounded-none mx-0';
                  else if (position === 'end') positionClass = ' rounded-l-none ml-0';

                  return (
                    <div key={row.id}
                      draggable={position === 'single' || position === 'start'}
                      onDragStart={function(e) { handleDragStart(e, row.id); }}
                      onDragEnd={handleDragEnd}
                      onClick={function(e) { e.stopPropagation(); onEventClick(row); }}
                      className={'px-1.5 py-0.5 text-xs truncate cursor-pointer border transition-all hover:shadow-sm ' +
                        colors.bg + ' ' + colors.text + ' ' + colors.border + positionClass +
                        (isDragging ? ' opacity-40' : '') +
                        (hasConflict ? ' ring-2 ring-red-400 ring-offset-1' : '') +
                        (position !== 'single' ? ' rounded' : ' rounded')}
                      title={displayTitle + (resourceLabel ? ' — ' + resourceLabel : '') + (hasConflict ? ' ⚠ CONFLICT' : '')}>
                      {position === 'start' || position === 'single' ? (
                        <span className="flex items-center space-x-1">
                          {hasConflict && <span className="text-red-600">⚠</span>}
                          <span className="truncate">{displayTitle}</span>
                          {resourceLabel && position === 'single' && <span className="text-[9px] opacity-60">· {resourceLabel}</span>}
                        </span>
                      ) : position === 'end' ? (
                        <span className="text-[9px] opacity-60">{resourceLabel || '→'}</span>
                      ) : (
                        <span className="text-[9px] opacity-40">···</span>
                      )}
                    </div>
                  );
                })}
                {hasMore && (<div className="text-xs text-gray-500 dark:text-gray-400 px-1.5 font-medium">+{events.length - maxVisible} more</div>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}