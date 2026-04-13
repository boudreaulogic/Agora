import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { columns } = await request.json();

    const permission = await getTablePermission(session.user.id, params.id);
    if (!permission || permission === 'viewer' || permission === 'editor') {
      return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
    }

    await db.$transaction([
      ...columns.map((col: any, index: number) =>
        db.agoraColumn.update({
          where: { id: col.id },
          data: { position: 10000 + index },
        })
      ),
      ...columns.map((col: any) =>
        db.agoraColumn.update({
          where: { id: col.id },
          data: { position: col.position },
        })
      ),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering columns:', error);
    return NextResponse.json({ error: 'Failed to reorder columns' }, { status: 500 });
  }
}