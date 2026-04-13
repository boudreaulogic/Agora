import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
 
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
 
    var url = new URL(req.url);
    var limit = parseInt(url.searchParams.get('limit') || '50', 10);
    var statusFilter = url.searchParams.get('status');
 
    var where: any = { automationId: id };
    if (statusFilter) where.status = statusFilter;
 
    var runs = await db.automationRun.findMany({
      where: where,
      orderBy: { startedAt: 'desc' },
      take: Math.min(limit, 200),
    });
 
    return NextResponse.json(runs);
  } catch (error: any) {
    console.error('[AutomationRuns GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}