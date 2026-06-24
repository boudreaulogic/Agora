import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { logActivity } from '@/lib/activityLog';
import { getTablePermission } from '@/lib/tablePermissions';

export async function GET(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const perm = await getTablePermission(session.user.id, params.id);
  if (!perm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // Verify the row belongs to this table (prevents cross-table comment reads)
  const rowCheck = await db.agoraRow.findUnique({ where: { id: params.rowId }, select: { tableId: true } });
  if (!rowCheck || rowCheck.tableId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const comments = await db.rowComment.findMany({
      where: { rowId: params.rowId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const permPost = await getTablePermission(session.user.id, params.id);
  if (!permPost || permPost === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rowCheckP = await db.agoraRow.findUnique({ where: { id: params.rowId }, select: { tableId: true } });
  if (!rowCheckP || rowCheckP.tableId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { text } = await request.json();

  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'Comment text is required' }, { status: 400 });
  }

  try {
    const comment = await db.rowComment.create({
      data: {
        rowId: params.rowId,
        userId: session.user.id,
        text: text.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await logActivity({
      tableId: params.id,
      rowId: params.rowId,
      userId: session.user.id,
      action: 'COMMENT_ADDED',
      details: {
        commentId: comment.id,
        textPreview: text.trim().slice(0, 100),
      },
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}