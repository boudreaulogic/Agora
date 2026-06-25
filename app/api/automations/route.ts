import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import crypto from 'crypto';

async function isSystemAdmin(userId: string): Promise<boolean> {
  var userRoles = await db.userRole.findMany({
    where: { userId: userId },
    include: { role: true },
  });
  return userRoles.some(function(ur) {
    return ur.role.slug === 'admin' || ur.role.slug === 'super_admin';
  });
}

async function getUserWorkspaceIds(userId: string): Promise<string[]> {
  var memberships = await db.workspaceMember.findMany({
    where: { userId: userId },
    select: { workspaceId: true },
  });
  return memberships.map(function(m) { return m.workspaceId; });
}

async function getUserTableIds(userId: string): Promise<string[]> {
  // Tables the user created
  var ownTables = await db.agoraTable.findMany({
    where: { createdById: userId },
    select: { id: true },
  });
  // Tables shared with the user
  var sharedTables = await db.tableShare.findMany({
    where: { userId: userId },
    select: { tableId: true },
  });
  // Tables in user's workspaces
  var wsIds = await getUserWorkspaceIds(userId);
  var wsTables = wsIds.length > 0 ? await db.agoraTable.findMany({
    where: { workspaceId: { in: wsIds } },
    select: { id: true },
  }) : [];

  var allIds = new Set<string>();
  ownTables.forEach(function(t) { allIds.add(t.id); });
  sharedTables.forEach(function(t) { allIds.add(t.tableId); });
  wsTables.forEach(function(t) { allIds.add(t.id); });
  return Array.from(allIds);
}

export async function GET(req: NextRequest) {
  try {
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    var userId = (session.user as any).id;
    var admin = await isSystemAdmin(userId);
    var whereClause: any = {};

    if (!admin) {
      var workspaceIds = await getUserWorkspaceIds(userId);
      var tableIds = await getUserTableIds(userId);
      whereClause = {
        OR: [
          { createdById: userId },
          { workspaceId: { in: workspaceIds } },
          { tableId: { in: tableIds } },
        ],
      };
    }

    var automations = await db.automation.findMany({
      where: whereClause,
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { runs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Batch fetch creator, workspace, and table info
    var creatorIds = [...new Set(automations.map(function(a) { return a.createdById; }).filter(Boolean))];
    var wsIds = [...new Set(automations.map(function(a) { return a.workspaceId; }).filter(Boolean))] as string[];
    var tblIds = [...new Set(automations.map(function(a) { return (a as any).tableId; }).filter(Boolean))] as string[];

    var creators = creatorIds.length > 0 ? await db.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true, email: true },
    }) : [];

    var workspaces = wsIds.length > 0 ? await db.workspace.findMany({
      where: { id: { in: wsIds } },
      select: { id: true, name: true, icon: true },
    }) : [];

    var tables = tblIds.length > 0 ? await db.agoraTable.findMany({
      where: { id: { in: tblIds } },
      select: { id: true, name: true, icon: true },
    }) : [];

    var creatorMap: Record<string, { name: string | null; email: string }> = {};
    creators.forEach(function(c) { creatorMap[c.id] = { name: c.name, email: c.email }; });

    var wsMap: Record<string, { name: string; icon: string | null }> = {};
    workspaces.forEach(function(w) { wsMap[w.id] = { name: w.name, icon: w.icon }; });

    var tblMap: Record<string, { name: string; icon: string | null }> = {};
    tables.forEach(function(t) { tblMap[t.id] = { name: t.name, icon: t.icon }; });

    var enriched = automations.map(function(auto) {
      var creator = creatorMap[auto.createdById] || null;
      var workspace = auto.workspaceId ? wsMap[auto.workspaceId] || null : null;
      var autoTableId = (auto as any).tableId;
      var table = autoTableId ? tblMap[autoTableId] || null : null;
      return Object.assign({}, auto, {
        creatorName: creator ? (creator.name || creator.email) : 'Unknown',
        creatorEmail: creator ? creator.email : '',
        workspaceName: workspace ? workspace.name : null,
        workspaceIcon: workspace ? workspace.icon : null,
        sharedTableName: table ? table.name : null,
        sharedTableIcon: table ? table.icon : null,
        isOwner: auto.createdById === userId,
      });
    });

    return NextResponse.json(enriched);
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

    var userId = (session.user as any).id;
    var body = await req.json();
    var name = body.name;
    var description = body.description;
    var triggerType = body.triggerType;
    var triggerConfig = body.triggerConfig;
    var actions = body.actions;
    var workspaceId = body.workspaceId || null;
    var tableId = body.tableId || null;

    if (!name || !triggerType) {
      return NextResponse.json({ error: 'name and triggerType are required' }, { status: 400 });
    }

    if (workspaceId) {
      var membership = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspaceId, userId: userId } },
      });
      if (!membership) {
        var admin = await isSystemAdmin(userId);
        if (!admin) {
          return NextResponse.json({ error: 'You are not a member of this workspace' }, { status: 403 });
        }
      }
    }

    var webhookSlug = triggerType === 'webhook'
      ? crypto.randomBytes(16).toString('hex')
      : null;
    // Auto-generate a signing secret for webhook automations.
    // Callers use this to sign payloads with HMAC-SHA256 so Agora can verify origin.
    var webhookSecret = triggerType === 'webhook'
      ? crypto.randomBytes(32).toString('hex')
      : null;

    var automation = await db.automation.create({
      data: {
        name: name,
        description: description || null,
        triggerType: triggerType,
        triggerConfig: triggerConfig || {},
        createdById: userId,
        workspaceId: workspaceId,
        tableId: tableId,
        webhookSlug: webhookSlug,
        webhookSecret: webhookSecret,
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
        actions: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return NextResponse.json(automation, { status: 201 });
  } catch (error: any) {
    console.error('[Automations POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}