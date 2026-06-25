import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSharePointAdmin } from '@/lib/sharepoint-access';

export const dynamic = 'force-dynamic';

// GET — list all configured connections (admin)
export async function GET() {
  var session = await auth();
  if (!session?.user || !(await isSharePointAdmin((session.user as any).id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  var connections = await db.sharePointListConnection.findMany({
    orderBy: { name: 'asc' },
    include: { access: { select: { groupId: true } } },
  });
  return NextResponse.json({ connections: connections });
}

// POST — register a list as a connection (called after a successful test/browse).
// Resolves the Graph site id server-side from the site URL rather than trusting
// the client, then upserts on (siteId, listId) and replaces the group grants.
export async function POST(request: Request) {
  var session = await auth();
  if (!session?.user || !(await isSharePointAdmin((session.user as any).id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  var body = await request.json();
  var name = (body.name || '').trim();
  var siteUrl = (body.siteUrl || '').trim();
  var listId = (body.listId || '').trim();
  var listName = (body.listName || '').trim();

  if (!name || !siteUrl || !listId) {
    return NextResponse.json({ error: 'name, siteUrl, and listId are required' }, { status: 400 });
  }

  var siteId = '';
  try {
    var { getSiteId } = await import('@/lib/sharepoint');
    siteId = await getSiteId(siteUrl);
  } catch (err: any) {
    return NextResponse.json({ error: 'Could not resolve SharePoint site: ' + (err.message || 'unknown') }, { status: 400 });
  }

  var groupIds: string[] = Array.isArray(body.groupIds) ? body.groupIds : [];
  var visibleToAll = body.visibleToAll === true;

  try {
    var conn = await db.sharePointListConnection.upsert({
      where: { siteId_listId: { siteId: siteId, listId: listId } },
      update: {
        name: name,
        description: body.description || null,
        siteUrl: siteUrl,
        listName: listName,
        isActive: true,
        visibleToAll: visibleToAll,
        lastTestedAt: new Date(),
        testStatus: 'ok',
      },
      create: {
        name: name,
        description: body.description || null,
        siteUrl: siteUrl,
        siteId: siteId,
        listId: listId,
        listName: listName,
        visibleToAll: visibleToAll,
        lastTestedAt: new Date(),
        testStatus: 'ok',
        createdById: (session.user as any).id,
      },
    });

    await db.sharePointConnectionAccess.deleteMany({ where: { connectionId: conn.id } });
    if (groupIds.length > 0) {
      await db.sharePointConnectionAccess.createMany({
        data: groupIds.map(function(gid) { return { connectionId: conn.id, groupId: gid }; }),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ success: true, connection: conn });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to save connection' }, { status: 500 });
  }
}
