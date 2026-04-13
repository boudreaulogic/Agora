import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export async function POST(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tablePerm = await getTablePermission(session.user.id, params.id);
  if (tablePerm !== 'owner' && tablePerm !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can lock or unlock rows' }, { status: 403 });
  }

  const row = await db.agoraRow.findUnique({
    where: { id: params.rowId },
  });
  if (!row || row.tableId !== params.id) {
    return NextResponse.json({ error: 'Row not found' }, { status: 404 });
  }

  const { lock } = await request.json();
  const isAdminOrOwner = true; // already verified owner/admin above

  // To unlock: must be admin/owner OR the person who locked it
  if (!lock && row.isLocked) {
    if (!isAdminOrOwner && row.lockedById !== session.user.id) {
      return NextResponse.json({ error: 'Only admins or the locker can unlock this row' }, { status: 403 });
    }
  }

  // Check if this row has an active approval — warn but allow admins
  const activeApproval = await db.approvalRequest.findFirst({
    where: { rowId: params.rowId, status: { in: ['pending', 'in_progress'] } },
    include: { workflow: true },
  });

  // If unlocking a row that's in approval, only admins can do it
  if (!lock && activeApproval && !isAdminOrOwner) {
    return NextResponse.json({ error: 'This row is in an active approval process. Only admins can unlock it.' }, { status: 403 });
  }

  const updated = await db.agoraRow.update({
    where: { id: params.rowId },
    data: {
      isLocked: lock,
      lockedById: lock ? session.user.id : null,
    },
  });

  // Log to approval ledger if this row has any approval history
  const hasApprovalHistory = await db.approvalLedger.findFirst({
    where: { tableId: params.id, rowId: params.rowId },
  });

  if (hasApprovalHistory || activeApproval) {
    try {
      const { addLedgerEntry } = await import('@/lib/approvalLedger');
      const workflow = activeApproval?.workflow || await db.approvalWorkflow.findUnique({ where: { tableId: params.id } });

      await addLedgerEntry({
        tableId: params.id,
        rowId: params.rowId,
        workflowId: workflow?.id || 'unknown',
        requestId: activeApproval?.id,
        action: lock ? 'row_locked' : 'row_unlocked',
        actorId: session.user.id,
        actorName: session.user.name || '',
        actorEmail: session.user.email || '',
        rowSnapshot: row.data as any,
        reason: !lock && activeApproval ? 'Admin override — unlocked during active approval' : undefined,
        workflowName: workflow?.name || 'Unknown',
      });
    } catch (err) {
      console.error('Ledger entry error:', err);
    }
  }

  return NextResponse.json({ row: updated });
}