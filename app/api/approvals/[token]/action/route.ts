import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { createNotification } from '@/lib/notifications';
import { generateExportPdf } from '@/lib/generateExportPdf';
import { wsBroadcast } from '@/lib/wsBroadcast';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimiter';

// POST /api/approvals/[token]/action — process an approval action
// Identity is derived from the session; the token authorizes access to this
// specific request. Caller-supplied userId is never trusted.
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  var rl = checkRateLimit(request, 'mutation');
  if (!rl.allowed) return rateLimitResponse(rl);

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { action, reason } = body;
  const userId = session.user.id;
  const actorName = session.user.name || '';
  const actorEmail = session.user.email || '';

  // Capture IP and user agent for audit trail
  const ipAddress = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const userAgent = request.headers.get('user-agent') || '';

  // Resolve GeoIP (best effort)
  var geoLocation = '';
  try {
    if (ipAddress && ipAddress !== 'unknown' && ipAddress !== '127.0.0.1') {
      var geoRes = await fetch(`https://ip-api.com/json/${ipAddress}?fields=city,regionName,country`);
      if (geoRes.ok) {
        var geo = await geoRes.json();
        if (geo.city) geoLocation = `${geo.city}, ${geo.regionName}, ${geo.country}`;
      }
    }
  } catch {}

  if (!action || !['approve', 'deny'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

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

  // Verify this session user is an approver for the current stage
  const stages = (approvalRequest.workflow.stages as any[]) || [];
  const currentStage = stages.find((s: any) => s.order === approvalRequest.currentStage);

  if (!currentStage) {
    return NextResponse.json({ error: 'Invalid workflow stage' }, { status: 400 });
  }

  const approverUserIds = [...(currentStage.approverUserIds || [])];

  if (currentStage.approverGroupIds?.length > 0) {
    var groupMembers = await db.groupMember.findMany({
      where: { groupId: { in: currentStage.approverGroupIds } },
      select: { userId: true },
    });
    approverUserIds.push(...groupMembers.map(function(m) { return m.userId; }));
  }

  if (currentStage.dynamicApproverColumnId) {
    var row0 = await db.agoraRow.findUnique({ where: { id: approvalRequest.rowId } });
    if (row0) {
      var rowData0 = row0.data as Record<string, any>;
      var val0 = rowData0[currentStage.dynamicApproverColumnId];
      if (val0) {
        var dynUser = await db.user.findFirst({
          where: { OR: [{ id: String(val0) }, { email: String(val0) }, { name: String(val0) }] },
          select: { id: true },
        });
        if (dynUser) approverUserIds.push(dynUser.id);
      }
    }
  }

  var uniqueApproverIds = [...new Set(approverUserIds)];
  if (!uniqueApproverIds.includes(userId)) {
    return NextResponse.json({ error: 'You are not authorized to approve this request' }, { status: 403 });
  }

  // Atomic check-and-create to prevent race conditions
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

  // Get the row for snapshot
  var row = await db.agoraRow.findUnique({ where: { id: approvalRequest.rowId } });
  var rowData = (row?.data || {}) as Record<string, any>;

  // Add ledger entry
  var { addLedgerEntry } = await import('@/lib/approvalLedger');
  await addLedgerEntry({
    tableId: approvalRequest.tableId,
    rowId: approvalRequest.rowId,
    workflowId: approvalRequest.workflowId,
    requestId: approvalRequest.id,
    action: action === 'approve' ? 'stage_approved' : 'stage_denied',
    stage: approvalRequest.currentStage,
    stageName: currentStage.name,
    actorId: userId,
    actorName,
    actorEmail,
    rowSnapshot: rowData,
    reason: reason || undefined,
    workflowName: approvalRequest.workflow.name,
    requiredApprovers: uniqueApproverIds,
  });

  // Determine next steps
  if (action === 'deny') {
    await db.approvalRequest.update({
      where: { id: approvalRequest.id },
      data: {
        status: 'denied',
        resolvedAt: new Date(),
        stageStatuses: { ...(approvalRequest.stageStatuses as any), [String(approvalRequest.currentStage)]: 'denied' },
      },
    });

    if (approvalRequest.workflow.denyColumnId && approvalRequest.workflow.denyValue && row) {
      rowData[approvalRequest.workflow.denyColumnId] = approvalRequest.workflow.denyValue;
    }

    if (approvalRequest.workflow.approvalColumnId) {
      rowData[approvalRequest.workflow.approvalColumnId] = JSON.stringify({
        status: 'denied',
        currentStage: approvalRequest.currentStage,
        stageStatuses: { ...(approvalRequest.stageStatuses as any), [String(approvalRequest.currentStage)]: 'denied' },
        totalStages: stages.length,
        stages: stages.map(function(s: any) { return { order: s.order, name: s.name }; }),
      });
    }

    await db.agoraRow.update({
      where: { id: approvalRequest.rowId },
      data: { data: rowData, isLocked: false, lockedById: null },
    });

    wsBroadcast(approvalRequest.tableId, { type: 'row-lock', rowId: approvalRequest.rowId, isLocked: false });

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

    var table0 = await db.agoraTable.findUnique({ where: { id: approvalRequest.tableId }, select: { name: true } });
    await createNotification({
      userId: approvalRequest.requestedById,
      type: 'approval_completed',
      title: `Request denied: ${table0?.name || 'Record'}`,
      message: `${actorName || actorEmail} denied your request${reason ? ': ' + reason : ''}.`,
      tableId: approvalRequest.tableId,
      rowId: approvalRequest.rowId,
      sendEmailNotification: true,
    });

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
    if (currentStage.requireAll) {
      var allActions = await db.approvalAction.findMany({
        where: { requestId: approvalRequest.id },
      });
      var approvedUserIds = allActions.filter(function(a) { return a.action === 'approved'; }).map(function(a) { return a.userId; });
      approvedUserIds.push(userId);
      var allApproved = uniqueApproverIds.every(function(id) { return approvedUserIds.includes(id); });

      if (!allApproved) {
        await db.approvalRequest.update({
          where: { id: approvalRequest.id },
          data: { status: 'in_progress' },
        });
        return NextResponse.json({ success: true, status: 'in_progress', message: 'Awaiting remaining approvers' });
      }
    }

    var stageStatuses = { ...(approvalRequest.stageStatuses as any), [String(approvalRequest.currentStage)]: 'approved' };
    var nextStageNum = approvalRequest.currentStage + 1;
    var nextStage = stages.find(function(s: any) { return s.order === nextStageNum; });

    if (nextStage) {
      var skipNext = false;
      if (nextStage.condition && nextStage.condition.columnId) {
        var condVal = rowData[nextStage.condition.columnId];
        var condTarget = nextStage.condition.value;
        var op = nextStage.condition.operator;
        var numVal = parseFloat(condVal);
        var numTarget = parseFloat(condTarget);

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

      var targetStage = skipNext
        ? stages.find(function(s: any) { return s.order > nextStageNum; })
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

        if (approvalRequest.workflow.approvalColumnId) {
          rowData[approvalRequest.workflow.approvalColumnId] = JSON.stringify({
            status: 'in_progress',
            currentStage: targetStage.order,
            stageStatuses,
            totalStages: stages.length,
            stages: stages.map(function(s: any) { return { order: s.order, name: s.name }; }),
          });
          await db.agoraRow.update({ where: { id: approvalRequest.rowId }, data: { data: rowData } });
        }

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

        var table1 = await db.agoraTable.findUnique({ where: { id: approvalRequest.tableId }, select: { name: true } });
        var nextApproverIds = [...(targetStage.approverUserIds || [])];
        for (var appId of nextApproverIds) {
          await createNotification({
            userId: appId,
            type: 'approval_requested',
            title: `Approval needed: ${table1?.name || 'Record'} — ${targetStage.name}`,
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

    if (approvalRequest.workflow.approveColumnId && approvalRequest.workflow.approveValue) {
      rowData[approvalRequest.workflow.approveColumnId] = approvalRequest.workflow.approveValue;
    }

    if (approvalRequest.workflow.approvalColumnId) {
      rowData[approvalRequest.workflow.approvalColumnId] = JSON.stringify({
        status: 'approved',
        currentStage: approvalRequest.currentStage,
        stageStatuses,
        totalStages: stages.length,
        stages: stages.map(function(s: any) { return { order: s.order, name: s.name }; }),
      });
    }

    var shouldLock = approvalRequest.workflow.lockOnApprove;
    await db.agoraRow.update({
      where: { id: approvalRequest.rowId },
      data: { data: rowData, isLocked: shouldLock },
    });

    wsBroadcast(approvalRequest.tableId, { type: 'row-lock', rowId: approvalRequest.rowId, isLocked: shouldLock });

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

    var table2 = await db.agoraTable.findUnique({ where: { id: approvalRequest.tableId }, select: { name: true } });
    await createNotification({
      userId: approvalRequest.requestedById,
      type: 'approval_completed',
      title: `Request approved: ${table2?.name || 'Record'}`,
      message: `Your request has been fully approved!`,
      tableId: approvalRequest.tableId,
      rowId: approvalRequest.rowId,
      sendEmailNotification: true,
    });

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
