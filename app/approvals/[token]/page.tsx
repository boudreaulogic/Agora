import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { ApprovalPageClient } from './ApprovalPageClient';
import { AgoraLogo } from '@/components/AgoraLogo';

export default async function ApprovalPage({ params }: { params: { token: string } }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const request = await db.approvalRequest.findUnique({
    where: { token: params.token },
    include: {
      workflow: true,
      actions: {
        include: {},
      },
    },
  });

  if (!request) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-12 text-center max-w-md">
          <div className="mb-4"><AgoraLogo size={48} /></div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Approval Not Found</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">This approval link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  if (request.status === 'approved' || request.status === 'denied' || request.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-12 text-center max-w-md">
          <div className="mb-4"><AgoraLogo size={48} /></div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {request.status === 'approved' ? 'Already Approved' : request.status === 'denied' ? 'Already Denied' : 'Cancelled'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            This approval request has already been {request.status}. No further action is needed.
          </p>
          <a href={'/tables/' + request.tableId} className="inline-flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <span>Open in Agora</span>
          </a>
        </div>
      </div>
    );
  }

  const row = await db.agoraRow.findUnique({
    where: { id: request.rowId },
  });

  if (!row) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-12 text-center max-w-md">
          <div className="mb-4"><AgoraLogo size={48} /></div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Record Not Found</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">The record associated with this approval has been deleted.</p>
        </div>
      </div>
    );
  }

  const table = await db.agoraTable.findUnique({
    where: { id: request.tableId },
    select: { id: true, name: true, icon: true },
  });

  const columns = await db.agoraColumn.findMany({
    where: { tableId: request.tableId },
    orderBy: { position: 'asc' },
  });

  const stages = (request.workflow.stages as any[]) || [];
  const currentStage = stages.find((s: any) => s.order === request.currentStage);

  const approverIds = currentStage?.approverUserIds || [];
  const approvers = approverIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: approverIds } },
        select: { id: true, name: true, email: true },
      })
    : [];

  const existingActions = request.actions.map((a: any) => a.userId);

  const approvalData = {
    token: params.token,
    currentUserId: session.user.id,
    currentUserName: session.user.name || session.user.email || 'You',
    requestId: request.id,
    tableId: request.tableId,
    workflowName: request.workflow.name,
    tableName: table?.name || 'Unknown Table',
    tableIcon: table?.icon || '📊',
    currentStage: request.currentStage,
    totalStages: stages.length,
    stageName: currentStage?.name || 'Stage ' + request.currentStage,
    requireAll: currentStage?.requireAll || false,
    approvers: approvers.map((u: any) => ({
      id: u.id,
      name: u.name || u.email,
      hasActed: existingActions.includes(u.id),
    })),
    rowData: row.data as Record<string, any>,
    columns: columns
      .filter((c: any) => c.type !== 'approval_status' && !c.hidden)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        settings: c.settings,
      })),
    createdAt: request.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
  };

  return <ApprovalPageClient data={approvalData} />;
}