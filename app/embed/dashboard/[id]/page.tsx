export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { notFound } from 'next/navigation';
import crypto from 'crypto';
import { EmbedDashboardViewer } from './EmbedDashboardViewer';

export default async function EmbedDashboardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  var { id } = await params;
  var { token } = await searchParams;

  // Validate token
  if (!token) return notFound();

  var secret = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || 'agora-default-key';
  var parts = token.split('.');
  if (parts.length !== 2) return notFound();

  try {
    var payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    var expectedSig = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    if (expectedSig !== parts[0]) return notFound();
    if (payload.dashboardId !== id) return notFound();

    // Optional: check token age (e.g. 30 days)
    var maxAge = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - payload.createdAt > maxAge) return notFound();
  } catch {
    return notFound();
  }

  var dashboard = await db.dashboard.findUnique({
    where: { id: id, status: 'published' },
    include: {
      widgets: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!dashboard) return notFound();

  return <EmbedDashboardViewer dashboard={dashboard} />;
}