import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireTablePermission } from '@/lib/tablePermissions';
import { authenticateRequest } from '@/lib/authenticateRequest';
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  var authResult = await authenticateRequest(request, params.id, 'write');
  if (authResult instanceof NextResponse) return authResult;
  const { rowIds } = await request.json();
  if (!Array.isArray(rowIds) || rowIds.length === 0) {
    return NextResponse.json({ error: 'Invalid row IDs' }, { status: 400 });
  }
  if (authResult.source === 'session') {
    var denied = await requireTablePermission(authResult.userId, params.id, 'write');
    if (denied) return denied;
  }

  await db.agoraRow.deleteMany({
    where: {
      id: { in: rowIds },
      tableId: params.id,
      isLocked: false,
    },
  });

  return NextResponse.json({ success: true, deleted: rowIds.length });
}