import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSharePointAdmin } from '@/lib/sharepoint-access';

export const dynamic = 'force-dynamic';

// PATCH — update a connection's metadata and/or its group access grants.
export async function PATCH(request: Request, context: { params: { id: string } }) {
  var session = await auth();
  if (!session?.user || !(await isSharePointAdmin((session.user as any).id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  var id = context.params.id;
  var body = await request.json();

  var data: any = {};
  if (typeof body.name === 'string') data.name = body.name.trim();
  if (typeof body.description === 'string') data.description = body.description;
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  if (typeof body.visibleToAll === 'boolean') data.visibleToAll = body.visibleToAll;

  try {
    if (Object.keys(data).length > 0) {
      await db.sharePointListConnection.update({ where: { id: id }, data: data });
    }
    if (Array.isArray(body.groupIds)) {
      await db.sharePointConnectionAccess.deleteMany({ where: { connectionId: id } });
      if (body.groupIds.length > 0) {
        await db.sharePointConnectionAccess.createMany({
          data: body.groupIds.map(function(gid: string) { return { connectionId: id, groupId: gid }; }),
          skipDuplicates: true,
        });
      }
    }
    var updated = await db.sharePointListConnection.findUnique({
      where: { id: id },
      include: { access: { select: { groupId: true } } },
    });
    return NextResponse.json({ success: true, connection: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update connection' }, { status: 500 });
  }
}

// DELETE — remove a connection (cascades its access grants).
export async function DELETE(request: Request, context: { params: { id: string } }) {
  var session = await auth();
  if (!session?.user || !(await isSharePointAdmin((session.user as any).id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  try {
    await db.sharePointListConnection.delete({ where: { id: context.params.id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete connection' }, { status: 500 });
  }
}
