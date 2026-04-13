import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';
import { logActivity } from '@/lib/activityLog';
import { authenticateRequest } from '@/lib/authenticateRequest';
export async function POST(request: Request, { params }: { params: { id: string } }) {
  var authResult = await authenticateRequest(request, params.id, 'write');
  if (authResult instanceof NextResponse) return authResult;
  if (authResult.source === 'session') {
    var permission = await getTablePermission(authResult.userId, params.id);
    if (!permission || permission === 'viewer') {
      return NextResponse.json({ error: 'No edit access' }, { status: 403 });
    }
  }
  const { position: insertPosition } = await request.json();

  // Shift all rows at or after the insert position down by 1
  await db.$executeRaw`
    UPDATE agora_rows 
    SET position = position + 1 
    WHERE "tableId" = ${params.id} AND position >= ${insertPosition}
  `;

  const newRow = await db.agoraRow.create({
    data: {
      tableId: params.id,
      data: {},
      position: insertPosition,
      createdById: authResult.userId,
    },
  });

  await logActivity({
    tableId: params.id,
    rowId: newRow.id,
    userId: authResult.userId,
    action: 'ROW_CREATED',
    details: { position: insertPosition },
  });

  return NextResponse.json(newRow);
}