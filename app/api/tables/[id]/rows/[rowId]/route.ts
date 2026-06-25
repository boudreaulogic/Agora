import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { logActivity } from '@/lib/activityLog';
import { getTablePermission } from '@/lib/tablePermissions';
import { notifyTableSubscribers, createNotification } from '@/lib/notifications';
import { sendEmail, approvalRequestEmail, APP_URL } from '@/lib/email';
import { wsBroadcast } from '@/lib/wsBroadcast';
import { authenticateRequest } from '@/lib/authenticateRequest';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
) {
  try {
    var authResult = await authenticateRequest(request, params.id, 'write');
    if (authResult instanceof NextResponse) return authResult;

    if (authResult.source === 'session') {
      var permission = await getTablePermission(authResult.userId, params.id);
      if (!permission || permission === 'viewer') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { columnId, value } = await request.json();

    // Verify the target column actually belongs to THIS table — prevents
    // writing to a column ID from another table (mass-assignment / cross-table).
    const col = await db.agoraColumn.findUnique({
      where: { id: columnId },
      select: { type: true, settings: true, tableId: true },
    });
    if (!col || col.tableId !== params.id) {
      return NextResponse.json({ error: 'Invalid column for this table' }, { status: 400 });
    }

    // Enforce column-level edit permission for session callers.
    // getColumnPermissions returns {} for owner/admin or when no restrictions
    // exist; otherwise a columnId mapped to canEdit:false must be blocked.
    if (authResult.source === 'session') {
      const { getColumnPermissions } = await import('@/lib/tablePermissions');
      const colPerms = await getColumnPermissions(authResult.userId, params.id);
      const rule = colPerms[columnId];
      if (rule && !rule.canEdit) {
        return NextResponse.json({ error: 'You do not have permission to edit this column' }, { status: 403 });
      }
    }

    // Server-side column validation
    if (value !== null && value !== undefined && value !== '') {
      const { validateColumnValue } = await import('@/lib/columnValidation');
      var validation = validateColumnValue(value, col.type, col.settings);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error || 'Invalid value' }, { status: 400 });
      }
    }

    const row = await db.agoraRow.findUnique({
      where: { id: params.rowId },
    });
    if (!row || row.tableId !== params.id) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }
    if (row.isLocked) {
      const activeApproval = await db.approvalRequest.findFirst({
        where: { rowId: params.rowId, status: { in: ['pending', 'in_progress'] } },
      });
      const message = activeApproval
        ? 'This row is locked — it is currently in an approval process. An admin can unlock it if needed.'
        : 'Row is locked';
      return NextResponse.json({ error: message }, { status: 403 });
    }
    const currentData = row.data as any;
    const oldValue = currentData[columnId];
    currentData[columnId] = value;
    const updatedRow = await db.agoraRow.update({
      where: { id: params.rowId },
      data: { data: currentData },
    });

    if (oldValue !== value) {
      const column = await db.agoraColumn.findUnique({
        where: { id: columnId },
        select: { name: true, type: true },
      });
      await logActivity({
        tableId: params.id,
        rowId: params.rowId,
        columnId,
        userId: authResult.userId,
        action: 'CELL_UPDATED',
        details: {
          columnName: column?.name || 'Unknown',
          columnType: column?.type || 'text',
          oldValue: oldValue ?? null,
          newValue: value,
          source: authResult.source,
        },
      });

      const table = await db.agoraTable.findUnique({ where: { id: params.id }, select: { name: true } });
      var actorName = authResult.userName || authResult.userEmail || 'API';
      notifyTableSubscribers({
        tableId: params.id,
        type: 'row_updated',
        title: `Record updated in ${table?.name || 'table'}`,
        message: `${actorName} changed ${column?.name || 'a field'} from "${oldValue ?? '(empty)'}" to "${value ?? '(empty)'}"`,
        rowId: params.rowId,
        metadata: { columnId, columnName: column?.name, oldValue, newValue: value },
      }).catch(() => {});

      // Check for approval workflow trigger
      try {
        const workflow = await db.approvalWorkflow.findUnique({
          where: { tableId: params.id },
        });

        if (workflow && workflow.isActive && workflow.triggerColumnId && workflow.triggerValue && workflow.triggerColumnId === columnId && workflow.triggerValue === String(value)) {
          const existing = await db.approvalRequest.findFirst({
            where: { workflowId: workflow.id, rowId: params.rowId, status: { in: ['pending', 'in_progress'] } },
          });

          if (!existing) {
            const stages = (workflow.stages as any[]) || [];
            const firstStage = stages.find((s: any) => s.order === 1) || stages[0];
            const initialStatuses: Record<string, string> = {};
            stages.forEach((s: any) => { initialStatuses[String(s.order)] = s.order === 1 ? 'pending' : 'waiting'; });

            // Lock the row during approval
            await db.agoraRow.update({ where: { id: params.rowId }, data: { isLocked: true, lockedById: authResult.userId } });
            wsBroadcast(params.id, { type: 'row-lock', rowId: params.rowId, isLocked: true });

            const { randomBytes: randB } = await import('crypto');
            const approvalReq = await db.approvalRequest.create({
              data: {
                token: randB(32).toString('hex'),
                workflowId: workflow.id,
                rowId: params.rowId,
                tableId: params.id,
                requestedById: authResult.userId,
                currentStage: 1,
                stageStatuses: initialStatuses,
                status: 'pending',
                dueAt: workflow.reminderEnabled ? new Date(Date.now() + workflow.reminderHours * 3600000) : null,
              },
            });

            // Update approval column
            if (workflow.approvalColumnId) {
              currentData[workflow.approvalColumnId] = JSON.stringify({
                status: 'pending',
                currentStage: 1,
                stageStatuses: initialStatuses,
                totalStages: stages.length,
                stages: stages.map((s: any) => ({ order: s.order, name: s.name })),
              });
              await db.agoraRow.update({ where: { id: params.rowId }, data: { data: currentData } });
              wsBroadcast(params.id, { type: 'cell-update', rowId: params.rowId, columnId: workflow.approvalColumnId, value: currentData[workflow.approvalColumnId] });
            }

            // Ledger: submitted
            const { addLedgerEntry } = await import('@/lib/approvalLedger');
            await addLedgerEntry({
              tableId: params.id,
              rowId: params.rowId,
              workflowId: workflow.id,
              requestId: approvalReq.id,
              action: 'submitted',
              stage: 1,
              stageName: firstStage?.name || 'Stage 1',
              actorId: authResult.userId,
              actorName: authResult.userName || '',
              actorEmail: authResult.userEmail || '',
              rowSnapshot: currentData,
              workflowName: workflow.name,
              requiredApprovers: firstStage?.approverUserIds || [],
            });

            // Notify first stage approvers
            if (firstStage) {
              const resolveApprovers = async (stage: any): Promise<string[]> => {
                const ids = [...(stage.approverUserIds || [])];
                const gids = stage.approverGroupIds || [];
                if (gids.length > 0) {
                  const members = await db.groupMember.findMany({ where: { groupId: { in: gids } }, select: { userId: true } });
                  ids.push(...members.map((m: any) => m.userId));
                }
                if (stage.dynamicApproverColumnId) {
                  const val = currentData[stage.dynamicApproverColumnId];
                  if (val) {
                    const user = await db.user.findFirst({
                      where: { OR: [{ id: String(val) }, { email: String(val) }, { name: String(val) }] },
                      select: { id: true },
                    });
                    if (user) ids.push(user.id);
                  }
                }
                return [...new Set(ids)];
              };

              const approvers = await resolveApprovers(firstStage);
              for (const approverId of approvers) {
                await createNotification({
                  userId: approverId,
                  type: 'approval_requested',
                  title: `Approval needed: ${table?.name || 'Record'} — ${firstStage.name}`,
                  message: `${actorName} submitted a record for your approval.`,
                  tableId: params.id,
                  rowId: params.rowId,
                  metadata: { requestId: approvalReq.id, workflowId: workflow.id, token: approvalReq.token, stage: firstStage.name },
                  sendEmailNotification: true,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Approval trigger error:', err);
      }
    }
    // Google Sheets write-back
    const tableInfo = await db.agoraTable.findUnique({ where: { id: params.id }, select: { isSheetBacked: true } });
    if (tableInfo?.isSheetBacked) {
      try {
        const tabMapping = await db.sheetTabMapping.findUnique({ where: { tableId: params.id } });
        if (tabMapping) {
          const connection = await db.googleSheetConnection.findUnique({ where: { id: tabMapping.connectionId } });
          if (connection && connection.isActive) {
            const { writeSheetCell } = await import('@/lib/googleSheets');
            const columnMapping = tabMapping.columnMapping as Record<string, { columnId: string; sheetIndex: number }>;
            const mappingEntry = Object.values(columnMapping).find(m => m.columnId === columnId);
            if (mappingEntry) {
              const allRows = await db.agoraRow.findMany({
                where: { tableId: params.id },
                orderBy: { position: 'asc' },
                select: { id: true },
              });
              const rowIndex = allRows.findIndex(r => r.id === params.rowId);
              if (rowIndex >= 0) {
                await writeSheetCell(connection.spreadsheetId, tabMapping.sheetTabName, rowIndex, mappingEntry.sheetIndex, value ?? '');
              }
            }
          }
        }
      } catch (sheetErr) {
        console.error('Google Sheets write-back error (cell):', sheetErr);
      }
    }

    // Fire automation triggers (fire-and-forget)
    try {
      var { onRowUpdated } = await import('@/lib/automations/hooks');
      onRowUpdated(params.id, params.rowId, currentData, { [columnId]: oldValue }, authResult.userId);
    } catch (autoErr) {
      console.error('Automation trigger error (row_updated):', autoErr);
    }

    // Refetch to get latest lock status (may have changed during approval trigger)
    const finalRow = await db.agoraRow.findUnique({ where: { id: params.rowId } });
    return NextResponse.json(finalRow || updatedRow);
  } catch (error: any) {
    console.error('[API Error] Row update:', error);
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    if (error?.code === 'P2002') return NextResponse.json({ error: 'Duplicate record' }, { status: 409 });
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
) {
  try {
    var authResult = await authenticateRequest(request, params.id, 'write');
    if (authResult instanceof NextResponse) return authResult;

    if (authResult.source === 'session') {
      var permission = await getTablePermission(authResult.userId, params.id);
      if (!permission || permission === 'viewer') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const row = await db.agoraRow.findUnique({
      where: { id: params.rowId },
    });
    if (!row || row.tableId !== params.id) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }
    if (row.isLocked) {
      return NextResponse.json({ error: 'Row is locked' }, { status: 403 });
    }
    const rowData = row.data;
    await db.agoraRow.delete({
      where: { id: params.rowId },
    });
    await logActivity({
      tableId: params.id,
      rowId: params.rowId,
      userId: authResult.userId,
      action: 'ROW_DELETED',
      details: { deletedData: rowData, source: authResult.source },
    });

    // Google Sheets write-back: delete row from sheet
    const delTableInfo = await db.agoraTable.findUnique({ where: { id: params.id }, select: { isSheetBacked: true } });
    if (delTableInfo?.isSheetBacked) {
      try {
        const tabMapping = await db.sheetTabMapping.findUnique({ where: { tableId: params.id } });
        if (tabMapping) {
          const connection = await db.googleSheetConnection.findUnique({ where: { id: tabMapping.connectionId } });
          if (connection && connection.isActive) {
            const { deleteSheetRow } = await import('@/lib/googleSheets');
            await deleteSheetRow(connection.spreadsheetId, tabMapping.sheetTabId, row.position);
          }
        }
      } catch (sheetErr) {
        console.error('Google Sheets write-back error (delete):', sheetErr);
      }
    }

    // Fire automation triggers (fire-and-forget)
    try {
      var { onRowDeleted } = await import('@/lib/automations/hooks');
      onRowDeleted(params.id, params.rowId, rowData as any, authResult.userId);
    } catch (autoErr) {
      console.error('Automation trigger error (row_deleted):', autoErr);
    }

    var actorName = authResult.userName || authResult.userEmail || 'API';
    const table = await db.agoraTable.findUnique({ where: { id: params.id }, select: { name: true } });
    notifyTableSubscribers({
      tableId: params.id,
      type: 'row_deleted',
      title: `Record deleted in ${table?.name || 'table'}`,
      message: `${actorName} deleted a record.`,
      rowId: params.rowId,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API Error] Row delete:', error);
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message },
      { status: 500 }
    );
  }
}