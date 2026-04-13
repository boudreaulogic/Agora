import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET — fetch user's notifications
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter') || 'all'; // all, unread, approvals, changes, forms
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  const where: any = { userId: session.user.id };

  if (filter === 'unread') where.isRead = false;
  if (filter === 'approvals') where.type = { in: ['approval_requested', 'approval_completed'] };
  if (filter === 'changes') where.type = { in: ['row_created', 'row_updated', 'row_deleted'] };
  if (filter === 'forms') where.type = 'form_submitted';
  if (filter === 'comments') where.type = 'comment_added';

  const [notifications, total, unreadCount] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId: session.user.id, isRead: false } }),
  ]);

  return NextResponse.json({ notifications, total, unreadCount, page, limit });
}

// PATCH — mark notifications as read
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { ids, markAllRead } = body;

  if (markAllRead) {
    await db.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true });
  }

  if (ids && Array.isArray(ids)) {
    await db.notification.updateMany({
      where: { id: { in: ids }, userId: session.user.id },
      data: { isRead: body.markUnread ? false : true },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Provide ids or markAllRead' }, { status: 400 });
}

// DELETE — delete notifications
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { ids } = body;

  if (ids && Array.isArray(ids)) {
    await db.notification.deleteMany({
      where: { id: { in: ids }, userId: session.user.id },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Provide ids to delete' }, { status: 400 });
}