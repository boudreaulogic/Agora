import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST — add a permission
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var body = await request.json();
  var data: any = { dashboardId: params.id, permission: body.permission || 'viewer' };

  if (body.userId) data.userId = body.userId;
  if (body.groupId) data.groupId = body.groupId;
  if (body.roleId) data.roleId = body.roleId;

  try {
    var perm = await db.dashboardPermission.create({ data: data });
    return NextResponse.json(perm);
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Permission already exists' }, { status: 409 });
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}

// PATCH — update permission level
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var body = await request.json();
  await db.dashboardPermission.update({
    where: { id: body.permissionId },
    data: { permission: body.permission },
  });
  return NextResponse.json({ success: true });
}

// DELETE — remove permission
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var body = await request.json();
  await db.dashboardPermission.delete({ where: { id: body.permissionId } });
  return NextResponse.json({ success: true });
}