import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { extractSpreadsheetId, readSheetTab, inferColumnType } from '@/lib/googleSheets';

// POST — import selected tabs from a Google Sheet as Agora tables
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { url, sheetName, tabs, existingConnectionId } = body;

  if (!url || !tabs?.length) {
    return NextResponse.json({ error: 'URL and at least one tab required' }, { status: 400 });
  }

  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) {
    return NextResponse.json({ error: 'Invalid Google Sheets URL' }, { status: 400 });
  }

  try {
    // Use existing connection or create new one
    var connection: any;
    if (existingConnectionId) {
      connection = await db.googleSheetConnection.findUnique({ where: { id: existingConnectionId } });
      if (!connection) {
        return NextResponse.json({ error: 'Existing connection not found' }, { status: 404 });
      }
    } else {
      connection = await db.googleSheetConnection.create({
        data: {
          spreadsheetId,
          spreadsheetName: sheetName || 'Google Sheet',
          spreadsheetUrl: url,
          createdById: session.user.id,
        },
      });
    }

    const importedTables = [];

    for (const tab of tabs) {
      // Read tab data
      const { headers, rows } = await readSheetTab(spreadsheetId, tab.title);

      if (headers.length === 0) {
        // Skip empty tabs
        continue;
      }

      // Generate unique slug
      const baseSlug = tab.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') || 'sheet';
      let slug = baseSlug;
      let counter = 1;
      while (await db.agoraTable.findUnique({ where: { slug } })) {
        slug = `${baseSlug}_${counter++}`;
      }

      // Create the Agora table
      const table = await db.agoraTable.create({
        data: {
          name: tab.title,
          slug,
          description: `Imported from "${sheetName}" Google Sheet`,
          icon: '🟩',
          createdById: session.user.id,
          isSheetBacked: true,
        },
      });

      // Auto-detect column types from first 10 rows of data
      const sampleRows = rows.slice(0, 10);
      const columnMapping: Record<string, { columnId: string; sheetIndex: number }> = {};
      const columns = [];

      for (let i = 0; i < headers.length; i++) {
        const headerName = headers[i] || `Column ${i + 1}`;
        if (!headerName.trim()) continue;

        // Get sample values for this column
        const sampleValues = sampleRows.map(row => String(row[i] || '')).filter(v => v.trim());
        const inferredType = inferColumnType(sampleValues);

        // Build settings for select columns
        let settings: any = {};
        if (inferredType === 'select') {
          const uniqueValues = [...new Set(sampleRows.map(row => String(row[i] || '').trim()).filter(Boolean))];
          const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
          settings.options = uniqueValues.map((val, idx) => ({
            value: val.toLowerCase().replace(/\s+/g, '_'),
            label: val,
            color: colors[idx % colors.length],
          }));
        }

        const column = await db.agoraColumn.create({
          data: {
            tableId: table.id,
            name: headerName.trim(),
            type: inferredType,
            position: i,
            settings,
          },
        });

        columns.push(column);
        columnMapping[headerName.trim()] = { columnId: column.id, sheetIndex: i };
      }

      // Import rows
      let position = 0;
      for (const row of rows) {
        const data: Record<string, any> = {};

        for (let i = 0; i < headers.length; i++) {
          const headerName = headers[i]?.trim();
          if (!headerName || !columnMapping[headerName]) continue;

          const { columnId } = columnMapping[headerName];
          const rawValue = row[i];

          if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '') {
            const col = columns.find(c => c.id === columnId);
            // Convert checkbox values
            if (col?.type === 'checkbox') {
              const lower = String(rawValue).toLowerCase();
              data[columnId] = ['true', 'yes', '1'].includes(lower) ? 'true' : 'false';
            }
            // Convert select values to their value format
            else if (col?.type === 'select') {
              const opt = (col.settings as any)?.options?.find((o: any) => o.label === String(rawValue).trim());
              data[columnId] = opt ? opt.value : String(rawValue).trim();
            }
            // Currency — strip $ and commas
            else if (col?.type === 'currency' || col?.type === 'number' || col?.type === 'percent') {
              data[columnId] = String(rawValue).replace(/[$,%]/g, '').trim();
            }
            else {
              data[columnId] = String(rawValue);
            }
          }
        }

        // Skip completely empty rows
        if (Object.keys(data).length === 0) continue;

        await db.agoraRow.create({
          data: {
            tableId: table.id,
            data,
            position: position++,
            createdById: session.user.id,
          },
        });
      }

      // Create the tab mapping
      await db.sheetTabMapping.create({
        data: {
          connectionId: connection.id,
          sheetTabId: tab.sheetId,
          sheetTabName: tab.title,
          tableId: table.id,
          columnMapping,
          lastSyncAt: new Date(),
        },
      });
	  
	  // Add system Attachments column
      await db.agoraColumn.create({
        data: {
          tableId: table.id,
          name: 'Attachments',
          type: 'attachment',
          position: columns.length,
          settings: { isSystem: true },
        },
      });

      // Create a default view
      await db.agoraView.create({
        data: {
          tableId: table.id,
          name: 'All Data',
          type: 'grid',
          isDefault: true,
          config: {},
          createdById: session.user.id,
        },
      });

      importedTables.push({
        id: table.id,
        name: table.name,
        icon: table.icon,
        columnCount: columns.length,
        rowCount: position,
      });
    }

    // If nothing was imported, return error and clean up connection if we just created it
    if (importedTables.length === 0) {
      if (!existingConnectionId) {
        await db.googleSheetConnection.delete({ where: { id: connection.id } });
      }
      return NextResponse.json({ error: 'No tabs could be imported. Make sure your sheets have headers in the first row with data below them.' }, { status: 400 });
    }

    // Update connection sync status
    await db.googleSheetConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date(), syncStatus: 'idle' },
    });

    return NextResponse.json({
      success: true,
      connectionId: connection.id,
      tables: importedTables,
    });
  } catch (error: any) {
    console.error('Google Sheets import error:', error);
    return NextResponse.json({ error: 'Import failed: ' + (error.message || 'Unknown error') }, { status: 500 });
  }
}