import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin
  var isAdmin = await db.userRole.findFirst({
    where: {
      userId: session.user.id,
      role: { permissions: { some: { permission: { slug: 'admin.access' } } } },
    },
  });
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    var connection = await db.googleSheetConnection.findUnique({
      where: { id: params.id },
      include: { tabs: true },
    });

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // Unmark tables as sheet-backed (skip if table doesn't exist)
    for (var i = 0; i < connection.tabs.length; i++) {
      var tab = connection.tabs[i];
      if (tab.tableId) {
        try {
          await db.agoraTable.update({
            where: { id: tab.tableId },
            data: { isSheetBacked: false },
          });
        } catch {}
      }
    }

    // Delete all tab mappings
    await db.sheetTabMapping.deleteMany({
      where: { connectionId: params.id },
    });

    // Delete the connection
    await db.googleSheetConnection.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting sheet connection:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete connection' }, { status: 500 });
  }
}