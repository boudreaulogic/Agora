import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createNotification } from '@/lib/notifications';
import { generateExportPdf } from '@/lib/generateExportPdf';
import { wsBroadcast } from '@/lib/wsBroadcast';

// POST /api/approvals/[token]/action — process an approval action (no auth — token IS the auth)
export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  const body = await request.json();
  const { action, userId, reason } = body;

  // Capture IP and user agent for audit trail
  const ipAddress = request.headers.get('cf-connecting-ip') 
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const userAgent = request.headers.get('user-agent') || '';
  
  // Resolve GeoIP (best effort)
  let geoLocation = '';
  try {
    if (ipAddress && ipAddress !== 'unknown' && ipAddress !== '127.0.0.1') {
      const geoRes = await fetch(`http://ip-api.com/json/${ipAddress}?fields=city,regionName,country`);
      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo.city) geoLocation = `${geo.city}, ${geo.regionName}, ${geo.country}`;
      }
    }
  } catch {}

  if (!action || !userId || !['approve', 'deny'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action or missing userId' }, { status: 400 });
  }

  // Find the approval request by token
  const approvalRequest = await db.approvalRequest.findUnique({
    where: { token: params.token },
    include: { workflow: true },
  });

  if (!approvalRequest) {
    return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
  }

  if (approvalRequest.status !== 'pending' && approvalRequest.status !== 'in_progress') {
    return NextResponse.json({ error: `This request has already been ${approvalRequest.status}` }, { status: 400 });
  }

  // Verify this user is an approver for the current stage
  const stages = (approvalRequest.workflow.stages as any[]) || [];
  const currentStage = stages.find((s: any) => s.order === approvalRequest.currentStage);

  if (!currentStage) {
    return NextResponse.json({ error: 'Invalid workflow stage' }, { status: 400 });
  }

  const approverUserIds = [...(currentStage.approverUserIds || [])];

  // Also check group memberships
  if (currentStage.approverGroupIds?.length > 0) {
    const groupMembers = await db.groupMember.findMany({
      where: { groupId: { in: currentStage.approverGroupIds } },
      select: { userId: true },
    });
    approverUserIds.push(...groupMembers.map(m => m.userId));
  }

  // Check dynamic approver
  if (currentStage.dynamicApproverColumnId) {
    const row = await db.agoraRow.findUnique({ where: { id: approvalRequest.rowId } });
    if (row) {
      const rowData = row.data as Record<string, any>;
      const val = rowData[currentStage.dynamicApproverColumnId];
      if (val) {
        const dynUser = await db.user.findFirst({
          where: { OR: [{ id: String(val) }, { email: String(val) }, { name: String(val) }] },
          select: { id: true },
        });
        if (dynUser) approverUserIds.push(dynUser.id);
      }
    }
  }

  const uniqueApproverIds = [...new Set(approverUserIds)];
  if (!uniqueApproverIds.includes(userId)) {
    return NextResponse.json({ error: 'You are not authorized to approve this request' }, { status: 403 });
  }

  // Check if already acted
  const existingAction = await db.approvalAction.findFirst({
    where: { requestId: approvalRequest.id, userId },
  });

  if (existingAction) {
    return NextResponse.json({ error: `You have already ${existingAction.action} this request` }, { status: 400 });
  }
  
  // Atomic check-and-create to prevent race condition
  var actionRecord;
  try {
    actionRecord = await db.$transaction(async function(tx) {
      var existing = await tx.approvalAction.findFirst({
        where: { requestId: approvalRequest.id, userId },
      });
      if (existing) throw new Error('ALREADY_ACTED:' + existing.action);

      return await tx.approvalAction.create({
        data: {
          requestId: approvalRequest.id,
          userId,
          action,
          reason: reason || null,
          ipAddress,
          geoLocation: geoLocation || null,
          userAgent: userAgent || null,
        } as any,
      });
    });
  } catch (txErr: any) {
    if (txErr.message?.startsWith('ALREADY_ACTED')) {
      var prevAction = txErr.message.split(':')[1];
      return NextResponse.json({ error: 'You have already ' + prevAction + ' this request' }, { status: 400 });
    }
    throw txErr;
  }

  // Get the user info for the ledger
  const actor = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  if (!actor) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Record the action with IP + geo
  await db.approvalAction.create({
    data: {
      requestId: approvalRequest.id,
      userId,
      action,
      reason: reason || null,
      ipAddress,
      geoLocation: geoLocation || null,
      userAgent: userAgent || null,
    } as any,
  });

  // Get the row for snapshot
  const row = await db.agoraRow.findUnique({ where: { id: approvalRequest.rowId } });
  const rowData = (row?.data || {}) as Record<string, any>;

  // Add ledger entry
  const { addLedgerEntry } = await import('@/lib/approvalLedger');
  await addLedgerEntry({
    tableId: approvalRequest.tableId,
    rowId: approvalRequest.rowId,
    workflowId: approvalRequest.workflowId,
    requestId: approvalRequest.id,
    action: action === 'approve' ? 'stage_approved' : 'stage_denied',
    stage: approvalRequest.currentStage,
    stageName: currentStage.name,
    actorId: userId,
    actorName: actor.name || '',
    actorEmail: actor.email || '',
    rowSnapshot: rowData,
    reason: reason || undefined,
    workflowName: approvalRequest.workflow.name,
    requiredApprovers: uniqueApproverIds,
  });

  // Determine next steps
  if (action === 'deny') {
    // Deny the whole request
    await db.approvalRequest.update({
      where: { id: approvalRequest.id },
      data: {
        status: 'denied',
        resolvedAt: new Date(),
        stageStatuses: { ...(approvalRequest.stageStatuses as any), [String(approvalRequest.currentStage)]: 'denied' },
      },
    });

    // Update trigger column to deny value
    if (approvalRequest.workflow.denyColumnId && approvalRequest.workflow.denyValue && row) {
      rowData[approvalRequest.workflow.denyColumnId] = approvalRequest.workflow.denyValue;
    }

    // Update approval status column
    if (approvalRequest.workflow.approvalColumnId) {
      rowData[approvalRequest.workflow.approvalColumnId] = JSON.stringify({
        status: 'denied',
        currentStage: approvalRequest.currentStage,
        stageStatuses: { ...(approvalRequest.stageStatuses as any), [String(approvalRequest.currentStage)]: 'denied' },
        totalStages: stages.length,
        stages: stages.map((s: any) => ({ order: s.order, name: s.name })),
      });
    }

    // Unlock the row
    await db.agoraRow.update({
      where: { id: approvalRequest.rowId },
      data: { data: rowData, isLocked: false, lockedById: null },
    });

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
      actorId: 'system',
      actorName: 'System',
      actorEmail: '',
      rowSnapshot: rowData,
      workflowName: approvalRequest.workflow.name,
    });

    // Notify requester
    const table = await db.agoraTable.findUnique({ where: { id: approvalRequest.tableId }, select: { name: true } });
    await createNotification({
      userId: approvalRequest.requestedById,
      type: 'approval_completed',
      title: `Request denied: ${table?.name || 'Record'}`,
      message: `${actor.name || actor.email} denied your request${reason ? ': ' + reason : ''}.`,
      tableId: approvalRequest.tableId,
      rowId: approvalRequest.rowId,
      sendEmailNotification: true,
    });
	
	// Fire approval_denied automation trigger
    try {
      var { onApprovalDenied } = await import('@/lib/automations/hooks');
      onApprovalDenied(approvalRequest.tableId, approvalRequest.rowId, rowData, {
        workflowId: approvalRequest.workflowId,
        workflowName: approvalRequest.workflow.name,
        requestId: approvalRequest.id,
        deniedBy: userId,
        reason: reason || undefined,
      });
    } catch (autoErr) { console.error('[Approval] Automation trigger error:', autoErr); }

    return NextResponse.json({ success: true, status: 'denied' });
  }

  // APPROVE logic
  if (action === 'approve') {
    // Check if all required approvers have approved (if requireAll)
    if (currentStage.requireAll) {
      const allActions = await db.approvalAction.findMany({
        where: { requestId: approvalRequest.id },
      });
      const approvedUserIds = allActions.filter(a => a.action === 'approved').map(a => a.userId);
      approvedUserIds.push(userId); // Include current
      const allApproved = uniqueApproverIds.every(id => approvedUserIds.includes(id));

      if (!allApproved) {
        // Stage not fully approved yet — update status to in_progress
        await db.approvalRequest.update({
          where: { id: approvalRequest.id },
          data: { status: 'in_progress' },
        });
        return NextResponse.json({ success: true, status: 'in_progress', message: 'Awaiting remaining approvers' });
      }
    }

    // Stage is approved — advance or complete
    const stageStatuses = { ...(approvalRequest.stageStatuses as any), [String(approvalRequest.currentStage)]: 'approved' };
    const nextStageNum = approvalRequest.currentStage + 1;
    const nextStage = stages.find((s: any) => s.order === nextStageNum);

    if (nextStage) {
      // Check if next stage has a condition
      let skipNext = false;
      if (nextStage.condition && nextStage.condition.columnId) {
        const condVal = rowData[nextStage.condition.columnId];
        const condTarget = nextStage.condition.value;
        const op = nextStage.condition.operator;
        const numVal = parseFloat(condVal);
        const numTarget = parseFloat(condTarget);

        if (op === '>' && !(numVal > numTarget)) skipNext = true;
        if (op === '<' && !(numVal < numTarget)) skipNext = true;
        if (op === '>=' && !(numVal >= numTarget)) skipNext = true;
        if (op === '<=' && !(numVal <= numTarget)) skipNext = true;
        if (op === '=' && String(condVal) !== String(condTarget)) skipNext = true;
        if (op === '!=' && String(condVal) === String(condTarget)) skipNext = true;
      }

      if (skipNext) {
        stageStatuses[String(nextStageNum)] = 'skipped';
      }

      // If there's another stage after the skipped one, advance there
      // Otherwise fall through to completion
      const targetStage = skipNext
        ? stages.find((s: any) => s.order > nextStageNum)
        : nextStage;

      if (targetStage) {
        stageStatuses[String(targetStage.order)] = 'pending';

        await db.approvalRequest.update({
          where: { id: approvalRequest.id },
          data: {
            currentStage: targetStage.order,
            stageStatuses,
            status: 'in_progress',
          },
        });

        // Update approval column
        if (approvalRequest.workflow.approvalColumnId) {
          rowData[approvalRequest.workflow.approvalColumnId] = JSON.stringify({
            status: 'in_progress',
            currentStage: targetStage.order,
            stageStatuses,
            totalStages: stages.length,
            stages: stages.map((s: any) => ({ order: s.order, name: s.name })),
          });
          await db.agoraRow.update({ where: { id: approvalRequest.rowId }, data: { data: rowData } });
        }

        // Ledger: advanced
        await addLedgerEntry({
          tableId: approvalRequest.tableId,
          rowId: approvalRequest.rowId,
          workflowId: approvalRequest.workflowId,
          requestId: approvalRequest.id,
          action: 'advanced',
          stage: targetStage.order,
          stageName: targetStage.name,
          actorId: 'system',
          actorName: 'System',
          actorEmail: '',
          rowSnapshot: rowData,
          workflowName: approvalRequest.workflow.name,
        });

        // Notify next stage approvers
        const table = await db.agoraTable.findUnique({ where: { id: approvalRequest.tableId }, select: { name: true } });
        const nextApproverIds = [...(targetStage.approverUserIds || [])];
        for (const appId of nextApproverIds) {
          await createNotification({
            userId: appId,
            type: 'approval_requested',
            title: `Approval needed: ${table?.name || 'Record'} — ${targetStage.name}`,
            message: `A record has advanced to your approval stage.`,
            tableId: approvalRequest.tableId,
            rowId: approvalRequest.rowId,
            metadata: { token: approvalRequest.token },
            sendEmailNotification: true,
          });
        }

        return NextResponse.json({ success: true, status: 'advanced', nextStage: targetStage.name });
      }
    }

    // No more stages — FULLY APPROVED
    stageStatuses[String(approvalRequest.currentStage)] = 'approved';

    await db.approvalRequest.update({
      where: { id: approvalRequest.id },
      data: {
        status: 'approved',
        resolvedAt: new Date(),
        stageStatuses,
      },
    });

    // Update trigger column to approve value
    if (approvalRequest.workflow.approveColumnId && approvalRequest.workflow.approveValue) {
      rowData[approvalRequest.workflow.approveColumnId] = approvalRequest.workflow.approveValue;
    }

    // Update approval column
    if (approvalRequest.workflow.approvalColumnId) {
      rowData[approvalRequest.workflow.approvalColumnId] = JSON.stringify({
        status: 'approved',
        currentStage: approvalRequest.currentStage,
        stageStatuses,
        totalStages: stages.length,
        stages: stages.map((s: any) => ({ order: s.order, name: s.name })),
      });
    }

    // Lock or unlock based on setting
    const shouldLock = approvalRequest.workflow.lockOnApprove;
    await db.agoraRow.update({
      where: { id: approvalRequest.rowId },
      data: { data: rowData, isLocked: shouldLock },
    });

    wsBroadcast(approvalRequest.tableId, { type: 'row-lock', rowId: approvalRequest.rowId, isLocked: shouldLock });

    // Ledger: completed
    await addLedgerEntry({
      tableId: approvalRequest.tableId,
      rowId: approvalRequest.rowId,
      workflowId: approvalRequest.workflowId,
      requestId: approvalRequest.id,
      action: 'completed',
      stage: approvalRequest.currentStage,
      stageName: currentStage.name,
      actorId: 'system',
      actorName: 'System',
      actorEmail: '',
      rowSnapshot: rowData,
      workflowName: approvalRequest.workflow.name,
    });

    // Notify requester
    const table = await db.agoraTable.findUnique({ where: { id: approvalRequest.tableId }, select: { name: true } });
    await createNotification({
      userId: approvalRequest.requestedById,
      type: 'approval_completed',
      title: `Request approved: ${table?.name || 'Record'}`,
      message: `Your request has been fully approved!`,
      tableId: approvalRequest.tableId,
      rowId: approvalRequest.rowId,
      sendEmailNotification: true,
    });

    // Auto-generate and attach PDF if Record Export template exists
    try {
      await generateExportPdf(approvalRequest.tableId, approvalRequest.rowId, userId);
    } catch (e) {
      console.error('[Auto-PDF] Failed to auto-generate PDF on approval:', e);
    }
	
	// Fire row_updated + column_match triggers so automations like "Push to SP on Approved" fire
    try {
      var { onRowUpdated } = await import('@/lib/automations/hooks');
      var previousData = Object.assign({}, rowData);
      if (approvalRequest.workflow.approveColumnId) { previousData[approvalRequest.workflow.approveColumnId] = undefined; }
      onRowUpdated(approvalRequest.tableId, approvalRequest.rowId, rowData, previousData, userId);
    } catch (autoErr2) { console.error('[Approval] Row updated trigger error:', autoErr2); }
	
	// Fire approval_completed automation trigger
    try {
      var { onApprovalCompleted } = await import('@/lib/automations/hooks');
      onApprovalCompleted(approvalRequest.tableId, approvalRequest.rowId, rowData, {
        workflowId: approvalRequest.workflowId,
        workflowName: approvalRequest.workflow.name,
        requestId: approvalRequest.id,
        approvedBy: userId,
      });
    } catch (autoErr) { console.error('[Approval] Automation trigger error:', autoErr); }

    return NextResponse.json({ success: true, status: 'approved' });
  }

  return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
}