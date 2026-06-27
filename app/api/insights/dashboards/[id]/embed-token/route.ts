import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { signEmbedToken } from '@/lib/insights/embed-token';

// POST — generate an embed token for a dashboard
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var dashboard = await db.dashboard.findUnique({ where: { id: params.id } });
  if (!dashboard) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
  if (dashboard.status !== 'published') return NextResponse.json({ error: 'Dashboard must be published to embed' }, { status: 400 });

  var token = signEmbedToken({ dashboardId: params.id, createdAt: Date.now(), createdBy: session.user.id });
  return NextResponse.json({ token: token, embedUrl: '/embed/dashboard/' + params.id + '?token=' + token });
}