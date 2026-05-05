export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SharePointSettingsClient } from './SharePointSettingsClient';

export default async function SharePointPage() {
  var session = await auth();
  if (!session?.user) redirect('/login');
  return <SharePointSettingsClient />;
}