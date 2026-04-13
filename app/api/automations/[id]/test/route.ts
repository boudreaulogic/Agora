// ============================================================
// app/api/automations/[id]/test/route.ts
// POST — dry-run/test an automation
// Simulates the trigger with sample data, shows what would happen
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveTemplate, evaluateCondition } from '@/lib/automations/engine';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params;
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    var automation = await db.automation.findUnique({
      where: { id: id },
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    var triggerConfig = automation.triggerConfig as any;
    var tableId = triggerConfig.tableId;

    // Get a sample row from the table to use as test data
    var sampleRow: any = null;
    var columns: any[] = [];
    if (tableId) {
      columns = await db.agoraColumn.findMany({
        where: { tableId: tableId },
        select: { id: true, name: true, type: true },
        orderBy: { position: 'asc' },
      });

      sampleRow = await db.agoraRow.findFirst({
        where: { tableId: tableId },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Build row context with name mapping (same as real engine)
    var rawRowData = sampleRow ? (sampleRow.data as any) || {} : {};
    var rowContext: Record<string, any> = Object.assign({ id: sampleRow?.id || 'test-row-id' }, rawRowData);
    for (var ci = 0; ci < columns.length; ci++) {
      if (rawRowData[columns[ci].id] !== undefined && rowContext[columns[ci].name] === undefined) {
        rowContext[columns[ci].name] = rawRowData[columns[ci].id];
      }
    }

    var context: Record<string, any> = {
      _automation: { id: automation.id, name: automation.name, createdById: automation.createdById },
      row: rowContext,
      previous: {},
      trigger: {
        type: automation.triggerType,
        tableId: tableId || '',
        rowId: sampleRow?.id || 'test-row-id',
      },
      webhook: {},
    };

    // Simulate each action
    var simulatedSteps: any[] = [];
    for (var a = 0; a < automation.actions.length; a++) {
      var action = automation.actions[a];
      var actionType = action.actionType;
      var actionConfig = action.actionConfig as any;
      var condExpr = action.conditionExpr || '';

      // Check condition
      var conditionMet = true;
      var conditionResolved = '';
      if (condExpr) {
        conditionResolved = resolveTemplate(condExpr, context);
        conditionMet = evaluateCondition(condExpr, context);
      }

      var step: any = {
        stepNumber: a + 1,
        actionType: actionType,
        conditionExpr: condExpr || null,
        conditionResolved: conditionResolved || null,
        conditionMet: conditionMet,
        wouldExecute: conditionMet,
        resolvedValues: {},
      };

      if (conditionMet) {
        // Show what values would be resolved
        if (actionType === 'update_field' || actionType === 'create_row') {
          var mappings = actionConfig.fieldMappings || [];
          var resolvedMappings: any[] = [];
          for (var mi = 0; mi < mappings.length; mi++) {
            resolvedMappings.push({
              column: mappings[mi].column,
              rawValue: mappings[mi].value,
              resolvedValue: resolveTemplate(mappings[mi].value || '', context),
            });
          }
          step.resolvedValues = { targetTableId: actionConfig.targetTableId || tableId, fieldMappings: resolvedMappings };
          if (actionType === 'update_field') {
            step.resolvedValues.targetRowId = resolveTemplate(actionConfig.targetRowId || '{{row.id}}', context);
          }
        }

        if (actionType === 'send_email') {
          step.resolvedValues = {
            to: resolveTemplate(actionConfig.to || '', context),
            subject: resolveTemplate(actionConfig.subject || '', context),
            bodyPreview: resolveTemplate(actionConfig.body || '', context).substring(0, 200),
          };
        }

        if (actionType === 'webhook') {
          step.resolvedValues = {
            url: resolveTemplate(actionConfig.url || '', context),
            method: actionConfig.method || 'POST',
          };
        }

        if (actionType === 'lock_row') {
          step.resolvedValues = {
            targetRowId: resolveTemplate(actionConfig.targetRowId || '{{row.id}}', context),
          };
        }

        if (actionType === 'notify') {
          step.resolvedValues = {
            userIds: actionConfig.userIds || [],
            message: resolveTemplate(actionConfig.message || '', context),
          };
        }
      }

      simulatedSteps.push(step);

      // Add simulated output to context for downstream steps
      context['step_' + a] = step.resolvedValues;
    }

    return NextResponse.json({
      automationId: automation.id,
      automationName: automation.name,
      triggerType: automation.triggerType,
      sampleRowId: sampleRow?.id || null,
      sampleRowData: rowContext,
      columnCount: columns.length,
      steps: simulatedSteps,
      note: sampleRow ? 'Using most recent row as sample data' : 'No rows in table — using empty sample data',
    });
  } catch (error: any) {
    console.error('[Automation Test]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}