import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET — get the workflow for this table (one per table)
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workflow = await db.approvalWorkflow.findUnique({
    where: { tableId: params.id },
    include: {
      requests: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { actions: true },
      },
    },
  });

  return NextResponse.json(workflow || null);
}

// POST — create workflow (one per table) + auto-create approval column
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { getTablePermission } = await import('@/lib/tablePermissions');
  const permission = await getTablePermission(session.user.id, params.id);
  if (!permission || permission === 'viewer' || permission === 'editor') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Check if workflow already exists
  const existing = await db.approvalWorkflow.findUnique({ where: { tableId: params.id } });
  if (existing) {
    return NextResponse.json({ error: 'This table already has an approval workflow. Edit the existing one instead.' }, { status: 409 });
  }

  const body = await request.json();

  // Auto-create the immutable approval column
  const maxCol = await db.agoraColumn.findFirst({
    where: { tableId: params.id },
    orderBy: { position: 'desc' },
  });
  const newPosition = (maxCol?.position ?? -1) + 1;

  const approvalColumn = await db.agoraColumn.create({
    data: {
      tableId: params.id,
      name: '✅ Approval',
      type: 'approval_status',
      position: newPosition,
      settings: { isApprovalColumn: true, workflowManaged: true },
    },
  });

  // Build stages from body — default to single stage if not provided
  let stages = body.stages;
  if (!stages || stages.length === 0) {
    stages = [{
      order: 1,
      name: body.name || 'Approval',
      approverUserIds: body.approverUserIds || [],
      approverGroupIds: body.approverGroupIds || [],
      dynamicApproverColumnId: body.dynamicApproverColumnId || null,
      requireAll: body.requireAllApprovers || false,
      condition: null,
    }];
  }

  const workflow = await db.approvalWorkflow.create({
    data: {
      tableId: params.id,
      name: body.name || 'Approval Workflow',
      description: body.description || null,
      triggerColumnId: body.triggerColumnId || null,
      triggerValue: body.triggerValue || null,
      approveColumnId: body.approveColumnId || body.triggerColumnId || null,
      approveValue: body.approveValue || null,
      denyColumnId: body.denyColumnId || body.triggerColumnId || null,
      denyValue: body.denyValue || null,
      lockOnApprove: body.lockOnApprove ?? true,
      approvalColumnId: approvalColumn.id,
      stages,
      isActive: true,
      reminderEnabled: body.reminderEnabled || false,
      reminderHours: body.reminderHours || 24,
    },
  });

  return NextResponse.json(workflow);
}