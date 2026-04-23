import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { runManualAutomation } from '@/lib/automations/engine';

export const dynamic = 'force-dynamic';

// POST /api/automations/[id]/run — run a manual automation on selected rows
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    var body = await request.json();
    var { rowIds, tableId } = body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return NextResponse.json({ error: 'rowIds array is required' }, { status: 400 });
    }

    if (!tableId) {
      return NextResponse.json({ error: 'tableId is required' }, { status: 400 });
    }

    // Verify user has at least editor access to the table
    var { getTablePermission } = await import('@/lib/tablePermissions');
    var permission = await getTablePermission((session.user as any).id, tableId);
    if (!permission || permission === 'viewer') {
      return NextResponse.json({ error: 'You need at least editor access to run actions' }, { status: 403 });
    }

    // Verify the automation exists and is manual
    var automation = await db.automation.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, triggerType: true, enabled: true },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    if (automation.triggerType !== 'manual') {
      return NextResponse.json({ error: 'This automation is not a manual trigger' }, { status: 400 });
    }

    if (!automation.enabled) {
      return NextResponse.json({ error: 'This automation is disabled' }, { status: 400 });
    }

    // Cap row count to prevent abuse
    if (rowIds.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 rows per run' }, { status: 400 });
    }

    var result = await runManualAutomation(
      params.id,
      tableId,
      rowIds,
      (session.user as any).id
    );

    return NextResponse.json({
      success: true,
      automationName: automation.name,
      rowsProcessed: rowIds.length,
      runIds: result.runIds,
      errors: result.errors,
      hasErrors: result.errors.length > 0,
    });
  } catch (error: any) {
    console.error('[Manual Automation Run Error]:', error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Run failed' : error.message },
      { status: 500 }
    );
  }
}