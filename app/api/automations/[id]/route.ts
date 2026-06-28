import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessAutomation, canEditAutomation } from '@/lib/automations/access';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params;
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    var userId = (session.user as any).id;
    var automation = await db.automation.findUnique({
      where: { id: id },
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
        runs: { orderBy: { startedAt: 'desc' }, take: 20 },
      },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    var access = await canAccessAutomation(userId, automation);
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(automation);
  } catch (error: any) {
    console.error('[Automation GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params;
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    var userId = (session.user as any).id;
    var automation = await db.automation.findUnique({ where: { id: id } });
    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    var canEdit = await canEditAutomation(userId, automation);
    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden — only the creator or workspace admin can edit this automation' }, { status: 403 });
    }

    var body = await req.json();
    var updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.triggerType !== undefined) updateData.triggerType = body.triggerType;
    if (body.triggerConfig !== undefined) updateData.triggerConfig = body.triggerConfig;
    if (body.workspaceId !== undefined) updateData.workspaceId = body.workspaceId || null;
    if (body.tableId !== undefined) updateData.tableId = body.tableId || null;
    if (body.maxRetries !== undefined) updateData.maxRetries = Math.max(0, Math.min(10, parseInt(body.maxRetries, 10) || 0));
    if (body.retryDelaySec !== undefined) updateData.retryDelaySec = Math.max(0, Math.min(300, parseInt(body.retryDelaySec, 10) || 0));

    await db.automation.update({ where: { id: id }, data: updateData });

    if (body.actions !== undefined) {
      await db.automationAction.deleteMany({ where: { automationId: id } });
      for (var i = 0; i < body.actions.length; i++) {
        var action = body.actions[i];
        await db.automationAction.create({
          data: {
            automationId: id,
            actionType: action.actionType,
            actionConfig: action.actionConfig || {},
            conditionExpr: action.conditionExpr || null,
            sortOrder: i,
          },
        });
      }
    }

    var updated = await db.automation.findUnique({
      where: { id: id },
      include: { actions: { orderBy: { sortOrder: 'asc' } } },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[Automation PUT]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params;
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    var userId = (session.user as any).id;
    var automation = await db.automation.findUnique({ where: { id: id } });
    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    var canEdit = await canEditAutomation(userId, automation);
    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden — only the creator or workspace admin can delete this automation' }, { status: 403 });
    }

    await db.automation.delete({ where: { id: id } });
    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error('[Automation DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}