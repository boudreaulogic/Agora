'use client';

import { useState } from 'react';

interface CalendarProps {
  rows: any[];
  columns: any[];
  dateColumnId: string;
  tableId: string;
  onEventClick: (row: any) => void;
  onEventMove: (rowId: string, newDate: string) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
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
}: CalendarProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const dateColumn = columns.find((c: any) => c.id === dateColumnId);
  if (!dateColumn) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Date column not found. Please edit this view.
      </div>
    );
  }

  // Get the title column (first text column)
  const titleColumn = columns.find(
    (c: any) => c.type === 'text' && c.id !== dateColumnId
  ) || columns[0];

  // Find a select/status column for color coding
  const statusColumn = columns.find(
    (c: any) => (c.type === 'select') && c.id !== dateColumnId
  );

  // Navigation
  function goToPrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  function goToToday() {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  }

  // Build calendar grid
  function getCalendarDays() {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(currentYear, currentMonth - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        date: new Date(currentYear, currentMonth, d),
        isCurrentMonth: true,
      });
    }

    // Next month padding (fill to 42 cells for 6 rows)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(currentYear, currentMonth + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }

  // Get events for a specific date
  function getEventsForDate(date: Date): any[] {
    const dateStr = formatDateKey(date);
    return rows.filter((row) => {
      const val = row.data?.[dateColumnId];
      if (!val) return false;
      try {
        const rowDate = new Date(val);
        return formatDateKey(rowDate) === dateStr;
      } catch {
        return false;
      }
    });
  }

  function formatDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function isToday(date: Date): boolean {
    return formatDateKey(date) === formatDateKey(today);
  }

  // Get color for an event based on status column
  function getEventColor(row: any): { bg: string; text: string; border: string } {
    if (!statusColumn) return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' };
    
    const val = row.data?.[statusColumn.id];
    if (!val) return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' };

    const rawOptions = statusColumn.settings?.options || [];
    const colors: Record<string, string> = { ...(statusColumn.settings?.colors || {}) };
    if (rawOptions.length > 0 && typeof rawOptions[0] === 'object') {
      rawOptions.forEach((opt: any) => {
        if (opt.value && opt.color) colors[opt.value] = opt.color;
      });
    }

    const color = colors[val];
    const colorMap: Record<string, { bg: string; text: string; border: string }> = {
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

  // Drag handlers
  function handleDragStart(e: React.DragEvent, rowId: string) {
    setDraggedEventId(rowId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', rowId);
  }

  function handleDragEnd() {
    setDraggedEventId(null);
    setDragOverDate(null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDragEnter(e: React.DragEvent, dateKey: string) {
    e.preventDefault();
    setDragOverDate(dateKey);
  }

  function handleDragLeave(e: React.DragEvent, dateKey: string) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      if (dragOverDate === dateKey) {
        setDragOverDate(null);
      }
    }
  }

  function handleDrop(e: React.DragEvent, dateKey: string) {
    e.preventDefault();
    const rowId = e.dataTransfer.getData('text/plain');
    if (rowId && draggedEventId) {
      onEventMove(rowId, dateKey);
    }
    setDraggedEventId(null);
    setDragOverDate(null);
  }

  const calendarDays = getCalendarDays();

  // Count total events this month
  const monthEvents = rows.filter((row) => {
    const val = row.data?.[dateColumnId];
    if (!val) return false;
    try {
      const d = new Date(val);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    } catch {
      return false;
    }
  }).length;

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Calendar Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-gray-900">
            {MONTHS[currentMonth]} {currentYear}
          </h2>
          <span className="text-sm text-gray-500">
            {monthEvents} event{monthEvents !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Today
          </button>
          <button
            onClick={goToPrevMonth}
            className="p-1.5 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToNextMonth}
            className="p-1.5 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto">
        {calendarDays.map((dayInfo, index) => {
          const dateKey = formatDateKey(dayInfo.date);
          const events = getEventsForDate(dayInfo.date);
          const isTodayDate = isToday(dayInfo.date);
          const isDropTarget = dragOverDate === dateKey && draggedEventId !== null;
          const maxVisible = 3;
          const hasMore = events.length > maxVisible;

          return (
            <div
              key={index}
              className={`border-b border-r border-gray-200 p-1 min-h-[100px] transition-colors ${
                !dayInfo.isCurrentMonth ? 'bg-gray-50' : 'bg-white'
              } ${isDropTarget ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, dateKey)}
              onDragLeave={(e) => handleDragLeave(e, dateKey)}
              onDrop={(e) => handleDrop(e, dateKey)}
            >
              {/* Date Number */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 text-xs rounded-full ${
                    isTodayDate
                      ? 'bg-blue-600 text-white font-bold'
                      : dayInfo.isCurrentMonth
                        ? 'text-gray-900 font-medium'
                        : 'text-gray-400'
                  }`}
                >
                  {dayInfo.date.getDate()}
                </span>
                {events.length > 0 && !isTodayDate && (
                  <span className="text-xs text-gray-400">{events.length}</span>
                )}
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {events.slice(0, maxVisible).map((row) => {
                  const title = row.data?.[titleColumn?.id];
                  const displayTitle = (title && typeof title !== 'object') ? String(title) : 'Untitled';
                  const colors = getEventColor(row);
                  const isDragging = draggedEventId === row.id;

                  return (
                    <div
                      key={row.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, row.id)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(row);
                      }}
                      className={`px-1.5 py-0.5 rounded text-xs truncate cursor-pointer border transition-all hover:shadow-sm ${colors.bg} ${colors.text} ${colors.border} ${
                        isDragging ? 'opacity-40' : ''
                      }`}
                      title={displayTitle}
                    >
                      {displayTitle}
                    </div>
                  );
                })}
                {hasMore && (
                  <div className="text-xs text-gray-500 px-1.5 font-medium">
                    +{events.length - maxVisible} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}