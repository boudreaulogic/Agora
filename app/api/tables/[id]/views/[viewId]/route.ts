import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

// PATCH update view
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; viewId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const perm = await getTablePermission(session.user.id, params.id);
  if (!perm || perm === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { name, config, isDefault } = await request.json();

  // If setting as default, unset other defaults
  if (isDefault) {
    await db.agoraView.updateMany({
      where: { tableId: params.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const view = await db.agoraView.update({
    where: { id: params.viewId },
    data: {
      ...(name && { name }),
      ...(config && { config }),
      ...(isDefault !== undefined && { isDefault }),
    },
  });

  return NextResponse.json(view);
}

// DELETE view
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; viewId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const permD = await getTablePermission(session.user.id, params.id);
  if (!permD || permD === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await db.agoraView.delete({
    where: { id: params.viewId },
  });

  return NextResponse.json({ success: true });
}