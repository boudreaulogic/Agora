import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  const data: { name?: string | null; theme?: string } = {};
  if ('name' in body) data.name = body.name?.trim() || null;
  // Appearance preference is account-bound; only ever set from the user's own
  // settings. Whitelist the value so nothing but 'light'/'dark' lands in the DB.
  if ('theme' in body) data.theme = body.theme === 'dark' ? 'dark' : 'light';

  await db.user.update({
    where: { id: session.user.id },
    data,
  });

  return NextResponse.json({ success: true });
}