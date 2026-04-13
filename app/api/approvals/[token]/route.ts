import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createNotification } from '@/lib/notifications';
import { APP_URL } from '@/lib/email';

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const userId = searchParams.get('userId');

  if (!action || !userId || !['approve', 'deny'].includes(action)) {
    return redirectWithMessage('Invalid approval link');
  }

  const approvalRequest = await db.approvalRequest.findUnique({
    where: { token: params.token },
    include: { workflow: true },
  });

  if (!approvalRequest) return redirectWithMessage('Approval request not found');
  if (approvalRequest.status !== 'pending' && approvalRequest.status !== 'in_progress') {
    return redirectWithMessage(`This request has already been ${approvalRequest.status}`);
  }

  // Verify approver from stages
  const stages = (approvalRequest.workflow.stages as any[]) || [];
  const currentStage = stages.find((s: any) => s.order === approvalRequest.currentStage);
  const approverUserIds = currentStage?.approverUserIds || [];

  let isApprover = approverUserIds.includes(userId);
  if (!isApprover && currentStage?.approverGroupIds?.length > 0) {
    const membership = await db.groupMember.findFirst({
      where: { userId, groupId: { in: currentStage.approverGroupIds } },
    });
    isApprover = !!membership;
  }

  if (!isApprover) return redirectWithMessage('You are not authorized to approve this request');

  const existingAction = await db.approvalAction.findFirst({
    where: { requestId: approvalRequest.id, userId },
  });
  if (existingAction) return redirectWithMessage(`You have already ${existingAction.action} this request`);

  // For email-based approval, redirect to the in-app approval page
  return Response.redirect(`${APP_URL}/approvals/${params.token}`, 302);
}

function redirectWithMessage(message: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Agora</title></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
      <div style="background:white;border-radius:16px;padding:48px;text-align:center;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:400px;">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <p style="color:#374151;font-size:16px;">${message}</p>
        <a href="${APP_URL}" style="display:inline-block;margin-top:20px;color:#3b82f6;text-decoration:none;">Go to Agora →</a>
      </div>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}