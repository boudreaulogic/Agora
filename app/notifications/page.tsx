export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { NotificationsClient } from './NotificationsClient';

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <AppSidebar />
      <main className="flex-1 overflow-hidden">
        <NotificationsClient />
      </main>
    </div>
  );
}
