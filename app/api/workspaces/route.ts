import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET — list workspaces the current user can access
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  // Get user's roles and groups for membership checks
  const userRoles = await db.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });
  const userGroups = await db.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const roleIds = userRoles.map(r => r.roleId);
  const groupIds = userGroups.map(g => g.groupId);

  // Check if sys admin
  const isSysAdmin = await db.userRole.findFirst({
    where: {
      userId,
      role: { permissions: { some: { permission: { slug: 'admin.access' } } } },
    },
  });

  let workspaces;

  if (isSysAdmin) {
    // Sys admins see all workspaces
    workspaces = await db.workspace.findMany({
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            role: { select: { id: true, name: true } },
            group: { select: { id: true, name: true } },
          },
        },
        tables: {
          select: { id: true, name: true, icon: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  } else {
    // Get workspaces where user is creator OR member (directly, via role, or via group)
    workspaces = await db.workspace.findMany({
      where: {
        OR: [
          { createdById: userId },
          { members: { some: { userId } } },
          { members: { some: { roleId: { in: roleIds } } } },
          { members: { some: { groupId: { in: groupIds } } } },
        ],
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            role: { select: { id: true, name: true } },
            group: { select: { id: true, name: true } },
          },
        },
        tables: {
          select: { id: true, name: true, icon: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  return NextResponse.json({ workspaces });
}

// POST — create a new workspace
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, description, icon } = await request.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  // Generate slug
  const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let slug = baseSlug;
  let counter = 1;
  while (await db.workspace.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const workspace = await db.workspace.create({
    data: {
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      icon: icon || '📁',
      createdById: session.user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      members: true,
      tables: true,
    },
  });

  // Auto-add creator as owner member
  await db.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: session.user.id,
      permission: 'owner',
    },
  });

  return NextResponse.json({ workspace });
}