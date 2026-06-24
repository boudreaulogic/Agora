import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

export const dynamic = 'force-dynamic';

// POST — pull items from SharePoint list into Agora table
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  var { id } = await params;
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  var perm = await getTablePermission(session.user.id, id);
  if (!perm || perm === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  var table = await db.agoraTable.findUnique({
    where: { id: id },
    include: { columns: { orderBy: { position: 'asc' } } },
  });

  if (!table || !table.isSharePointBacked) {
    return NextResponse.json({ error: 'Not a SharePoint-backed table' }, { status: 400 });
  }

  var spConfig = table.sharePointConfig as any;
  if (!spConfig?.siteId || !spConfig?.listId) {
    return NextResponse.json({ error: 'SharePoint config incomplete' }, { status: 400 });
  }

  try {
    var { getListItems } = await import('@/lib/sharepoint');
    var items = await getListItems(spConfig.siteId, spConfig.listId, 5000);

    // Build reverse mapping: spColumnName → agoraColumnId
    var spToAgora: Record<string, { id: string; type: string }> = {};
    for (var i = 0; i < table.columns.length; i++) {
      var col = table.columns[i];
      var colSpConfig = col.sharePointConfig as any;
      if (colSpConfig?.spColumnName && colSpConfig.spColumnType !== 'system') {
        spToAgora[colSpConfig.spColumnName] = { id: col.id, type: col.type };
      }
    }

    // Find existing SP items already in Agora (by spItemId)
    var existingRows = await db.agoraRow.findMany({
      where: { tableId: id, spItemId: { not: null } },
      select: { id: true, spItemId: true },
    });
    var existingSpIds = new Set(existingRows.map(function(r) { return r.spItemId; }));

    var imported = 0;
    var updated = 0;
    var errors = 0;
    var maxPosition = await db.agoraRow.findFirst({
      where: { tableId: id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    var nextPosition = (maxPosition?.position ?? -1) + 1;

    for (var j = 0; j < items.length; j++) {
      try {
        var item = items[j];
        var fields = item.fields || {};
        var rowData: Record<string, any> = {};

        // Map SP fields to Agora column IDs
        var spFieldNames = Object.keys(spToAgora);
        for (var k = 0; k < spFieldNames.length; k++) {
          var spName = spFieldNames[k];
          var agoraCol = spToAgora[spName];
          var spValue = fields[spName];
          if (spValue !== undefined && spValue !== null) {
            rowData[agoraCol.id] = mapSpValueToAgora(spValue, agoraCol.type);
          }
        }

        var spItemId = String(item.id);

if (existingSpIds.has(spItemId)) {
            var existingRow = existingRows.find(function(r) { return r.spItemId === spItemId; });
            if (existingRow) {
              await db.agoraRow.update({
                where: { id: existingRow.id },
                data: { data: rowData },
              });
              updated++;
            }
          } else {
            var orphan = await db.agoraRow.findFirst({ where: { tableId: id, spItemId: null } });
            if (orphan) {
              await db.agoraRow.update({ where: { id: orphan.id }, data: { data: rowData, spItemId: spItemId } });
              updated++;
            } else {
              await db.agoraRow.create({ data: { tableId: id, data: rowData, position: nextPosition, spItemId: spItemId, createdById: (session.user as any).id } });
              nextPosition++;
              imported++;
            }
          }
        } catch (rowErr: any) {
          console.error('[SP Pull] Row error:', rowErr.message);
          errors++;
        }
      }

    // Update last pull timestamp
    await db.agoraTable.update({
      where: { id: id },
      data: {
        sharePointConfig: Object.assign({}, spConfig, {
          lastPullAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      imported: imported,
      updated: updated,
      errors: errors,
      total: items.length,
    });
  } catch (err: any) {
    console.error('[SP Pull Error]', err);
    return NextResponse.json({ error: err.message || 'Pull failed' }, { status: 500 });
  }
}

function mapSpValueToAgora(value: any, agoraType: string): any {
  if (value === null || value === undefined) return '';

  switch (agoraType) {
    case 'datetime':
      // SP returns ISO strings — keep as-is but format for Agora datetime input
      try {
        var d = new Date(value);
        // Format as YYYY-MM-DDTHH:mm for datetime-local input
        return d.toISOString().slice(0, 16);
      } catch { return String(value); }
    case 'date':
      try {
        return new Date(value).toISOString().split('T')[0];
      } catch { return String(value); }
    case 'number':
    case 'currency':
    case 'percent':
      return typeof value === 'number' ? value : parseFloat(String(value)) || '';
    case 'checkbox':
      return value === true ? 'true' : 'false';
    case 'multi_select':
      if (Array.isArray(value)) return value.join(',');
      return String(value);
    default:
      return String(value);
  }
}