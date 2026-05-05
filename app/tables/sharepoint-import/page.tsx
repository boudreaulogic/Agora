export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SharePointImportClient } from './SharePointImportClient';
import { db } from '@/lib/db';

export default async function SharePointImportPage() {
  var session = await auth();
  if (!session?.user) redirect('/login');

  var userId = (session.user as any).id;
  var userRoles = await db.userRole.findMany({
    where: { userId: userId },
    select: { roleId: true },
  });
  var userGroups = await db.groupMember.findMany({
    where: { userId: userId },
    select: { groupId: true },
  });
  var roleIds = userRoles.map(function(r) { return r.roleId; });
  var groupIds = userGroups.map(function(g) { return g.groupId; });

  var isSysAdmin = await db.userRole.findFirst({
    where: {
      userId: userId,
      role: { permissions: { some: { permission: { slug: 'admin.access' } } } },
    },
  });

  var workspaces: any[];
  if (isSysAdmin) {
    workspaces = await db.workspace.findMany({
      select: { id: true, name: true, icon: true },
      orderBy: { createdAt: 'asc' },
    });
  } else {
    workspaces = await db.workspace.findMany({
      where: {
        OR: [
          { createdById: userId },
          { members: { some: { userId: userId, permission: { in: ['editor', 'admin', 'owner'] } } } },
          { members: { some: { roleId: { in: roleIds }, permission: { in: ['editor', 'admin', 'owner'] } } } },
          { members: { some: { groupId: { in: groupIds }, permission: { in: ['editor', 'admin', 'owner'] } } } },
        ],
      },
      select: { id: true, name: true, icon: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  return <SharePointImportClient workspaces={workspaces} />;
}