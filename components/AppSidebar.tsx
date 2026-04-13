import { auth, signOut } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { getAccessibleTables } from '@/lib/table-access';

export async function AppSidebar({ currentTableId }: { currentTableId?: string }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const userId = session.user.id;

  // Get all accessible tables (owned + shared)
  const { owned, shared } = await getAccessibleTables(userId);

  // Add row counts to all tables
  const ownedWithCounts = await Promise.all(
    owned.map(async (table) => {
      const rowCount = await db.agoraRow.count({ where: { tableId: table.id } });
      return { ...table, _count: { rows: rowCount } };
    })
  );

  const sharedWithCounts = await Promise.all(
    shared.map(async (table) => {
      const rowCount = await db.agoraRow.count({ where: { tableId: table.id } });
      return { ...table, _count: { rows: rowCount } };
    })
  );

  const allTables = [...ownedWithCounts, ...sharedWithCounts];

  // Fetch workspaces the user can access
  const userRoles = await db.userRole.findMany({
    where: { userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });

  const isAdmin = userRoles.some(ur =>
    ur.role.permissions.some(rp => rp.permission.slug === 'admin.access')
  );

  const roleIds = userRoles.map(ur => ur.roleId);
  const userGroups = await db.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const groupIds = userGroups.map(g => g.groupId);

  let workspaces;
  if (isAdmin) {
    workspaces = await db.workspace.findMany({
      include: {
        tables: { select: { id: true, name: true, icon: true }, orderBy: { createdAt: 'asc' } },
        members: { where: { userId }, select: { permission: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  } else {
    workspaces = await db.workspace.findMany({
      where: {
        OR: [
          { createdById: userId },
          { members: { some: { userId } } },
          { members: { some: { roleId: { in: roleIds } } } },
          { members: { some: { groupId: { in: groupIds } } } },
        ],
      },
      include: {
        tables: { select: { id: true, name: true, icon: true }, orderBy: { createdAt: 'asc' } },
        members: { where: { userId }, select: { permission: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Tables NOT in any workspace — split into owned vs shared
  const workspaceTableIds = new Set(workspaces.flatMap(w => w.tables.map((t: any) => t.id)));

  // Fetch Google Sheet connections
  const sheetConnections = await db.googleSheetConnection.findMany({
    where: { isActive: true },
    include: {
      tabs: {
        include: {
          // We need the table name for display
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Get table info for each sheet tab
  const sheetConnectionsWithTables = await Promise.all(
    sheetConnections.map(async (conn) => {
      const tabsWithTables = await Promise.all(
        conn.tabs.map(async (tab) => {
          const table = await db.agoraTable.findUnique({
            where: { id: tab.tableId },
            select: { id: true, name: true, icon: true },
          });
          return { ...tab, table };
        })
      );
      return { ...conn, tabs: tabsWithTables };
    })
  );

  // Exclude sheet-backed tables from myTables
  const sheetTableIds = new Set(sheetConnections.flatMap(c => c.tabs.map(t => t.tableId)));
  const myTables = ownedWithCounts.filter(t => !workspaceTableIds.has(t.id) && !sheetTableIds.has(t.id));
  const sharedTables = sharedWithCounts.filter(t => !workspaceTableIds.has(t.id) && !sheetTableIds.has(t.id));

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <CollapsibleSidebar
      tables={myTables}
      sharedTables={sharedTables}
      workspaces={workspaces}
      sheetConnections={sheetConnectionsWithTables}
      currentTableId={currentTableId}
      isAdmin={isAdmin}
      userName={session.user.name || null}
      userEmail={session.user.email || ''}
      signOutAction={handleSignOut}
    />
  );
}