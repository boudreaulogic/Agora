import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';

export const dynamic = 'force-dynamic';

// POST /api/tables/[id]/booking/conflicts — check for conflicts
// Body: { startDateTime, endDateTime, resourceValue, excludeRowId? }
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    var authResult = await authenticateRequest(request, params.id, 'read');
    if (authResult instanceof NextResponse) return authResult;

    var body = await request.json();
    var { startDateTime, endDateTime, resourceValue, excludeRowId } = body;

    if (!startDateTime || !endDateTime) {
      return NextResponse.json({ error: 'startDateTime and endDateTime are required' }, { status: 400 });
    }

    // Get booking config
    var table = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: { notificationTargets: true, enabledFeatures: true },
    });
    if (!table) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

    var features = (table.enabledFeatures as any) || [];
    if (!Array.isArray(features) || !features.includes('booking')) {
      return NextResponse.json({ error: 'Booking system is not installed on this table' }, { status: 400 });
    }

    var targets = (table.notificationTargets as any) || {};
    var config = targets.__bookingConfig;
    if (!config) {
      return NextResponse.json({ error: 'Booking configuration not found' }, { status: 400 });
    }

    var startColId = config.startColumnId;
    var endColId = config.endColumnId;
    var resourceColId = config.resourceColumnId;

    // Parse the check window
    var checkStart = new Date(startDateTime);
    var checkEnd = new Date(endDateTime);

    if (isNaN(checkStart.getTime()) || isNaN(checkEnd.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    if (checkEnd <= checkStart) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
    }

    // Get all rows from the table
    var allRows = await db.agoraRow.findMany({
      where: { tableId: params.id },
      select: { id: true, data: true },
    });

    // Find conflicts: overlapping time ranges for the same resource
    var conflicts: any[] = [];
    var columns = await db.agoraColumn.findMany({
      where: { tableId: params.id },
      select: { id: true, name: true, type: true },
    });

    // Build a column name map for display
    var colNameMap: Record<string, string> = {};
    columns.forEach(function(c) { colNameMap[c.id] = c.name; });

    // Get a display column (first text column that isn't system)
    var displayCol = columns.find(function(c) { return c.type === 'text'; });

    for (var i = 0; i < allRows.length; i++) {
      var row = allRows[i];

      // Skip the row we're editing (if updating an existing booking)
      if (excludeRowId && row.id === excludeRowId) continue;

      var rowData = row.data as any;
      if (!rowData) continue;

      var rowStart = rowData[startColId];
      var rowEnd = rowData[endColId];
      var rowResource = rowData[resourceColId];

      // Skip rows without dates
      if (!rowStart || !rowEnd) continue;

      // If resource filter is specified, only check same resource
      if (resourceValue && rowResource !== resourceValue) continue;

      var existingStart = new Date(rowStart);
      var existingEnd = new Date(rowEnd);

      if (isNaN(existingStart.getTime()) || isNaN(existingEnd.getTime())) continue;

      // Overlap check: existing.start < new.end AND existing.end > new.start
      if (existingStart < checkEnd && existingEnd > checkStart) {
        conflicts.push({
          rowId: row.id,
          resource: rowResource || 'Unknown',
          startDateTime: rowStart,
          endDateTime: rowEnd,
          displayName: displayCol ? (rowData[displayCol.id] || 'Untitled') : 'Booking',
          overlapType: getOverlapType(existingStart, existingEnd, checkStart, checkEnd),
        });
      }
    }

    return NextResponse.json({
      hasConflicts: conflicts.length > 0,
      conflictCount: conflicts.length,
      conflicts: conflicts,
      checkedRange: {
        start: startDateTime,
        end: endDateTime,
        resource: resourceValue || 'all',
      },
    });
  } catch (error: any) {
    console.error('[Booking Conflict Check Error]:', error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Conflict check failed' : error.message },
      { status: 500 }
    );
  }
}

