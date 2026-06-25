export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { InsightsManager } from './InsightsManager';
export default async function InsightsPage() {
  var session = await auth();
  if (!session?.user) redirect('/login');
  var tables = await db.agoraTable.findMany({
    include: {
      columns: {
        select: { id: true, name: true, type: true, settings: true },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  var workspaces = await db.workspace.findMany({
    select: { id: true, name: true, icon: true },
    orderBy: { name: 'asc' },
  });
  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <InsightsManager tables={tables} workspaces={workspaces} />
      </main>
    </div>
  );
}