import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await request.json();

  await db.user.update({
    where: { id: session.user.id },
    data: { name: name?.trim() || null },
  });

  return NextResponse.json({ success: true });
}