import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const approvalRequest = await db.approvalRequest.findUnique({
    where: { token: params.token },
    include: { workflow: true, actions: { orderBy: { createdAt: 'asc' } } },
  });
  if (!approvalRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = await db.agoraRow.findUnique({ where: { id: approvalRequest.rowId } });
  const table = await db.agoraTable.findUnique({ where: { id: approvalRequest.tableId }, select: { id: true, name: true, icon: true } });
  const columns = await db.agoraColumn.findMany({ where: { tableId: approvalRequest.tableId }, orderBy: { position: 'asc' } });
  const requester = await db.user.findUnique({ where: { id: approvalRequest.requestedById }, select: { id: true, name: true, email: true } });

  const actionsWithUsers = await Promise.all(
    approvalRequest.actions.map(async (action) => {
      const user = await db.user.findUnique({ where: { id: action.userId }, select: { id: true, name: true, email: true } });
      return { ...action, user };
    })
  );

  // Resolve approvers from stages
  const stages = (approvalRequest.workflow.stages as any[]) || [];
  const currentStage = stages.find((s: any) => s.order === approvalRequest.currentStage);
  
  let isApprover = false;
  if (currentStage) {
    const approverIds = [...(currentStage.approverUserIds || [])];
    const groupIds = currentStage.approverGroupIds || [];
    if (groupIds.length > 0) {
      const members = await db.groupMember.findMany({ where: { groupId: { in: groupIds } }, select: { userId: true } });
      approverIds.push(...members.map(m => m.userId));
    }
    if (currentStage.dynamicApproverColumnId && row) {
      const val = (row.data as any)[currentStage.dynamicApproverColumnId];
      if (val) {
        const user = await db.user.findFirst({ where: { OR: [{ id: String(val) }, { email: String(val) }, { name: String(val) }] }, select: { id: true } });
        if (user) approverIds.push(user.id);
      }
    }
    isApprover = [...new Set(approverIds)].includes(session.user.id);
  }

  const myAction = approvalRequest.actions.find(a => a.userId === session.user.id);

  return NextResponse.json({
    request: { ...approvalRequest, actions: actionsWithUsers },
    workflow: approvalRequest.workflow,
    row: row ? { id: row.id, data: row.data, createdAt: row.createdAt } : null,
    table,
    columns: columns.filter(c => c.type !== 'approval_status').map(c => ({ id: c.id, name: c.name, type: c.type, settings: c.settings })),
    requester,
    isApprover,
    hasActed: !!myAction,
    myAction: myAction || null,
  });
}