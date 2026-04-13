import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET — single workspace with members and tables
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await db.workspace.findUnique({
    where: { id: params.id },
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
        include: {
          _count: { select: { rows: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ workspace });
}

// PATCH — update workspace
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check ownership or admin
  const member = await db.workspaceMember.findFirst({
    where: {
      workspaceId: params.id,
      userId: session.user.id,
      permission: { in: ['owner', 'admin'] },
    },
  });

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, description, icon } = await request.json();

  const workspace = await db.workspace.update({
    where: { id: params.id },
    data: {
      ...(name && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(icon !== undefined && { icon }),
    },
  });

  return NextResponse.json({ workspace });
}

// DELETE — delete workspace (tables become orphaned, not deleted)
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await db.workspace.findUnique({
    where: { id: params.id },
  });

  if (!workspace || workspace.createdById !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden — only the creator can delete' }, { status: 403 });
  }

  // Unlink tables (don't delete them)
  await db.agoraTable.updateMany({
    where: { workspaceId: params.id },
    data: { workspaceId: null },
  });

  await db.workspace.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}