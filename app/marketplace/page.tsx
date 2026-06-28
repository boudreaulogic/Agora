export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { MarketplaceClient } from './MarketplaceClient';
import { db } from '@/lib/db';

export default async function MarketplacePage() {
  var session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  // Fetch user's tables so they can pick which table to install add-ons on
  var tables = await db.agoraTable.findMany({
    where: { createdById: session.user.id },
    select: { id: true, name: true, icon: true, enabledFeatures: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <MarketplaceClient tables={tables} />
      </main>
    </div>
  );
}