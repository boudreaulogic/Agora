import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST — toggle pin a chart to the dashboard
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { chartId } = await request.json();
  if (!chartId) {
    return NextResponse.json({ error: 'Chart ID required' }, { status: 400 });
  }

  // Get current pinned charts
  let setting = await db.systemSetting.findUnique({
    where: { key: 'dashboard_pinned_charts' },
  });

  let pinnedIds: string[] = [];
  if (setting?.value) {
    try { pinnedIds = JSON.parse(setting.value); } catch {}
  }

  // Toggle
  const isPinned = pinnedIds.includes(chartId);
  if (isPinned) {
    pinnedIds = pinnedIds.filter(id => id !== chartId);
  } else {
    pinnedIds.push(chartId);
  }

  // Save
  await db.systemSetting.upsert({
    where: { key: 'dashboard_pinned_charts' },
    update: { value: JSON.stringify(pinnedIds) },
    create: { key: 'dashboard_pinned_charts', value: JSON.stringify(pinnedIds) },
  });

  return NextResponse.json({ pinned: !isPinned, pinnedIds });
}

// GET — list pinned chart IDs
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const setting = await db.systemSetting.findUnique({
    where: { key: 'dashboard_pinned_charts' },
  });

  let pinnedIds: string[] = [];
  if (setting?.value) {
    try { pinnedIds = JSON.parse(setting.value); } catch {}
  }

  return NextResponse.json({ pinnedIds });
}