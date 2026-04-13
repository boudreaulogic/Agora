import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { canViewTable, canAdminTable, isTableOwner } from '@/lib/tablePermissions';

// GET all rows from a table
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check view access
  const hasAccess = await canViewTable(session.user.id, params.id);
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const rows = await db.agoraRow.findMany({
      where: { tableId: params.id },
      orderBy: { position: 'asc' },
    });
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching rows:', error);
    return NextResponse.json({ error: 'Failed to fetch rows' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Table metadata changes require admin access
  const hasAdmin = await canAdminTable(session.user.id, params.id);
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  const { name, description, icon, rowLevelSecurity, workspaceId, inheritPermissions, enableFeature, disableFeature } = await request.json();

  // If moving table INTO a workspace, strip existing table shares and set inherit=true
  if (workspaceId !== undefined) {
    const currentTable = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: { workspaceId: true },
    });

    // Moving into a workspace (from standalone or different workspace)
    if (workspaceId && workspaceId !== currentTable?.workspaceId) {
      // Strip all existing table-level shares
      await db.tableShare.deleteMany({ where: { tableId: params.id } });
    }
  }

  // If restoring inheritance, strip table-level shares (workspace perms take over)
  if (inheritPermissions === true) {
    const currentTable = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: { workspaceId: true, inheritPermissions: true },
    });
    if (currentTable?.workspaceId && currentTable.inheritPermissions === false) {
      await db.tableShare.deleteMany({ where: { tableId: params.id } });
    }
  }

  // Handle feature enable/disable
  let featureUpdate: any = {};
  if (enableFeature || disableFeature) {
    const currentTable = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: { enabledFeatures: true },
    });
    let features = (currentTable?.enabledFeatures as string[]) || [];
    if (enableFeature && !features.includes(enableFeature)) {
      features = [...features, enableFeature];
    }
    if (disableFeature) {
      features = features.filter((f: string) => f !== disableFeature);
    }
    featureUpdate = { enabledFeatures: features };
  }

  const updatedTable = await db.agoraTable.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(icon !== undefined && { icon }),
      ...(rowLevelSecurity !== undefined && { rowLevelSecurity }),
      ...(workspaceId !== undefined && { workspaceId: workspaceId || null }),
      ...(inheritPermissions !== undefined && { inheritPermissions }),
      ...featureUpdate,
    },
  });
  return NextResponse.json(updatedTable);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only owner (or sys admin) can delete a table
  const isOwner = await isTableOwner(session.user.id, params.id);
  if (!isOwner) {
    return NextResponse.json({ error: 'Forbidden — only the table owner can delete' }, { status: 403 });
  }

  // Check if table exists first
  const tableInfo = await db.agoraTable.findUnique({ where: { id: params.id }, select: { isSheetBacked: true } });
  if (!tableInfo) {
    return NextResponse.json({ success: true }); // Already deleted
  }

  // Save connection info BEFORE deleting (cascade will remove the tab mapping)
  let connectionIdToCheck: string | null = null;
  if (tableInfo.isSheetBacked) {
    const tabMapping = await db.sheetTabMapping.findUnique({ where: { tableId: params.id } });
    if (tabMapping) {
      connectionIdToCheck = tabMapping.connectionId;
    }
  }

  // Delete the table (cascades remove tab mappings, columns, rows, etc.)
  await db.agoraTable.delete({
    where: { id: params.id },
  });

  // AFTER delete: check if the connection has any remaining tabs
  if (connectionIdToCheck) {
    const remainingTabs = await db.sheetTabMapping.count({ where: { connectionId: connectionIdToCheck } });
    if (remainingTabs === 0) {
      await db.googleSheetConnection.delete({ where: { id: connectionIdToCheck } }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}