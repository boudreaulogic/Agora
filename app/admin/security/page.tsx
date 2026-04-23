export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SecurityDashboardClient from './SecurityDashboardClient';

export default async function SecurityPage() {
  var session = await auth();
  if (!session?.user) redirect('/login');
  return <SecurityDashboardClient />;
}