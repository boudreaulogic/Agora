import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/authenticateRequest';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params;

    var authResult = await authenticateRequest(req, id, 'read');
    if (authResult instanceof NextResponse) return authResult;

    // For session users, check table permission
    if (authResult.source === 'session') {
      var { getTablePermission } = await import('@/lib/tablePermissions');
      var permission = await getTablePermission(authResult.userId, id);
      if (!permission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    var rows = await db.agoraRow.findMany({
      where: { tableId: id },
      orderBy: { position: 'asc' },
    });
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching rows:', error);
    return NextResponse.json({ error: 'Failed to fetch rows' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params;

    var authResult = await authenticateRequest(req, id, 'write');
    if (authResult instanceof NextResponse) return authResult;

    // For session users, check table permission
    if (authResult.source === 'session') {
      var { getTablePermission } = await import('@/lib/tablePermissions');
      var permission = await getTablePermission(authResult.userId, id);
      if (!permission || permission === 'viewer') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    var body = await req.json();
    var data = body.data || body;

    var maxRow = await db.agoraRow.findFirst({
      where: { tableId: id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    var position = (maxRow?.position ?? -1) + 1;

    var row = await db.agoraRow.create({
      data: {
        tableId: id,
        data: data,
        position: position,
        createdById: authResult.userId,
      },
    });

    var { logActivity } = await import('@/lib/activityLog');
    await logActivity({
      tableId: id,
      rowId: row.id,
      userId: authResult.userId,
      action: 'ROW_CREATED',
      details: { data: data, source: authResult.source },
    });

    var { wsBroadcast } = await import('@/lib/wsBroadcast');
    await wsBroadcast(id, {
      type: 'row-inserted',
      row: Object.assign({}, row, { data: row.data || {} }),
    });

    var { notifyTableSubscribers } = await import('@/lib/notifications');
    var table = await db.agoraTable.findUnique({ where: { id: id }, select: { name: true, isSheetBacked: true } });
    notifyTableSubscribers({
      tableId: id,
      type: 'row_created',
      title: 'New record in ' + (table?.name || 'table'),
      message: (authResult.userName || authResult.userEmail || 'API') + ' added a new record.',
      rowId: row.id,
      excludeUserId: authResult.userId,
    }).catch(function() {});

    // Check for approval workflow trigger on newly created row with default values
    try {
      var workflow = await db.approvalWorkflow.findUnique({ where: { tableId: id } });
      if (workflow && workflow.isActive && workflow.triggerColumnId) {
        var triggerValue = data[workflow.triggerColumnId];
        if (triggerValue !== undefined && String(triggerValue) === String(workflow.triggerValue)) {
          var existingApproval = await db.approvalRequest.findFirst({
            where: { workflowId: workflow.id, rowId: row.id, status: { in: ['pending', 'in_progress'] } },
          });
          if (!existingApproval) {
            var stages = (workflow.stages as any[]) || [];
            var firstStage = stages.find(function(s: any) { return s.order === 1; }) || stages[0];
            var initialStatuses: Record<string, string> = {};
            stages.forEach(function(s: any) { initialStatuses[String(s.order)] = s.order === 1 ? 'pending' : 'waiting'; });

            await db.agoraRow.update({ where: { id: row.id }, data: { isLocked: true, lockedById: authResult.userId } });
            await wsBroadcast(id, { type: 'row-lock', rowId: row.id, isLocked: true });

            var approvalReq = await db.approvalRequest.create({
              data: {
                workflowId: workflow.id,
                rowId: row.id,
                tableId: id,
                requestedById: authResult.userId,
                currentStage: 1,
                stageStatuses: initialStatuses,
                status: 'pending',
                dueAt: workflow.reminderEnabled ? new Date(Date.now() + (workflow as any).reminderHours * 3600000) : null,
              },
            });

            if (workflow.approvalColumnId) {
              var rowData = data;
              rowData[workflow.approvalColumnId] = JSON.stringify({
                status: 'pending',
                currentStage: 1,
                stageStatuses: initialStatuses,
                totalStages: stages.length,
                stages: stages.map(function(s: any) { return { order: s.order, name: s.name }; }),
              });
              await db.agoraRow.update({ where: { id: row.id }, data: { data: rowData } });
              await wsBroadcast(id, { type: 'cell-update', rowId: row.id, columnId: workflow.approvalColumnId, value: rowData[workflow.approvalColumnId] });
            }

            var addLedgerEntry = (await import('@/lib/approvalLedger')).addLedgerEntry;
            await addLedgerEntry({
              tableId: id,
              rowId: row.id,
              workflowId: workflow.id,
              requestId: approvalReq.id,
              action: 'submitted',
              stage: 1,
              stageName: firstStage?.name || 'Stage 1',
              actorId: authResult.userId,
              actorName: authResult.userName || '',
              actorEmail: authResult.userEmail || '',
              rowSnapshot: data,
              workflowName: workflow.name,
              requiredApprovers: firstStage?.approverUserIds || [],
            });

            if (firstStage) {
              var resolveApproverIds = async function(stage: any): Promise<string[]> {
                var ids = (stage.approverUserIds || []).slice();
                var gids = stage.approverGroupIds || [];
                if (gids.length > 0) {
                  var members = await db.groupMember.findMany({ where: { groupId: { in: gids } }, select: { userId: true } });
                  ids.push.apply(ids, members.map(function(m: any) { return m.userId; }));
                }
                if (stage.dynamicApproverColumnId) {
                  var val = data[stage.dynamicApproverColumnId];
                  if (val) {
                    var user = await db.user.findFirst({
                      where: { OR: [{ id: String(val) }, { email: String(val) }, { name: String(val) }] },
                      select: { id: true },
                    });
                    if (user) ids.push(user.id);
                  }
                }
                return Array.from(new Set(ids));
              };

              var createNotification = (await import('@/lib/notifications')).createNotification;
              var approverIds = await resolveApproverIds(firstStage);
              for (var a = 0; a < approverIds.length; a++) {
                await createNotification({
                  userId: approverIds[a],
                  type: 'approval_requested',
                  title: 'Approval needed: ' + (table?.name || 'Record') + ' — ' + firstStage.name,
                  message: (authResult.userName || authResult.userEmail || 'API') + ' submitted a record for your approval.',
                  tableId: id,
                  rowId: row.id,
                  metadata: { requestId: approvalReq.id, workflowId: workflow.id, token: approvalReq.token, stage: firstStage.name },
                  sendEmailNotification: true,
                });
              }
            }
          }
        }
      }
    } catch (approvalErr) {
      console.error('Approval trigger on row create error:', approvalErr);
    }

    var finalRow = await db.agoraRow.findUnique({ where: { id: row.id } });

    // Fire automation triggers (fire-and-forget)
    try {
      console.log('[Automations] Firing row_created hook for table:', id, 'row:', row.id);
      var { onRowCreated } = await import('@/lib/automations/hooks');
      onRowCreated(id, row.id, (finalRow || row).data as any, authResult.userId);
    } catch (autoErr) {
      console.error('Automation trigger error (row_created):', autoErr);
    }

    return NextResponse.json(finalRow || row);
  } catch (error) {
    console.error('Error creating row:', error);
    return NextResponse.json({ error: 'Failed to create row' }, { status: 500 });
  }
}