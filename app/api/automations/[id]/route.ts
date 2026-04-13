import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
 
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
 
    var automation = await db.automation.findUnique({
      where: { id: id },
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 20,
        },
      },
    });
 
    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
 
    var body = await req.json();
 
    // Update the automation itself
    var updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.triggerType !== undefined) updateData.triggerType = body.triggerType;
    if (body.triggerConfig !== undefined) updateData.triggerConfig = body.triggerConfig;
 
    await db.automation.update({
      where: { id: id },
      data: updateData,
    });
 
    // If actions array provided, replace all actions
    if (body.actions !== undefined) {
      await db.automationAction.deleteMany({
        where: { automationId: id },
      });
 
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
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
      },
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
 
    await db.automation.delete({
      where: { id: id },
    });
 
    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error('[Automation DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}