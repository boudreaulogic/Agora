import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const groups = await db.group.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ groups });
}