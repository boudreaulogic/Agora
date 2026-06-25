import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { getAccessibleConnections } from '@/lib/sharepoint-access';

export const dynamic = 'force-dynamic';

// GET — connections the current user is allowed to use (admin: all; otherwise
// visibleToAll or granted-group connections). Credentials/site internals are
// not exposed — only what the import picker needs.
export async function GET() {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  var conns = await getAccessibleConnections((session.user as any).id);
  return NextResponse.json({
    connections: conns.map(function(c) {
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        listName: c.listName,
      };
    }),
  });
}
