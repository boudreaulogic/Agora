import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/model — fetch all tables with columns and relationships for ERD
export async function GET() {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  var userId = session.user.id;

  // Check if admin
  var isAdmin = await db.userRole.findFirst({
    where: {
      userId: userId,
      role: { permissions: { some: { permission: { slug: 'admin.access' } } } },
    },
  });

  var tables: any[];
  if (isAdmin) {
    tables = await db.agoraTable.findMany({
      include: {
        columns: {
          select: {
            id: true,
            name: true,
            type: true,
            position: true,
            linkedTableId: true,
            linkedDisplayColumnId: true,
            lookupLinkedColumnId: true,
            lookupFieldId: true,
            rollupLinkedColumnId: true,
            rollupFieldId: true,
            rollupFunction: true,
          },
          orderBy: { position: 'asc' },
        },
        _count: { select: { rows: true } },
        workspace: { select: { id: true, name: true, icon: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  } else {
    // Get tables user has access to
    var userRoles = await db.userRole.findMany({ where: { userId: userId }, select: { roleId: true } });
    var userGroups = await db.groupMember.findMany({ where: { userId: userId }, select: { groupId: true } });
    var roleIds = userRoles.map(function(r: any) { return r.roleId; });
    var groupIds = userGroups.map(function(g: any) { return g.groupId; });

    tables = await db.agoraTable.findMany({
      where: {
        OR: [
          { createdById: userId },
          { shares: { some: { userId: userId } } },
          { shares: { some: { roleId: { in: roleIds } } } },
          { shares: { some: { groupId: { in: groupIds } } } },
          { workspace: { members: { some: { userId: userId } } } },
          { workspace: { members: { some: { roleId: { in: roleIds } } } } },
          { workspace: { members: { some: { groupId: { in: groupIds } } } } },
        ],
      },
      include: {
        columns: {
          select: {
            id: true,
            name: true,
            type: true,
            position: true,
            linkedTableId: true,
            linkedDisplayColumnId: true,
            lookupLinkedColumnId: true,
            lookupFieldId: true,
            rollupLinkedColumnId: true,
            rollupFieldId: true,
            rollupFunction: true,
          },
          orderBy: { position: 'asc' },
        },
        _count: { select: { rows: true } },
        workspace: { select: { id: true, name: true, icon: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Build relationship edges
  var edges: any[] = [];
  var tableMap: Record<string, boolean> = {};
  tables.forEach(function(t: any) { tableMap[t.id] = true; });

  tables.forEach(function(table: any) {
    table.columns.forEach(function(col: any) {
      if (col.type === 'linked_record' && col.linkedTableId && tableMap[col.linkedTableId]) {
        edges.push({
          id: 'link_' + col.id,
          type: 'linked_record',
          fromTable: table.id,
          fromColumn: col.id,
          fromColumnName: col.name,
          toTable: col.linkedTableId,
          toColumn: col.linkedDisplayColumnId || null,
          label: col.name,
        });
      }
      if (col.type === 'lookup' && col.lookupLinkedColumnId) {
        // Find which table the linked column belongs to
        var linkedCol = null as any;
        var linkedTable = null as any;
        tables.forEach(function(t: any) {
          t.columns.forEach(function(c: any) {
            if (c.id === col.lookupLinkedColumnId) {
              linkedCol = c;
              linkedTable = t;
            }
          });
        });
        if (linkedTable) {
          edges.push({
            id: 'lookup_' + col.id,
            type: 'lookup',
            fromTable: table.id,
            fromColumn: col.id,
            fromColumnName: col.name,
            toTable: linkedTable.id,
            toColumn: col.lookupFieldId || null,
            label: col.name + ' (lookup)',
          });
        }
      }
      if (col.type === 'rollup' && col.rollupLinkedColumnId) {
        var rollupLinkedCol = null as any;
        var rollupLinkedTable = null as any;
        tables.forEach(function(t: any) {
          t.columns.forEach(function(c: any) {
            if (c.id === col.rollupLinkedColumnId) {
              rollupLinkedCol = c;
              rollupLinkedTable = t;
            }
          });
        });
        if (rollupLinkedTable) {
          edges.push({
            id: 'rollup_' + col.id,
            type: 'rollup',
            fromTable: table.id,
            fromColumn: col.id,
            fromColumnName: col.name,
            toTable: rollupLinkedTable.id,
            toColumn: col.rollupFieldId || null,
            label: col.name + ' (' + (col.rollupFunction || 'rollup') + ')',
          });
        }
      }
    });
  });

  var result = {
    tables: tables.map(function(t: any) {
      return {
        id: t.id,
        name: t.name,
        icon: t.icon,
        description: t.description,
        rowCount: t._count.rows,
        workspace: t.workspace,
        columns: t.columns.map(function(c: any) {
          return {
            id: c.id,
            name: c.name,
            type: c.type,
            position: c.position,
            isRelational: c.type === 'linked_record' || c.type === 'lookup' || c.type === 'rollup',
          };
        }),
      };
    }),
    edges: edges,
  };

  return NextResponse.json(result);
}