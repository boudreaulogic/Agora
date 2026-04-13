import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { getServiceAccountEmail } from '@/lib/googleSheets';

// GET — return the service account email for users to share their sheets with
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = await getServiceAccountEmail();
  return NextResponse.json({ email: email || null, configured: !!email });
}