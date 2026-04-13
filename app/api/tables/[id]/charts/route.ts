import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perm = await getTablePermission(session.user.id, params.id);
  if (!perm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const charts = await db.agoraChart.findMany({
    where: { tableId: params.id },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ charts });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perm = await getTablePermission(session.user.id, params.id);
  if (perm !== 'owner' && perm !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { name, type, config } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const chart = await db.agoraChart.create({
    data: {
      tableId: params.id,
      name: name.trim(),
      type: type || 'bar',
      config: config || {},
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ chart });
}