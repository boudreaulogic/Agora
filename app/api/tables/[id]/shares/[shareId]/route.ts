import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { canAdminTable } from '@/lib/tablePermissions';
import { wsBroadcast } from '@/lib/wsBroadcast';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; shareId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Owner or admin can remove shares
  const hasAdmin = await canAdminTable(session.user.id, params.id);
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  await db.tableShare.delete({
    where: { id: params.shareId },
  });
  await wsBroadcast(params.id, { type: 'permissions-changed', action: 'share-removed' });
  return NextResponse.json({ success: true });
}