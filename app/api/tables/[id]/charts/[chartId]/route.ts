import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export async function PATCH(request: Request, { params }: { params: { id: string; chartId: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perm = await getTablePermission(session.user.id, params.id);
  if (perm !== 'owner' && perm !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await request.json();
  const chart = await db.agoraChart.update({
    where: { id: params.chartId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.config !== undefined && { config: body.config }),
    },
  });

  return NextResponse.json({ chart });
}

export async function DELETE(request: Request, { params }: { params: { id: string; chartId: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perm = await getTablePermission(session.user.id, params.id);
  if (perm !== 'owner' && perm !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  await db.agoraChart.delete({ where: { id: params.chartId } });
  return NextResponse.json({ success: true });
}