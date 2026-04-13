import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export const dynamic = 'force-dynamic';

// POST /api/tables/[id]/charts/query
// Accepts a query config and returns aggregated data for charting
// Supports single-table and multi-table (via linked records) queries
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  var perm = await getTablePermission(session.user.id, params.id);
  if (!perm) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  var body = await request.json();
  var sourceTableId = params.id;

  // Query config shape:
  // {
  //   groupBy: { tableId, columnId },           // which column to group by
  //   measures: [{ tableId, columnId, aggregation }],  // what to aggregate
  //   joins: [{ fromColumnId, toTableId }],      // linked record joins to traverse
  //   filters: [{ tableId, columnId, operator, value }],  // optional filters
  //   limit: number,                             // max groups to return
  //   sortBy: 'value' | 'label',                 // sort result
  //   sortDir: 'asc' | 'desc',
  // }

  var groupBy = body.groupBy;
  var measures = body.measures || [];
  var joins = body.joins || [];
  var filters = body.filters || [];
  var limit = body.limit || 50;
  var sortBy = body.sortBy || 'value';
  var sortDir = body.sortDir || 'desc';

  if (!groupBy || !groupBy.columnId) {
    return NextResponse.json({ error: 'groupBy.columnId is required' }, { status: 400 });
  }

  try {
    // Fetch source table rows
    var sourceRows = await db.agoraRow.findMany({
      where: { tableId: sourceTableId },
      select: { id: true, data: true },
    });

    // Fetch source table columns for type info
    var sourceColumns = await db.agoraColumn.findMany({
      where: { tableId: sourceTableId },
      select: { id: true, name: true, type: true, settings: true, linkedTableId: true },
    });

    var sourceColMap: Record<string, any> = {};
    sourceColumns.forEach(function(c) { sourceColMap[c.id] = c; });

    // Resolve joins — fetch linked record mappings and target table data
    var joinData: Record<string, {
      links: any[];
      targetRows: Record<string, any>;
      targetColumns: Record<string, any>;
    }> = {};

    for (var i = 0; i < joins.length; i++) {
      var join = joins[i];
      var fromCol = sourceColMap[join.fromColumnId];
      if (!fromCol || fromCol.type !== 'linked_record') continue;

      // Check permission on target table
      var targetPerm = await getTablePermission(session.user.id, join.toTableId);
      if (!targetPerm) continue;

      // Fetch all linked records for this column
      var links = await db.linkedRecord.findMany({
        where: {
          columnId: join.fromColumnId,
          fromTableId: sourceTableId,
          toTableId: join.toTableId,
        },
        select: { fromRowId: true, toRowId: true },
      });

      // Fetch target table rows
      var targetRowIds = links.map(function(l) { return l.toRowId; });
      var targetRows = await db.agoraRow.findMany({
        where: { id: { in: targetRowIds } },
        select: { id: true, data: true },
      });

      var targetRowMap: Record<string, any> = {};
      targetRows.forEach(function(r) { targetRowMap[r.id] = r; });

      // Fetch target table columns
      var targetCols = await db.agoraColumn.findMany({
        where: { tableId: join.toTableId },
        select: { id: true, name: true, type: true, settings: true },
      });

      var targetColMap: Record<string, any> = {};
      targetCols.forEach(function(c) { targetColMap[c.id] = c; });

      joinData[join.fromColumnId] = {
        links: links,
        targetRows: targetRowMap,
        targetColumns: targetColMap,
      };
    }

    // Helper: resolve a value from a row, potentially following a join
    function resolveValue(row: any, tableId: string, columnId: string): any[] {
      if (tableId === sourceTableId) {
        // Direct column on source table
        var val = (row.data as any)[columnId];
        return val !== undefined && val !== null && val !== '' ? [val] : [];
      }

      // Need to follow a join to get to this table
      // Find which join column connects to this target table
      for (var colId in joinData) {
        var jd = joinData[colId];
        if (!jd.targetColumns[columnId]) continue;

        // Find linked rows for this source row
        var linkedToIds = jd.links
          .filter(function(l) { return l.fromRowId === row.id; })
          .map(function(l) { return l.toRowId; });

        var values: any[] = [];
        linkedToIds.forEach(function(toId) {
          var targetRow = jd.targetRows[toId];
          if (targetRow) {
            var v = (targetRow.data as any)[columnId];
            if (v !== undefined && v !== null && v !== '') {
              values.push(v);
            }
          }
        });
        return values;
      }

      return [];
    }

    // Apply filters
    var filteredRows = sourceRows.filter(function(row) {
      for (var f = 0; f < filters.length; f++) {
        var filter = filters[f];
        var vals = resolveValue(row, filter.tableId, filter.columnId);
        if (vals.length === 0) {
          if (filter.operator === 'is_empty') continue;
          return false;
        }

        var matches = vals.some(function(val) {
          var strVal = String(val).toLowerCase();
          var filterVal = String(filter.value || '').toLowerCase();

          switch (filter.operator) {
            case 'equals': return strVal === filterVal;
            case 'not_equals': return strVal !== filterVal;
            case 'contains': return strVal.includes(filterVal);
            case 'not_contains': return !strVal.includes(filterVal);
            case 'greater_than': return parseFloat(val) > parseFloat(filter.value);
            case 'less_than': return parseFloat(val) < parseFloat(filter.value);
            case 'is_empty': return false;
            case 'not_empty': return true;
            default: return true;
          }
        });

        if (!matches) return false;
      }
      return true;
    });

    // Group by
    var groups: Record<string, { label: string; values: Record<string, number[]> }> = {};

    filteredRows.forEach(function(row) {
      var groupValues = resolveValue(row, groupBy.tableId || sourceTableId, groupBy.columnId);
      if (groupValues.length === 0) groupValues = ['(empty)'];

      // Handle multi-select / comma-separated
      var categories: string[] = [];
      groupValues.forEach(function(gv) {
        var s = String(gv);
        if (s.includes(',')) {
          s.split(',').forEach(function(part) { categories.push(part.trim()); });
        } else {
          categories.push(s);
        }
      });

      categories.forEach(function(category) {
        if (!groups[category]) {
          groups[category] = { label: category, values: {} };
          measures.forEach(function(m: any, idx: number) {
            groups[category].values['m' + idx] = [];
          });
          if (measures.length === 0) {
            groups[category].values['count'] = [];
          }
        }

        if (measures.length === 0) {
          groups[category].values['count'].push(1);
        } else {
          measures.forEach(function(m: any, idx: number) {
            var mVals = resolveValue(row, m.tableId || sourceTableId, m.columnId);
            mVals.forEach(function(v) {
              var num = parseFloat(v);
              if (!isNaN(num)) {
                groups[category].values['m' + idx].push(num);
              }
            });
          });
        }
      });
    });

    // Aggregate
    function aggregate(values: number[], agg: string): number {
      if (values.length === 0) return 0;
      switch (agg) {
        case 'count': return values.length;
        case 'sum': return values.reduce(function(a, b) { return a + b; }, 0);
        case 'avg': return values.reduce(function(a, b) { return a + b; }, 0) / values.length;
        case 'min': return Math.min.apply(null, values);
        case 'max': return Math.max.apply(null, values);
        default: return values.reduce(function(a, b) { return a + b; }, 0);
      }
    }

    var result = Object.entries(groups).map(function(entry) {
      var key = entry[0];
      var group = entry[1];
      var aggregated: Record<string, number> = {};

      if (measures.length === 0) {
        aggregated['count'] = group.values['count'].length;
      } else {
        measures.forEach(function(m: any, idx: number) {
          var agg = m.aggregation || 'sum';
          aggregated['m' + idx] = Math.round(aggregate(group.values['m' + idx], agg) * 100) / 100;
        });
      }

      return {
        label: group.label,
        values: aggregated,
      };
    });

    // Sort
    if (sortBy === 'label') {
      result.sort(function(a, b) {
        return sortDir === 'asc'
          ? a.label.localeCompare(b.label)
          : b.label.localeCompare(a.label);
      });
    } else {
      // Sort by first measure value
      var sortKey = measures.length > 0 ? 'm0' : 'count';
      result.sort(function(a, b) {
        return sortDir === 'asc'
          ? (a.values[sortKey] || 0) - (b.values[sortKey] || 0)
          : (b.values[sortKey] || 0) - (a.values[sortKey] || 0);
      });
    }

    // Limit
    if (limit && result.length > limit) {
      result = result.slice(0, limit);
    }

    // Get column metadata for measures
    var measureMeta = measures.map(function(m: any, idx: number) {
      var col = sourceColMap[m.columnId];
      if (!col) {
        // Check join targets
        for (var colId in joinData) {
          var tc = joinData[colId].targetColumns[m.columnId];
          if (tc) { col = tc; break; }
        }
      }
      return {
        key: 'm' + idx,
        name: col?.name || 'Measure ' + (idx + 1),
        type: col?.type || 'number',
        aggregation: m.aggregation || 'sum',
      };
    });

    if (measures.length === 0) {
      measureMeta = [{ key: 'count', name: 'Count', type: 'number', aggregation: 'count' }];
    }

    // Get groupBy column metadata
    var groupByCol = sourceColMap[groupBy.columnId];
    if (!groupByCol) {
      for (var colId in joinData) {
        var tc = joinData[colId].targetColumns[groupBy.columnId];
        if (tc) { groupByCol = tc; break; }
      }
    }

    // Get available tables and columns for the query builder UI
    var availableTables = [
      {
        id: sourceTableId,
        name: (await db.agoraTable.findUnique({ where: { id: sourceTableId }, select: { name: true } }))?.name || 'Source',
        columns: sourceColumns.map(function(c) {
          return { id: c.id, name: c.name, type: c.type };
        }),
        isSource: true,
      },
    ];

    // Add joinable tables
    for (var j = 0; j < sourceColumns.length; j++) {
      var sc = sourceColumns[j];
      if (sc.type === 'linked_record' && sc.linkedTableId) {
        var linkedTable = await db.agoraTable.findUnique({
          where: { id: sc.linkedTableId },
          select: { id: true, name: true },
        });
        if (linkedTable) {
          var linkedCols = await db.agoraColumn.findMany({
            where: { tableId: linkedTable.id },
            select: { id: true, name: true, type: true },
            orderBy: { position: 'asc' },
          });
          availableTables.push({
            id: linkedTable.id,
            name: linkedTable.name,
            columns: linkedCols.map(function(c) {
              return { id: c.id, name: c.name, type: c.type };
            }),
            isSource: false,
          });
        }
      }
    }

    return NextResponse.json({
      data: result,
      meta: {
        totalRows: sourceRows.length,
        filteredRows: filteredRows.length,
        groupCount: result.length,
        groupBy: {
          columnId: groupBy.columnId,
          columnName: groupByCol?.name || 'Unknown',
          columnType: groupByCol?.type || 'text',
        },
        measures: measureMeta,
        availableTables: availableTables,
      },
    });
  } catch (error: any) {
    console.error('Chart query error:', error);
    return NextResponse.json({ error: 'Query failed: ' + (error.message || 'Unknown error') }, { status: 500 });
  }
}