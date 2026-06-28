import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canEditAutomation } from '@/lib/automations/access';
import { rerunAutomationRun } from '@/lib/automations/engine';

export const dynamic = 'force-dynamic';

// POST /api/automations/[id]/runs/[runId]/rerun
// Resubmit a past run with its original trigger inputs. Creates a new run.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  try {
    var { id, runId } = await params;
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    var userId = (session.user as any).id;

    var automation = await db.automation.findUnique({ where: { id: id } });
    if (!automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    // Re-running executes the actions (writes data / sends email), so require edit access.
    var canEdit = await canEditAutomation(userId, automation);
    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden — you need edit access to re-run this automation' }, { status: 403 });
    }

    // The run must belong to this automation.
    var run = await db.automationRun.findUnique({ where: { id: runId }, select: { automationId: true } });
    if (!run || run.automationId !== id) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    if (!automation.enabled) {
      return NextResponse.json({ error: 'Automation is disabled — enable it before re-running' }, { status: 400 });
    }

    var result = await rerunAutomationRun(runId, userId);
    return NextResponse.json({
      success: true,
      runId: result.runId,
      status: result.status,
      errorMessage: result.errorMessage,
    });
  } catch (error: any) {
    console.error('[Automation Rerun]', error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Re-run failed' : error.message },
      { status: 500 }
    );
  }
}
