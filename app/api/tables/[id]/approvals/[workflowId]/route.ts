import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request, { params }: { params: { id: string; workflowId: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { getTablePermission } = await import('@/lib/tablePermissions');
  const permission = await getTablePermission(session.user.id, params.id);
  if (!permission || permission === 'viewer' || permission === 'editor') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const workflow = await db.approvalWorkflow.findUnique({ where: { id: params.workflowId } });
  if (!workflow || workflow.tableId !== params.id) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  const updated = await db.approvalWorkflow.update({
    where: { id: params.workflowId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.triggerColumnId !== undefined && { triggerColumnId: body.triggerColumnId }),
      ...(body.triggerValue !== undefined && { triggerValue: body.triggerValue }),
      ...(body.approveColumnId !== undefined && { approveColumnId: body.approveColumnId }),
      ...(body.approveValue !== undefined && { approveValue: body.approveValue }),
      ...(body.denyColumnId !== undefined && { denyColumnId: body.denyColumnId }),
      ...(body.denyValue !== undefined && { denyValue: body.denyValue }),
      ...(body.lockOnApprove !== undefined && { lockOnApprove: body.lockOnApprove }),
      ...(body.stages !== undefined && { stages: body.stages }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.reminderEnabled !== undefined && { reminderEnabled: body.reminderEnabled }),
      ...(body.reminderHours !== undefined && { reminderHours: body.reminderHours }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: { id: string; workflowId: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { getTablePermission } = await import('@/lib/tablePermissions');
  const permission = await getTablePermission(session.user.id, params.id);
  if (!permission || permission === 'viewer' || permission === 'editor') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const workflow = await db.approvalWorkflow.findUnique({ where: { id: params.workflowId } });
  if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete the auto-created approval column
  if (workflow.approvalColumnId) {
    try {
      await db.agoraColumn.delete({ where: { id: workflow.approvalColumnId } });
    } catch {}
  }

  await db.approvalWorkflow.delete({ where: { id: params.workflowId } });
  return NextResponse.json({ success: true });
}