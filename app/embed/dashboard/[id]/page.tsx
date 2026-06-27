export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { notFound } from 'next/navigation';
import { verifyEmbedToken } from '@/lib/insights/embed-token';
import { EmbedDashboardViewer } from './EmbedDashboardViewer';

export default async function EmbedDashboardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  var { id } = await params;
  var { token } = await searchParams;

  // The token IS the credential for this public page.
  if (!verifyEmbedToken(token, id)) return notFound();

  var dashboard = await db.dashboard.findUnique({
    where: { id: id, status: 'published' },
    include: {
      widgets: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!dashboard) return notFound();

  return <EmbedDashboardViewer dashboard={dashboard} token={token!} />;
}