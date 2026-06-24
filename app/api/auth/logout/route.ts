import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST /api/auth/logout — revoke the current UserSession row, then clear the cookie.
// The client should call this before (or instead of) NextAuth's built-in signOut
// so the server-side session record is invalidated.
export async function POST() {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  var sid = (session.user as any).sid as string | undefined;
  if (sid) {
    try {
      await db.userSession.update({
        where: { id: sid },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Row already gone — still proceed with logout
    }
  }

  return NextResponse.json({ success: true });
}