// GET /api/tables/[id]/booking/conflicts — get all conflicts for a date range
// Query params: start, end, resource (optional)
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    var authResult = await authenticateRequest(request, params.id, 'read');
    if (authResult instanceof NextResponse) return authResult;

    var url = new URL(request.url);
    var startParam = url.searchParams.get('start');
    var endParam = url.searchParams.get('end');
    var resourceParam = url.searchParams.get('resource');

    // Get booking config
    var table = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: { notificationTargets: true, enabledFeatures: true },
    });
    if (!table) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

    var features = (table.enabledFeatures as any) || [];
    if (!Array.isArray(features) || !features.includes('booking')) {
      return NextResponse.json({ error: 'Booking system not installed' }, { status: 400 });
    }

    var targets = (table.notificationTargets as any) || {};
    var config = targets.__bookingConfig;
    if (!config) return NextResponse.json({ error: 'Booking config not found' }, { status: 400 });

    var startColId = config.startColumnId;
    var endColId = config.endColumnId;
    var resourceColId = config.resourceColumnId;

    var allRows = await db.agoraRow.findMany({
      where: { tableId: params.id },
      select: { id: true, data: true },
    });

    var columns = await db.agoraColumn.findMany({
      where: { tableId: params.id },
      select: { id: true, name: true, type: true },
    });
    var displayCol = columns.find(function(c) { return c.type === 'text'; });

    // Build a map of resource → bookings, checking for intra-resource overlaps
    var resourceBookings: Record<string, any[]> = {};

    for (var i = 0; i < allRows.length; i++) {
      var row = allRows[i];
      var rowData = row.data as any;
      if (!rowData) continue;

      var rowStart = rowData[startColId];
      var rowEnd = rowData[endColId];
      var rowResource = rowData[resourceColId] || 'Unassigned';

      if (!rowStart || !rowEnd) continue;

      // Filter by date range if provided
      if (startParam && endParam) {
        var filterStart = new Date(startParam);
        var filterEnd = new Date(endParam);
        var rStart = new Date(rowStart);
        var rEnd = new Date(rowEnd);
        if (rEnd <= filterStart || rStart >= filterEnd) continue;
      }

      // Filter by resource if provided
      if (resourceParam && rowResource !== resourceParam) continue;

      if (!resourceBookings[rowResource]) resourceBookings[rowResource] = [];
      resourceBookings[rowResource].push({
        rowId: row.id,
        startDateTime: rowStart,
        endDateTime: rowEnd,
        displayName: displayCol ? (rowData[displayCol.id] || 'Untitled') : 'Booking',
      });
    }

    // Find overlaps within each resource
    var allConflicts: any[] = [];
    Object.keys(resourceBookings).forEach(function(resource) {
      var bookings = resourceBookings[resource];
      for (var a = 0; a < bookings.length; a++) {
        for (var b = a + 1; b < bookings.length; b++) {
          var aStart = new Date(bookings[a].startDateTime);
          var aEnd = new Date(bookings[a].endDateTime);
          var bStart = new Date(bookings[b].startDateTime);
          var bEnd = new Date(bookings[b].endDateTime);

          if (aStart < bEnd && aEnd > bStart) {
            allConflicts.push({
              resource: resource,
              booking1: bookings[a],
              booking2: bookings[b],
              overlapType: getOverlapType(aStart, aEnd, bStart, bEnd),
            });
          }
        }
      }
    });

    return NextResponse.json({
      hasConflicts: allConflicts.length > 0,
      conflictCount: allConflicts.length,
      conflicts: allConflicts,
      bookingsByResource: resourceBookings,
    });
  } catch (error: any) {
    console.error('[Booking Conflicts GET Error]:', error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Failed to check conflicts' : error.message },
      { status: 500 }
    );
  }
}

function getOverlapType(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): string {
  if (aStart <= bStart && aEnd >= bEnd) return 'contains';
  if (bStart <= aStart && bEnd >= aEnd) return 'contained_by';
  if (aStart < bStart) return 'overlaps_end';
  return 'overlaps_start';
}