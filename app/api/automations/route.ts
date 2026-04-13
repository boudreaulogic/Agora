import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import crypto from 'crypto';
 
export async function GET(req: NextRequest) {
  try {
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
 
    var automations = await db.automation.findMany({
      include: {
        actions: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { runs: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
 
    return NextResponse.json(automations);
  } catch (error: any) {
    console.error('[Automations GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
 
export async function POST(req: NextRequest) {
  try {
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
 
    var body = await req.json();
    var name = body.name;
    var description = body.description;
    var triggerType = body.triggerType;
    var triggerConfig = body.triggerConfig;
    var actions = body.actions;
 
    if (!name || !triggerType) {
      return NextResponse.json(
        { error: 'name and triggerType are required' },
        { status: 400 }
      );
    }
 
    var webhookSlug = triggerType === 'webhook'
      ? crypto.randomBytes(16).toString('hex')
      : null;
 
    var automation = await db.automation.create({
      data: {
        name: name,
        description: description || null,
        triggerType: triggerType,
        triggerConfig: triggerConfig || {},
        createdById: (session.user as any).id,
        webhookSlug: webhookSlug,
        actions: {
          create: (actions || []).map(function(action: any, index: number) {
            return {
              actionType: action.actionType,
              actionConfig: action.actionConfig || {},
              conditionExpr: action.conditionExpr || null,
              sortOrder: index,
            };
          }),
        },
      },
      include: {
        actions: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
 
    return NextResponse.json(automation, { status: 201 });
  } catch (error: any) {
    console.error('[Automations POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}