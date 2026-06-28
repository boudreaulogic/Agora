import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessAutomation } from '@/lib/automations/access';

export const dynamic = 'force-dynamic';

// GET /api/automations/[id]/runs?limit=&offset=&status=
// Paginated run history for an automation. Requires access to the automation.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params;
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    var userId = (session.user as any).id;

    var automation = await db.automation.findUnique({ where: { id: id } });
    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    var access = await canAccessAutomation(userId, automation);
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    var url = new URL(req.url);
    var limit = Math.min(parseInt(url.searchParams.get('limit') || '25', 10) || 25, 100);
    var offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
    var statusFilter = url.searchParams.get('status');

    var where: any = { automationId: id };
    if (statusFilter && statusFilter !== 'all') where.status = statusFilter;

    var [runs, total] = await Promise.all([
      db.automationRun.findMany({
        where: where,
        orderBy: { startedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      db.automationRun.count({ where: where }),
    ]);

    return NextResponse.json({
      runs: runs,
      total: total,
      offset: offset,
      limit: limit,
      hasMore: offset + runs.length < total,
    });
  } catch (error: any) {
    console.error('[AutomationRuns GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
