import crypto from 'crypto';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimiter';
import { NextRequest } from 'next/server';

// GET — public form data (no auth)
export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const form = await db.agoraForm.findUnique({
    where: { slug: params.slug },
    include: {
      table: {
        include: {
          columns: { orderBy: { position: 'asc' } },
        },
      },
    },
  });

  if (!form || !form.isActive) {
    return NextResponse.json({ error: 'Form not found or inactive' }, { status: 404 });
  }

  const fields = (form.fields as any[]).filter((f: any) => f.visible !== false);
  const columns = form.table.columns;

  const publicFields = fields.map((field: any) => {
    const col = columns.find(c => c.id === field.columnId);
    if (!col && field.type !== 'section_header' && field.type !== 'divider' && field.type !== 'repeating_group' && field.type !== 'calculated') return null;
    return {
      columnId: field.columnId,
      label: field.label || col?.name,
      type: field.type || col?.type,
      columnType: col?.type || field.columnType,
      required: field.required || false,
      placeholder: field.placeholder || '',
      description: field.description || '',
      order: field.order,
      settings: col?.settings || field.settings,
      pageId: field.pageId || 'page_1',
      conditions: field.conditions || [],
      validation: field.validation || {},
      visible: field.visible,
      readOnly: field.readOnly || false,
      calculated: field.calculated || false,
      formula: field.formula || null,
      // Mapped repeating group fields — now includes fieldTypes for type-aware rendering
      rows: (field.rows || []).map(function(row: any) {
        return {
          rowNum: row.rowNum,
          fields: row.fields,
          labels: row.labels,
          fieldTypes: (row.fields || []).map(function(fid: string) {
            var col2 = columns.find(function(c: any) { return c.id === fid; });
            return col2 ? { type: col2.type, settings: col2.settings || {} } : { type: 'text', settings: {} };
          }),
        };
      }),
      columnsPerRow: field.columnsPerRow || undefined,
      defaultVisibleRows: field.defaultVisibleRows || undefined,
      columnFormulas: field.columnFormulas || undefined,
      // Custom repeating group fields
      rgType: field.rgType || undefined,
      customColumns: field.customColumns || undefined,
      maxRows: field.maxRows || undefined,
      // Validation fields
      rgRequireMode: field.rgRequireMode || undefined,
      rgRequiredColumns: field.rgRequiredColumns || undefined,
    };
  }).filter(Boolean).sort((a: any, b: any) => a.order - b.order);

  return NextResponse.json({
    form: {
      id: form.id,
      name: form.name,
      description: form.description,
      submitButtonText: form.submitButtonText,
      thankYouMessage: form.thankYouMessage,
      fields: publicFields,
      pages: form.pages || [{ id: 'page_1', title: 'Page 1', description: '' }],
    },
  });
}

