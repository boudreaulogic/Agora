import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createNotification } from '@/lib/notifications';
import { sendEmail, approvalRequestEmail, APP_URL } from '@/lib/email';

// Called by cron to send reminders for stale approval requests
export async function POST(request: Request) {
  // Verify internal call with a secret
  const authHeader = request.headers.get('x-cron-secret');
  if (authHeader !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let remindersSent = 0;

  // Find all pending/in_progress requests where dueAt has passed
  const staleRequests = await db.approvalRequest.findMany({
    where: {
      status: { in: ['pending', 'in_progress'] },
      dueAt: { lte: now },
    },
    include: {
      workflow: true,
    },
  });

  for (const request of staleRequests) {
    if (!request.workflow.reminderEnabled) continue;

    const stages = (request.workflow.stages as any[]) || [];
    const currentStage = stages.find((s: any) => s.order === request.currentStage);
    if (!currentStage) continue;

    // Get approvers for current stage
    const approverIds = [...(currentStage.approverUserIds || [])];
    const groupIds = currentStage.approverGroupIds || [];
    if (groupIds.length > 0) {
      const members = await db.groupMember.findMany({ where: { groupId: { in: groupIds } }, select: { userId: true } });
      approverIds.push(...members.map(m => m.userId));
    }

    // Check who hasn't acted yet
    const actions = await db.approvalAction.findMany({
      where: { requestId: request.id },
      select: { userId: true },
    });
    const actedUserIds = new Set(actions.map(a => a.userId));
    const pendingApprovers = [...new Set(approverIds)].filter(id => !actedUserIds.has(id));

    if (pendingApprovers.length === 0) continue;

    // Get context for notification
    const table = await db.agoraTable.findUnique({ where: { id: request.tableId }, select: { name: true } });
    const row = await db.agoraRow.findUnique({ where: { id: request.rowId } });
    const columns = await db.agoraColumn.findMany({ where: { tableId: request.tableId }, orderBy: { position: 'asc' }, take: 5 });
    const requester = await db.user.findUnique({ where: { id: request.requestedById }, select: { name: true, email: true } });
    const rowData = (row?.data || {}) as Record<string, any>;
    const rowSummary = columns.map(col => `<strong>${col.name}:</strong> ${rowData[col.id] || '—'}`).join('<br>');

    for (const approverId of pendingApprovers) {
      const approver = await db.user.findUnique({ where: { id: approverId }, select: { name: true, email: true } });
      if (!approver) continue;

      // Send reminder notification
      await createNotification({
        userId: approverId,
        type: 'approval_requested',
        title: `⏰ Reminder: Approval needed — ${table?.name || 'Record'}`,
        message: `This approval from ${requester?.name || requester?.email} has been waiting for your response at stage "${currentStage.name}".`,
        tableId: request.tableId,
        rowId: request.rowId,
        metadata: { requestId: request.id, workflowId: request.workflowId, token: request.token, stage: currentStage.name, isReminder: true },
        sendEmailNotification: false,
      });

      // Send reminder email
      if (approver.email) {
        const approveUrl = `${APP_URL}/approvals/${request.token}`;
        const html = approvalRequestEmail({
          recipientName: approver.name || 'there',
          tableName: table?.name || 'Table',
          rowSummary,
          requestedBy: requester?.name || requester?.email || 'Someone',
          approveUrl,
          denyUrl: approveUrl,
          viewUrl: `${APP_URL}/tables/${request.tableId}`,
          reason: '⏰ This is a reminder — this approval request is awaiting your response.',
        });
        await sendEmail({ to: approver.email, subject: `⏰ Reminder: Approval pending — ${table?.name}`, html });
      }

      remindersSent++;
    }

    // Push dueAt forward so we don't spam every hour
    await db.approvalRequest.update({
      where: { id: request.id },
      data: { dueAt: new Date(now.getTime() + request.workflow.reminderHours * 3600000) },
    });
  }

  return NextResponse.json({ success: true, remindersSent });
}