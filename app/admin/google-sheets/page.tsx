export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { GoogleSheetsSettingsClient } from './GoogleSheetsSettingsClient';

export default async function GoogleSheetsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <GoogleSheetsSettingsClient />;
}
