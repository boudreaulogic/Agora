import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST /api/auth/revoke-all — "log out everywhere"
// Revokes all active UserSession rows for the current user.
export async function POST() {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  var userId = (session.user as any).id as string;
  var now = new Date();

  var result = await db.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });

  return NextResponse.json({ success: true, revokedCount: result.count });
}
