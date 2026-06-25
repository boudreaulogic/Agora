export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { DashboardEditor } from './DashboardEditor';
export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  var session = await auth();
  if (!session?.user) redirect('/login');
  var { id } = await params;
  var tables = await db.agoraTable.findMany({
    include: {
      columns: {
        select: { id: true, name: true, type: true, settings: true },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar />
      <main className="flex-1 overflow-hidden">
        <DashboardEditor dashboardId={id} tables={tables} />
      </main>
    </div>
  );
}