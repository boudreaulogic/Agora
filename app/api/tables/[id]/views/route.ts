import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET all views for a table
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const views = await db.agoraView.findMany({
    where: { tableId: params.id },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(views);
}

// POST create new view
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, type, config, isDefault } = await request.json();

  // If setting as default, unset other defaults
  if (isDefault) {
    await db.agoraView.updateMany({
      where: { tableId: params.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const view = await db.agoraView.create({
    data: {
      tableId: params.id,
      name,
      type: type || 'grid',
      config,
      isDefault: isDefault || false,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(view);
}