export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { DataModelClient } from './DataModelClient';

export default async function DataModelPage() {
  var session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar />
      <main className="flex-1 overflow-hidden">
        <DataModelClient />
      </main>
    </div>
  );
}