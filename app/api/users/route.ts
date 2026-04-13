import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = await db.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      email: true,
      name: true,
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ users });
}