import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET — get dashboard settings
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const setting = await db.systemSetting.findUnique({
    where: { key: 'dashboard_featured_forms' },
  });

  let featuredFormIds: string[] = [];
  if (setting?.value) {
    try { featuredFormIds = JSON.parse(setting.value); } catch {}
  }

  // Get all active forms for the admin to pick from
  const allForms = await db.agoraForm.findMany({
    where: { isActive: true },
    include: { table: { select: { name: true, icon: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    featuredFormIds,
    allForms: allForms.map(f => ({
      id: f.id, name: f.name, slug: f.slug, description: f.description,
      tableName: f.table?.name, tableIcon: f.table?.icon,
      isFeatured: featuredFormIds.includes(f.id),
    })),
  });
}

// PUT — update dashboard settings
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { featuredFormIds } = await request.json();

  await db.systemSetting.upsert({
    where: { key: 'dashboard_featured_forms' },
    update: { value: JSON.stringify(featuredFormIds || []) },
    create: { key: 'dashboard_featured_forms', value: JSON.stringify(featuredFormIds || []) },
  });

  return NextResponse.json({ success: true });
}