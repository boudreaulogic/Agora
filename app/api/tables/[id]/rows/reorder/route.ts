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
    const { rows } = await request.json();

    const permission = await getTablePermission(session.user.id, params.id);
    if (!permission || permission === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.$transaction([
      ...rows.map((row: any, index: number) =>
        db.agoraRow.update({
          where: { id: row.id },
          data: { position: 10000 + index },
        })
      ),
      ...rows.map((row: any) =>
        db.agoraRow.update({
          where: { id: row.id },
          data: { position: row.position },
        })
      ),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering rows:', error);
    return NextResponse.json({ error: 'Failed to reorder rows' }, { status: 500 });
  }
}