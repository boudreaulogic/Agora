export const dynamic = 'force-dynamic';

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import AutomationsManager from './AutomationsManager';

export default async function AutomationsPage() {
  var session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <AutomationsManager />
      </main>
    </div>
  );
}