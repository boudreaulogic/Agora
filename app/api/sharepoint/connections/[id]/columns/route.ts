import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { canAccessConnection } from '@/lib/sharepoint-access';

export const dynamic = 'force-dynamic';

// GET — columns for a connection's underlying list, gated by access. The siteId
// and listId come from the stored connection, never the client, so a user can
// only ever read columns from a list they've been granted.
export async function GET(request: Request, context: { params: { id: string } }) {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  var id = context.params.id;
  if (!(await canAccessConnection((session.user as any).id, id))) {
    return NextResponse.json({ error: 'You do not have access to this SharePoint list' }, { status: 403 });
  }
  var conn = await db.sharePointListConnection.findUnique({ where: { id: id } });
  if (!conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }
  try {
    var { getListColumns } = await import('@/lib/sharepoint');
    var columns = await getListColumns(conn.siteId, conn.listId);
    return NextResponse.json({ columns: columns, listName: conn.listName });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load columns' }, { status: 500 });
  }
}
