import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';
import { logActivity } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

// POST /api/tables/[id]/booking/install — install booking system on a table
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    var session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    var permission = await getTablePermission((session.user as any).id, params.id);
    if (permission !== 'owner' && permission !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Check if already installed
    var table = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: { enabledFeatures: true },
    });
    if (!table) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

    var features = (table.enabledFeatures as any) || [];
    if (Array.isArray(features) && features.includes('booking')) {
      return NextResponse.json({ error: 'Booking system is already installed on this table' }, { status: 400 });
    }

    // Parse custom column names from request
    var body = await request.json();
    var startName = body.startColumnName?.trim() || 'Start Date/Time';
    var endName = body.endColumnName?.trim() || 'End Date/Time';
    var resourceName = body.resourceColumnName?.trim() || 'Resource';
    var resourceOptions = body.resourceOptions || [];

    // Get max position for new columns
    var maxCol = await db.agoraColumn.findFirst({
      where: { tableId: params.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    var nextPos = (maxCol?.position ?? -1) + 1;

    // Create the 3 booking columns (system flag stored in settings JSON)
    var startCol = await db.agoraColumn.create({
      data: {
        tableId: params.id,
        name: startName,
        type: 'datetime',
        position: nextPos,
        required: true,
        settings: { bookingRole: 'start', isSystem: true },
      },
    });

    var endCol = await db.agoraColumn.create({
      data: {
        tableId: params.id,
        name: endName,
        type: 'datetime',
        position: nextPos + 1,
        required: true,
        settings: { bookingRole: 'end', isSystem: true },
      },
    });

    // Build resource options if provided
    var resourceSettings: any = { bookingRole: 'resource', isSystem: true };
    if (resourceOptions.length > 0) {
      resourceSettings.options = resourceOptions.map(function(opt: string, i: number) {
        return { value: opt.toLowerCase().replace(/\s+/g, '_'), label: opt, color: getColor(i) };
      });
    }

    var resourceCol = await db.agoraColumn.create({
      data: {
        tableId: params.id,
        name: resourceName,
        type: 'select',
        position: nextPos + 2,
        required: true,
        settings: resourceSettings,
      },
    });

    // Add 'booking' to enabledFeatures
    var updatedFeatures: any[];
    if (Array.isArray(features)) {
      updatedFeatures = features.slice();
    } else {
      updatedFeatures = [];
    }
    updatedFeatures.push('booking');

    await db.agoraTable.update({
      where: { id: params.id },
      data: { enabledFeatures: updatedFeatures },
    });

    // Store booking config in notificationTargets JSON
    var currentTable = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: { notificationTargets: true },
    });
    var targets = (currentTable?.notificationTargets as any) || {};
    targets.__bookingConfig = {
      startColumnId: startCol.id,
      endColumnId: endCol.id,
      resourceColumnId: resourceCol.id,
      installedAt: new Date().toISOString(),
      installedBy: (session.user as any).id,
    };
    await db.agoraTable.update({
      where: { id: params.id },
      data: { notificationTargets: targets },
    });

    // Audit log
    await logActivity({
      tableId: params.id,
      userId: (session.user as any).id,
      action: 'BOOKING_INSTALLED',
      details: {
        startColumnId: startCol.id,
        endColumnId: endCol.id,
        resourceColumnId: resourceCol.id,
        startColumnName: startName,
        endColumnName: endName,
        resourceColumnName: resourceName,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Booking system installed',
      columns: {
        start: { id: startCol.id, name: startCol.name },
        end: { id: endCol.id, name: endCol.name },
        resource: { id: resourceCol.id, name: resourceCol.name },
      },
    });
  } catch (error: any) {
    console.error('[Booking Install Error]:', error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Installation failed' : error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/tables/[id]/booking/install — uninstall booking system
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    var session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    var permission = await getTablePermission((session.user as any).id, params.id);
    if (permission !== 'owner' && permission !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    var table = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: { enabledFeatures: true, notificationTargets: true },
    });
    if (!table) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

    var features = (table.enabledFeatures as any) || [];
    if (Array.isArray(features)) {
      features = features.filter(function(f: string) { return f !== 'booking'; });
    }

    // Remove booking config but keep columns (data preservation)
    var targets = (table.notificationTargets as any) || {};
    delete targets.__bookingConfig;

    await db.agoraTable.update({
      where: { id: params.id },
      data: {
        enabledFeatures: features,
        notificationTargets: targets,
      },
    });

    await logActivity({
      tableId: params.id,
      userId: (session.user as any).id,
      action: 'BOOKING_UNINSTALLED',
    });

    return NextResponse.json({ success: true, message: 'Booking system removed. Columns and data preserved.' });
  } catch (error: any) {
    console.error('[Booking Uninstall Error]:', error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Uninstall failed' : error.message },
      { status: 500 }
    );
  }
}

function getColor(index: number): string {
  var colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];
  return colors[index % colors.length];
}