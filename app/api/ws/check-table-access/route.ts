import crypto from 'crypto';
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export const dynamic = 'force-dynamic';

// GET /api/ws/check-table-access?userId=X&tableId=Y
// Internal endpoint called by the WS server to verify a user can join a table room.
// Protected by BROADCAST_SECRET to ensure only the WS server can call it.
export async function GET(req: NextRequest) {
  // Authenticate the WS server using the shared BROADCAST_SECRET
  var broadcastSecret = process.env.BROADCAST_SECRET;
  if (!broadcastSecret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  var authHeader = req.headers.get('authorization') || '';
  var expected = 'Bearer ' + broadcastSecret;
  var allowed = false;
  try {
    allowed = authHeader.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {}
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  var userId = req.nextUrl.searchParams.get('userId');
  var tableId = req.nextUrl.searchParams.get('tableId');

  if (!userId || !tableId) {
    return NextResponse.json({ error: 'userId and tableId required' }, { status: 400 });
  }

  // Check if the user exists and is active
  var user = await db.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ allowed: false });
  }

  var perm = await getTablePermission(userId, tableId);
  return NextResponse.json({ allowed: perm !== null });
}
