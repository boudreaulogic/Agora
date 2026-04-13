import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { revalidatePath } from 'next/cache';
import { TableViewClient } from './TableViewClient';
import { canAccessTable } from '@/lib/table-access';
import { getTablePermission, getColumnPermissions } from '@/lib/tablePermissions';
import { logActivity } from '@/lib/activityLog';

export default async function TableViewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }
  
  const table = await db.agoraTable.findUnique({
    where: { id: params.id },
    include: {
      columns: { orderBy: { position: 'asc' } },
      rows: { orderBy: { position: 'asc' } },
      views: { orderBy: { createdAt: 'asc' } },
      workspace: {
        select: { id: true, name: true, icon: true },
      },
    },
  });

  if (!table) {
    notFound();
  }

  const hasAccess = await canAccessTable(session.user.id, params.id);
  if (!hasAccess) {
    redirect('/');
  }

  // Get user's permission level for this table
  const permissionLevel = await getTablePermission(session.user.id, params.id);

  // Get column-level permissions for this user
  const columnPermissions = await getColumnPermissions(session.user.id, params.id);

  const { ensureDefaultView } = await import('@/scripts/ensure-default-view');
  await ensureDefaultView(table.id, session.user.id);

  const isAdminOrOwner = permissionLevel === 'owner' || permissionLevel === 'admin';

  const tableWithViews = await db.agoraTable.findUnique({
    where: { id: params.id },
    include: {
      columns: { orderBy: { position: 'asc' } },
      rows: {
        where: table.rowLevelSecurity && !isAdminOrOwner
          ? { createdById: session.user.id }
          : undefined,
        orderBy: { position: 'asc' },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      },
      views: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!tableWithViews) {
    notFound();
  }

  async function addBlankRow() {
    'use server';
    
    const maxRow = await db.agoraRow.findFirst({
      where: { tableId: params.id },
      orderBy: { position: 'desc' },
    });
    const newPosition = (maxRow?.position ?? -1) + 1;

    // Build default data from column settings
    const tableColumns = await db.agoraColumn.findMany({
      where: { tableId: params.id },
      select: { id: true, type: true, settings: true },
    });
    const defaultData: Record<string, any> = {};
    for (const col of tableColumns) {
      const colSettings = col.settings as any;
      if (colSettings?.defaultValue) {
        let val = colSettings.defaultValue;
        if (val === '__today') {
          val = col.type === 'datetime'
            ? new Date().toISOString().slice(0, 16)
            : new Date().toISOString().split('T')[0];
        }
        defaultData[col.id] = val;
      }
    }

    const newRow = await db.agoraRow.create({
      data: {
        tableId: params.id,
        data: defaultData,
        position: newPosition,
        createdById: session!.user.id,
      },
    });

    await logActivity({
      tableId: params.id,
      rowId: newRow.id,
      userId: session!.user.id,
      action: 'ROW_CREATED',
      details: { position: newPosition },
    });

    revalidatePath(`/tables/${params.id}`);
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar currentTableId={tableWithViews.id} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <TableViewClient 
          table={tableWithViews} 
          addBlankRow={addBlankRow}
          session={session}
          permissionLevel={permissionLevel}
          columnPermissions={columnPermissions}
        />
      </main>
    </div>
  );
}