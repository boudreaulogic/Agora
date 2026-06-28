export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AppSidebar } from '@/components/AppSidebar';
import { DashboardClient } from './DashboardClient';

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const userId = session.user.id;

  // Parallel fetch all dashboard data
  const [tables, sharedTables, pendingApprovals, notifications, publicForms, pinnedChartsSetting, user] = await Promise.all([
    // User's own tables
    db.agoraTable.findMany({
      where: { createdById: userId },
      include: {
        _count: { select: { rows: true, columns: true } },
        workspace: { select: { id: true, name: true, icon: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),

    // Tables shared with user
    db.agoraTable.findMany({
      where: {
        shares: { some: { userId } },
        createdById: { not: userId },
      },
      include: {
        _count: { select: { rows: true, columns: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),

    // Pending approvals for this user
    db.approvalRequest.findMany({
      where: {
        status: { in: ['pending', 'in_progress'] },
      },
      include: {
        workflow: {
          select: { name: true, tableId: true, stages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    // Recent notifications
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),

    // Featured forms for quick actions
    (async () => {
      const setting = await db.systemSetting.findUnique({ where: { key: 'dashboard_featured_forms' } });
      let formIds: string[] = [];
      if (setting?.value) { try { formIds = JSON.parse(setting.value); } catch {} }
      if (formIds.length === 0) return [];
      return db.agoraForm.findMany({
        where: { id: { in: formIds }, isActive: true },
        include: { table: { select: { name: true, icon: true } } },
      });
    })(),

    // Pinned charts setting
    db.systemSetting.findUnique({
      where: { key: 'dashboard_pinned_charts' },
    }),

    // User info
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
  ]);

  // Filter approvals where this user is actually an approver
  const userApprovals = pendingApprovals.filter((ar: any) => {
    const stages = (ar.workflow.stages as any[]) || [];
    const currentStage = stages.find((s: any) => s.order === ar.currentStage);
    if (!currentStage) return false;
    return currentStage.approverUserIds?.includes(userId);
  });

  // Fetch pinned charts
  let pinnedCharts: any[] = [];
  if (pinnedChartsSetting?.value) {
    try {
      const chartIds = JSON.parse(pinnedChartsSetting.value) as string[];
      if (chartIds.length > 0) {
        pinnedCharts = await db.agoraChart.findMany({
          where: { id: { in: chartIds } },
          include: {
            table: {
              select: {
                id: true,
                name: true,
                icon: true,
                rows: { select: { data: true } },
                columns: { select: { id: true, name: true, type: true, settings: true } },
              },
            },
          },
        });
        // Maintain pinned order
        pinnedCharts = chartIds.map(id => pinnedCharts.find((c: any) => c.id === id)).filter(Boolean);
      }
    } catch {}
  }

  // Get table names for approvals
  const approvalTableIds = [...new Set(userApprovals.map((a: any) => a.workflow.tableId))];
  const approvalTables = await db.agoraTable.findMany({
    where: { id: { in: approvalTableIds } },
    select: { id: true, name: true, icon: true },
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const dashboardData = {
    greeting,
    userName: user?.name || user?.email?.split('@')[0] || 'there',
    tables: tables.map((t: any) => ({
      id: t.id, name: t.name, icon: t.icon, description: t.description,
      rowCount: t._count.rows, columnCount: t._count.columns,
      workspace: t.workspace, updatedAt: t.updatedAt,
    })),
    sharedTables: sharedTables.map((t: any) => ({
      id: t.id, name: t.name, icon: t.icon, description: t.description,
      rowCount: t._count.rows, sharedBy: t.createdBy?.name,
    })),
    pendingApprovals: userApprovals.map((ar: any) => {
      const table = approvalTables.find((t: any) => t.id === ar.workflow.tableId);
      return {
        id: ar.id, token: ar.token, workflowName: ar.workflow.name,
        tableId: ar.workflow.tableId, tableName: table?.name || 'Unknown',
        tableIcon: table?.icon, rowId: ar.rowId, createdAt: ar.createdAt,
        currentStage: ar.currentStage,
        stageName: ((ar.workflow.stages as any[]) || []).find((s: any) => s.order === ar.currentStage)?.name || '',
      };
    }),
    notifications: notifications.map((n: any) => ({
      id: n.id, type: n.type, title: n.title, message: n.message,
      isRead: n.isRead, tableId: n.tableId, createdAt: n.createdAt,
    })),
    quickActions: publicForms.map((f: any) => ({
      id: f.id, name: f.name, slug: f.slug, description: f.description,
      tableName: f.table?.name, tableIcon: f.table?.icon,
    })),
    pinnedCharts: pinnedCharts.map((c: any) => ({
      id: c.id, name: c.name, type: c.type, config: c.config,
      tableId: c.table?.id, tableName: c.table?.name, tableIcon: c.table?.icon,
      rows: c.table?.rows?.map((r: any) => ({ data: r.data })) || [],
      columns: c.table?.columns || [],
    })),
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <DashboardClient data={dashboardData} />
      </main>
    </div>
  );
}
