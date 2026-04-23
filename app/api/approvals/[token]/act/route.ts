import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createNotification } from '@/lib/notifications';
import { addLedgerEntry } from '@/lib/approvalLedger';
import { wsBroadcast } from '@/lib/wsBroadcast';

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, reason } = await request.json();
  if (!action || !['approved', 'denied'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const approvalRequest = await db.approvalRequest.findUnique({
    where: { token: params.token },
    include: { workflow: true },
  });

  if (!approvalRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (approvalRequest.status === 'approved' || approvalRequest.status === 'denied') {
    return NextResponse.json({ error: `Already ${approvalRequest.status}` }, { status: 409 });
  }

  const stages = (approvalRequest.workflow.stages as any[]) || [];
  const currentStage = stages.find((s: any) => s.order === approvalRequest.currentStage);
  if (!currentStage) return NextResponse.json({ error: 'Invalid stage' }, { status: 500 });

  // Verify approver for current stage
  const row = await db.agoraRow.findUnique({ where: { id: approvalRequest.rowId } });
  const rowData = (row?.data || {}) as Record<string, any>;
  const stageApprovers = await resolveStageApprovers(currentStage, rowData);

  if (!stageApprovers.includes(session.user.id)) {
    return NextResponse.json({ error: 'Not authorized for this stage' }, { status: 403 });
  }

  // Atomic check-and-create to prevent race condition
  var actionRecord;
  try {
    actionRecord = await db.$transaction(async function(tx) {
      var existing = await tx.approvalAction.findFirst({
        where: { requestId: approvalRequest.id, userId: session.user.id },
      });
      if (existing) throw new Error('ALREADY_ACTED');

      return await tx.approvalAction.create({
        data: {
          requestId: approvalRequest.id,
          userId: session.user.id,
          action,
          reason: reason || null,
        },
      });
    });
  } catch (txErr: any) {
    if (txErr.message === 'ALREADY_ACTED') {
      return NextResponse.json({ error: 'Already acted' }, { status: 409 });
    }
    throw txErr;
  }

  // Ledger entry
  await addLedgerEntry({
    tableId: approvalRequest.tableId,
    rowId: approvalRequest.rowId,
    workflowId: approvalRequest.workflowId,
    requestId: approvalRequest.id,
    action: action === 'approved' ? 'stage_approved' : 'stage_denied',
    stage: approvalRequest.currentStage,
    stageName: currentStage.name,
    actorId: session.user.id,
    actorName: session.user.name || '',
    actorEmail: session.user.email || '',
    rowSnapshot: rowData,
    reason: reason || undefined,
    workflowName: approvalRequest.workflow.name,
    requiredApprovers: stageApprovers,
  });

  // Determine if current stage is resolved
  const allActions = await db.approvalAction.findMany({ where: { requestId: approvalRequest.id } });
  const stageStatuses = (approvalRequest.stageStatuses as Record<string, string>) || {};

  if (action === 'denied') {
    // Denial at any stage ends the whole request
    stageStatuses[String(approvalRequest.currentStage)] = 'denied';

    await db.approvalRequest.update({
      where: { id: approvalRequest.id },
      data: { status: 'denied', stageStatuses, resolvedAt: new Date() },
    });

    // Update approval column
    await updateApprovalColumn(approvalRequest, stageStatuses, 'denied', stages);

    // Apply deny value
    const workflow = approvalRequest.workflow;
    if (row && workflow.denyColumnId && workflow.denyValue) {
      const data = row.data as Record<string, any>;
      data[workflow.denyColumnId] = workflow.denyValue;
      await db.agoraRow.update({ where: { id: row.id }, data: { data } });
      if (workflow.denyColumnId) {
        wsBroadcast(approvalRequest.tableId, { type: 'cell-update', rowId: approvalRequest.rowId, columnId: workflow.denyColumnId, value: data[workflow.denyColumnId] });
      }
    }
    // Unlock row on denial so it can be edited
    await db.agoraRow.update({ where: { id: approvalRequest.rowId }, data: { isLocked: false, lockedById: null } });
    wsBroadcast(approvalRequest.tableId, { type: 'row-lock', rowId: approvalRequest.rowId, isLocked: false });

    // Ledger: denied
    await addLedgerEntry({
      tableId: approvalRequest.tableId,
      rowId: approvalRequest.rowId,
      workflowId: approvalRequest.workflowId,
      requestId: approvalRequest.id,
      action: 'denied',
      stage: approvalRequest.currentStage,
      stageName: currentStage.name,
      actorId: session.user.id,
      actorName: session.user.name || '',
      actorEmail: session.user.email || '',
      rowSnapshot: rowData,
      reason: reason || undefined,
      workflowName: approvalRequest.workflow.name,
    });

    // Notify requester
    const table = await db.agoraTable.findUnique({ where: { id: approvalRequest.tableId }, select: { name: true } });
    await createNotification({
      userId: approvalRequest.requestedById,
      type: 'approval_completed',
      title: `Request denied: ${table?.name || 'Record'}`,
      message: `${session.user.name || session.user.email} denied your request at stage "${currentStage.name}".${reason ? ' Reason: ' + reason : ''}`,
      tableId: approvalRequest.tableId,
      rowId: approvalRequest.rowId,
      metadata: { requestId: approvalRequest.id, action: 'denied', stage: currentStage.name, reason },
    });
	
	// Fire approval_denied automation trigger
    try {
      var { onApprovalDenied } = await import('@/lib/automations/hooks');
      onApprovalDenied(approvalRequest.tableId, approvalRequest.rowId, rowData, {
        workflowId: approvalRequest.workflowId,
        workflowName: approvalRequest.workflow.name,
        requestId: approvalRequest.id,
        deniedBy: session.user.id,
        reason: reason || undefined,
      });
    } catch (autoErr) { console.error('[Approval] Automation trigger error:', autoErr); }

    return NextResponse.json({ success: true, status: 'denied', resolved: true });
  }

  // Approved — check if stage is complete
  let stageComplete = false;
  if (currentStage.requireAll) {
    const approvedCount = allActions.filter(a => a.action === 'approved').length;
    stageComplete = approvedCount >= stageApprovers.length;
  } else {
    stageComplete = true; // Any single approval completes the stage
  }

  if (stageComplete) {
    stageStatuses[String(approvalRequest.currentStage)] = 'approved';

    // Check if there are more stages
    const nextStage = stages.find((s: any) => s.order === approvalRequest.currentStage + 1);

    if (nextStage) {
      // Check if next stage has a condition
      let skipNextStage = false;
      if (nextStage.condition && row) {
        const condVal = rowData[nextStage.condition.columnId];
        skipNextStage = !evaluateCondition(condVal, nextStage.condition.operator, nextStage.condition.value);
      }

      if (skipNextStage) {
        // Skip this stage, check for the one after
        stageStatuses[String(nextStage.order)] = 'skipped';
        // Find the next non-skipped stage
        let advanceTo = null;
        for (let i = nextStage.order + 1; i <= stages.length; i++) {
          const s = stages.find((st: any) => st.order === i);
          if (s) { advanceTo = s; break; }
        }

        if (!advanceTo) {
          // All stages done — approved!
          return await finalizeApproval(approvalRequest, stageStatuses, stages, row, session, reason);
        } else {
          stageStatuses[String(advanceTo.order)] = 'pending';
          await db.approvalRequest.update({
            where: { id: approvalRequest.id },
            data: { currentStage: advanceTo.order, stageStatuses, status: 'in_progress' },
          });
          await updateApprovalColumn(approvalRequest, stageStatuses, 'in_progress', stages);
          await notifyStageApprovers(advanceTo, approvalRequest, rowData, session);
          return NextResponse.json({ success: true, status: 'in_progress', currentStage: advanceTo.order, resolved: false });
        }
      }

      // Advance to next stage
      stageStatuses[String(nextStage.order)] = 'pending';
      await db.approvalRequest.update({
        where: { id: approvalRequest.id },
        data: { currentStage: nextStage.order, stageStatuses, status: 'in_progress' },
      });

      await updateApprovalColumn(approvalRequest, stageStatuses, 'in_progress', stages);

      // Ledger: advanced
      await addLedgerEntry({
        tableId: approvalRequest.tableId,
        rowId: approvalRequest.rowId,
        workflowId: approvalRequest.workflowId,
        requestId: approvalRequest.id,
        action: 'advanced',
        stage: nextStage.order,
        stageName: nextStage.name,
        actorId: 'system',
        actorName: 'System',
        actorEmail: 'system@agora',
        rowSnapshot: rowData,
        workflowName: approvalRequest.workflow.name,
      });

      // Notify next stage approvers
      await notifyStageApprovers(nextStage, approvalRequest, rowData, session);

      return NextResponse.json({ success: true, status: 'in_progress', currentStage: nextStage.order, resolved: false });
    } else {
      // No more stages — fully approved!
      return await finalizeApproval(approvalRequest, stageStatuses, stages, row, session, reason);
    }
  }

  // Stage not yet complete (requireAll and waiting on more approvers)
  await db.approvalRequest.update({
    where: { id: approvalRequest.id },
    data: { stageStatuses },
  });
  await updateApprovalColumn(approvalRequest, stageStatuses, 'in_progress', stages);

  return NextResponse.json({ success: true, status: 'in_progress', resolved: false });
}

async function finalizeApproval(approvalRequest: any, stageStatuses: any, stages: any[], row: any, session: any, reason?: string) {
  stageStatuses[String(stages[stages.length - 1].order)] = 'approved';

  await db.approvalRequest.update({
    where: { id: approvalRequest.id },
    data: { status: 'approved', stageStatuses, resolvedAt: new Date() },
  });

  const workflow = approvalRequest.workflow;

  if (row) {
    const data = row.data as Record<string, any>;
    if (workflow.approveColumnId && workflow.approveValue) {
      data[workflow.approveColumnId] = workflow.approveValue;
    }
    await db.agoraRow.update({
      where: { id: row.id },
      data: { data, isLocked: workflow.lockOnApprove, lockedById: workflow.lockOnApprove ? session.user.id : null },
    });
    if (workflow.approveColumnId) {
      wsBroadcast(approvalRequest.tableId, { type: 'cell-update', rowId: approvalRequest.rowId, columnId: workflow.approveColumnId, value: data[workflow.approveColumnId] });
    }
    if (workflow.lockOnApprove) {
      wsBroadcast(approvalRequest.tableId, { type: 'row-lock', rowId: approvalRequest.rowId, isLocked: true });
    }
  }

  await updateApprovalColumn(approvalRequest, stageStatuses, 'approved', stages);

  // Ledger: completed
  await addLedgerEntry({
    tableId: approvalRequest.tableId,
    rowId: approvalRequest.rowId,
    workflowId: approvalRequest.workflowId,
    requestId: approvalRequest.id,
    action: 'completed',
    actorId: 'system',
    actorName: 'System',
    actorEmail: 'system@agora',
    rowSnapshot: (row?.data || {}),
    workflowName: workflow.name,
  });

  const table = await db.agoraTable.findUnique({ where: { id: approvalRequest.tableId }, select: { name: true } });
  await createNotification({
    userId: approvalRequest.requestedById,
    type: 'approval_completed',
    title: `Request approved: ${table?.name || 'Record'}`,
    message: `Your request has been fully approved through all stages.`,
    tableId: approvalRequest.tableId,
    rowId: approvalRequest.rowId,
    metadata: { requestId: approvalRequest.id, action: 'approved' },
  });
  
  // Fire approval_completed automation trigger
    try {
      var { onApprovalCompleted } = await import('@/lib/automations/hooks');
      onApprovalCompleted(approvalRequest.tableId, approvalRequest.rowId, (row?.data || {}) as Record<string, any>, {
        workflowId: approvalRequest.workflowId,
        workflowName: workflow.name,
        requestId: approvalRequest.id,
        approvedBy: session.user.id,
      });
    } catch (autoErr) { console.error('[Approval] Automation trigger error:', autoErr); }

  return NextResponse.json({ success: true, status: 'approved', resolved: true });
}

async function updateApprovalColumn(approvalRequest: any, stageStatuses: any, status: string, stages: any[]) {
  const workflow = approvalRequest.workflow;
  if (!workflow.approvalColumnId) return;

  try {
    const row = await db.agoraRow.findUnique({ where: { id: approvalRequest.rowId } });
    if (!row) return;
    const data = row.data as Record<string, any>;
    data[workflow.approvalColumnId] = JSON.stringify({
      status,
      currentStage: approvalRequest.currentStage,
      stageStatuses,
      totalStages: stages.length,
      stages: stages.map((s: any) => ({ order: s.order, name: s.name })),
    });
    await db.agoraRow.update({ where: { id: row.id }, data: { data } });
    wsBroadcast(approvalRequest.tableId, { type: 'cell-update', rowId: approvalRequest.rowId, columnId: workflow.approvalColumnId, value: data[workflow.approvalColumnId] });
  } catch {}
}

async function notifyStageApprovers(stage: any, approvalRequest: any, rowData: any, session: any) {
  const { createNotification } = await import('@/lib/notifications');
  const approvers = await resolveStageApprovers(stage, rowData);
  const table = await db.agoraTable.findUnique({ where: { id: approvalRequest.tableId }, select: { name: true } });

  for (const approverId of approvers) {
    await createNotification({
      userId: approverId,
      type: 'approval_requested',
      title: `Approval needed: ${table?.name || 'Record'} — ${stage.name}`,
      message: `${session.user.name || session.user.email} needs your approval at stage "${stage.name}".`,
      tableId: approvalRequest.tableId,
      rowId: approvalRequest.rowId,
      metadata: { requestId: approvalRequest.id, workflowId: approvalRequest.workflowId, token: approvalRequest.token, stage: stage.name },
      sendEmailNotification: false,
    });
  }
}

async function resolveStageApprovers(stage: any, rowData: Record<string, any>): Promise<string[]> {
  const approverIds: string[] = [...(stage.approverUserIds || [])];

  // Resolve group members
  const groupIds = stage.approverGroupIds || [];
  if (groupIds.length > 0) {
    const members = await db.groupMember.findMany({
      where: { groupId: { in: groupIds } },
      select: { userId: true },
    });
    approverIds.push(...members.map(m => m.userId));
  }

  // Resolve dynamic approver from column
  if (stage.dynamicApproverColumnId) {
    const val = rowData[stage.dynamicApproverColumnId];
    if (val) {
      // Try to find user by ID, email, or name
      const user = await db.user.findFirst({
        where: {
          OR: [
            { id: String(val) },
            { email: String(val) },
            { name: String(val) },
          ],
        },
        select: { id: true },
      });
      if (user) approverIds.push(user.id);
    }
  }

  return [...new Set(approverIds)];
}

function evaluateCondition(value: any, operator: string, target: string): boolean {
  const numVal = parseFloat(value);
  const numTarget = parseFloat(target);
  switch (operator) {
    case '>': return numVal > numTarget;
    case '<': return numVal < numTarget;
    case '>=': return numVal >= numTarget;
    case '<=': return numVal <= numTarget;
    case '=': case '==': return String(value) === target;
    case '!=': return String(value) !== target;
    default: return true;
  }
}