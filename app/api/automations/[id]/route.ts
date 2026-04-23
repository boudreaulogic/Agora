import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

async function isSystemAdmin(userId: string): Promise<boolean> {
  var userRoles = await db.userRole.findMany({
    where: { userId: userId },
    include: { role: true },
  });
  return userRoles.some(function(ur) {
    return ur.role.slug === 'admin' || ur.role.slug === 'super_admin';
  });
}

async function canUserAccessTable(userId: string, tableId: string): Promise<boolean> {
  // Created the table
  var table = await db.agoraTable.findUnique({ where: { id: tableId }, select: { createdById: true, workspaceId: true } });
  if (!table) return false;
  if (table.createdById === userId) return true;
  // Shared with user
  var share = await db.tableShare.findUnique({ where: { tableId_userId: { tableId: tableId, userId: userId } } });
  if (share) return true;
  // Table is in a workspace user belongs to
  if (table.workspaceId) {
    var wsMember = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: table.workspaceId, userId: userId } } });
    if (wsMember) return true;
  }
  return false;
}

async function canAccessAutomation(userId: string, automation: any): Promise<'owner' | 'workspace_member' | 'table_member' | 'admin' | null> {
  if (automation.createdById === userId) return 'owner';
  var admin = await isSystemAdmin(userId);
  if (admin) return 'admin';
  if (automation.workspaceId) {
    var membership = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: automation.workspaceId, userId: userId } },
    });
    if (membership) return 'workspace_member';
  }
  if (automation.tableId) {
    var hasTableAccess = await canUserAccessTable(userId, automation.tableId);
    if (hasTableAccess) return 'table_member';
  }
  return null;
}

async function canEditAutomation(userId: string, automation: any): Promise<boolean> {
  if (automation.createdById === userId) return true;
  var admin = await isSystemAdmin(userId);
  if (admin) return true;
  if (automation.workspaceId) {
    var membership = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: automation.workspaceId, userId: userId } },
    });
    if (membership && (membership.permission === 'admin' || membership.permission === 'owner')) return true;
  }
  // Table members can view but not edit (only creator/admin can edit)
  return false;
}

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