// POST — submit form (no auth, rate limited)
export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  // Rate limit public form submissions — 20 per minute per IP
  var rl = checkRateLimit(request as unknown as NextRequest, 'publicForm');
  if (!rl.allowed) return rateLimitResponse(rl);

  const form = await db.agoraForm.findUnique({
    where: { slug: params.slug },
    include: {
      table: {
        include: {
          columns: { orderBy: { position: 'asc' } },
        },
      },
    },
  });

  if (!form || !form.isActive) {
    return NextResponse.json({ error: 'Form not found or inactive' }, { status: 404 });
  }

  const body = await request.json();
  const fields = form.fields as any[];
  const columns = form.table.columns;

  for (const field of fields) {
    if (!field.required || field.visible === false) continue;
    const value = body[field.columnId];
    if (value === undefined || value === null || value === '') {
      const col = columns.find(c => c.id === field.columnId);
      return NextResponse.json(
        { error: (field.label || col?.name || 'Field') + ' is required' },
        { status: 400 }
      );
    }
  }

  const data: Record<string, any> = {};
  for (const field of fields) {
    if (field.visible === false) continue;
    if (field.type === 'repeating_group') {
      if (field.rgType === 'custom') {
        const customData = body[field.columnId];
        if (customData && Array.isArray(customData)) {
          data[field.columnId] = customData;
        }
      } else {
        for (const row of (field.rows || [])) {
          for (const fid of (row.fields || [])) {
            if (body[fid] !== undefined && body[fid] !== '') {
              data[fid] = body[fid];
            }
          }
        }
      }
      continue;
    }
    if (body[field.columnId] !== undefined) {
      data[field.columnId] = body[field.columnId];
    }
  }

  const maxRow = await db.agoraRow.findFirst({
    where: { tableId: form.tableId },
    orderBy: { position: 'desc' },
  });
  const newPosition = (maxRow?.position ?? -1) + 1;

  // Apply column defaults for fields not included in form submission
  const tableColumns = await db.agoraColumn.findMany({
    where: { tableId: form.tableId },
    select: { id: true, type: true, settings: true },
  });
  for (var di = 0; di < tableColumns.length; di++) {
    var col = tableColumns[di];
    var colSettings = col.settings as any;
    if (colSettings?.defaultValue && (data[col.id] === undefined || data[col.id] === null || data[col.id] === '')) {
      var defVal = colSettings.defaultValue;
      if (defVal === '__today') {
        defVal = col.type === 'datetime' ? new Date().toISOString().slice(0, 16) : new Date().toISOString().split('T')[0];
      }
      data[col.id] = defVal;
    }
  }

  const row = await db.agoraRow.create({
    data: {
      tableId: form.tableId,
      data,
      position: newPosition,
    },
  });

  // Broadcast new row via WebSocket for live updates (with auth)
  try {
    var { wsBroadcast } = await import('@/lib/wsBroadcast');
    wsBroadcast(form.tableId, {
      type: 'form-submission',
      row: {
        id: row.id,
        tableId: row.tableId,
        data: row.data,
        position: row.position,
        createdById: null,
        isLocked: false,
        lockedById: null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
  } catch {}

  // Notify subscribers about form submission
  try {
    const { notifyTableSubscribers } = await import('@/lib/notifications');
    notifyTableSubscribers({
      tableId: form.tableId,
      type: 'form_submitted',
      title: `New form submission: ${form.name}`,
      message: `Someone submitted the "${form.name}" form.`,
      rowId: row.id,
    }).catch(() => {});
  } catch {}

  // Fire automation triggers (fire-and-forget)
  try {
    var { onFormSubmit } = await import('@/lib/automations/hooks');
    onFormSubmit(form.tableId, form.id, row.id, data);
  } catch (autoErr) {
    console.error('Automation trigger error (form_submit):', autoErr);
  }
  
  // Check for approval workflow trigger on form submission
  try {
    var workflow = await db.approvalWorkflow.findUnique({ where: { tableId: form.tableId } });
    if (workflow && workflow.isActive && workflow.triggerColumnId) {
      var triggerVal = data[workflow.triggerColumnId];
      if (triggerVal !== undefined && String(triggerVal) === String(workflow.triggerValue)) {
        var existingApproval = await db.approvalRequest.findFirst({
          where: { workflowId: workflow.id, rowId: row.id, status: { in: ['pending', 'in_progress'] } },
        });
        if (!existingApproval) {
          var wfStages = (workflow.stages as any[]) || [];
          var wfFirstStage = wfStages.find(function(s: any) { return s.order === 1; }) || wfStages[0];
          var wfInitialStatuses: Record<string, string> = {};
          wfStages.forEach(function(s: any) { wfInitialStatuses[String(s.order)] = s.order === 1 ? 'pending' : 'waiting'; });

          await db.agoraRow.update({ where: { id: row.id }, data: { isLocked: true } });

          var approvalReq = await db.approvalRequest.create({
            data: {
              token: crypto.randomBytes(32).toString('hex'),
              workflowId: workflow.id,
              rowId: row.id,
              tableId: form.tableId,
              requestedById: form.createdById,
              currentStage: 1,
              stageStatuses: wfInitialStatuses,
              status: 'pending',
              dueAt: workflow.reminderEnabled ? new Date(Date.now() + (workflow.reminderHours || 24) * 3600000) : null,
            },
          });

          if (workflow.approvalColumnId) {
            data[workflow.approvalColumnId] = JSON.stringify({
              status: 'pending',
              currentStage: 1,
              stageStatuses: wfInitialStatuses,
              totalStages: wfStages.length,
              stages: wfStages.map(function(s: any) { return { order: s.order, name: s.name }; }),
            });
            await db.agoraRow.update({ where: { id: row.id }, data: { data: data } });
          }

          try {
            var { addLedgerEntry } = await import('@/lib/approvalLedger');
            await addLedgerEntry({
              tableId: form.tableId, rowId: row.id, workflowId: workflow.id, requestId: approvalReq.id,
              action: 'submitted', stage: 1, stageName: wfFirstStage?.name || 'Stage 1',
              actorId: 'form_submission', actorName: 'Form: ' + form.name, actorEmail: '',
              rowSnapshot: data, workflowName: workflow.name,
              requiredApprovers: wfFirstStage?.approverUserIds || [],
            });
          } catch {}

          if (wfFirstStage) {
            var approverIds: string[] = (wfFirstStage.approverUserIds || []).slice();
            var groupIds = wfFirstStage.approverGroupIds || [];
            if (groupIds.length > 0) {
              var members = await db.groupMember.findMany({ where: { groupId: { in: groupIds } }, select: { userId: true } });
              approverIds.push.apply(approverIds, members.map(function(m: any) { return m.userId; }));
            }
            var uniqueApprovers = Array.from(new Set(approverIds));
            var { createNotification } = await import('@/lib/notifications');
            var tableName = form.table?.name || 'Record';
            for (var ai = 0; ai < uniqueApprovers.length; ai++) {
              await createNotification({
                userId: uniqueApprovers[ai],
                type: 'approval_requested',
                title: 'Approval needed: ' + tableName + ' — ' + wfFirstStage.name,
                message: 'A form submission on "' + form.name + '" requires your approval.',
                tableId: form.tableId, rowId: row.id,
                metadata: { requestId: approvalReq.id, workflowId: workflow.id, token: approvalReq.token, stage: wfFirstStage.name },
                sendEmailNotification: true,
              });
            }
          }
        }
      }
    }
  } catch (approvalErr) {
    console.error('Approval trigger on form submit error:', approvalErr);
  }

  return NextResponse.json({
    success: true,
    message: form.thankYouMessage || 'Thank you for your submission!',
    rowId: row.id,
  });
}