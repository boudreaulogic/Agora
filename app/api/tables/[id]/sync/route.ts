import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';
import { readSheetTab, writeSheetCell, appendSheetRow, inferColumnType } from '@/lib/googleSheets';
import { wsBroadcast } from '@/lib/wsBroadcast';

// POST /api/tables/[id]/sync — full bidirectional sync with Google Sheet
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const permission = await getTablePermission(session.user.id, params.id);
  if (!permission || permission === 'viewer') {
    return NextResponse.json({ error: 'Editor access required to sync' }, { status: 403 });
  }

  // Verify this is a sheet-backed table
  const table = await db.agoraTable.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, isSheetBacked: true },
  });
  if (!table?.isSheetBacked) {
    return NextResponse.json({ error: 'This table is not connected to Google Sheets' }, { status: 400 });
  }

  const tabMapping = await db.sheetTabMapping.findUnique({ where: { tableId: params.id } });
  if (!tabMapping) {
    return NextResponse.json({ error: 'No sheet tab mapping found' }, { status: 400 });
  }

  const connection = await db.googleSheetConnection.findUnique({ where: { id: tabMapping.connectionId } });
  if (!connection || !connection.isActive) {
    return NextResponse.json({ error: 'Google Sheet connection is inactive' }, { status: 400 });
  }

  // Update sync status
  await db.googleSheetConnection.update({
    where: { id: connection.id },
    data: { syncStatus: 'syncing' },
  });

  try {
    // Read current sheet data
    const { headers: sheetHeaders, rows: sheetRows } = await readSheetTab(
      connection.spreadsheetId,
      tabMapping.sheetTabName
    );

    // Get current Agora data
    const agoraColumns = await db.agoraColumn.findMany({
      where: { tableId: params.id },
      orderBy: { position: 'asc' },
    });
    const agoraRows = await db.agoraRow.findMany({
      where: { tableId: params.id },
      orderBy: { position: 'asc' },
    });

    const columnMapping = tabMapping.columnMapping as Record<string, { columnId: string; sheetIndex: number }>;
    const stats = { rowsPulled: 0, rowsPushed: 0, cellsUpdated: 0, columnsAdded: 0 };

    // ================================================================
    // STEP 1: Sync columns — Agora columns that don't exist in sheet
    // ================================================================
    for (const col of agoraColumns) {
      // Skip computed columns
      if (['formula', 'lookup', 'rollup', 'approval_status'].includes(col.type)) continue;
      // isSystem columns filtered by type above

      const existsInMapping = Object.values(columnMapping).some(m => m.columnId === col.id);
      if (!existsInMapping) {
        // Add this column as a new header in the sheet
        const newIndex = sheetHeaders.length;
        sheetHeaders.push(col.name);

        // Write the header to the sheet
        await writeSheetCell(
          connection.spreadsheetId,
          tabMapping.sheetTabName,
          -1, // row -1 = header row (index 0 in sheet, but we need special handling)
          newIndex,
          col.name
        );

        // Update column mapping
        columnMapping[col.name] = { columnId: col.id, sheetIndex: newIndex };
        stats.columnsAdded++;
      }
    }

    // ================================================================
    // STEP 2: Sync new headers from sheet → Agora columns
    // ================================================================
    for (let i = 0; i < sheetHeaders.length; i++) {
      const header = sheetHeaders[i]?.trim();
      if (!header) continue;

      const existsInMapping = Object.entries(columnMapping).some(
        ([name, m]) => m.sheetIndex === i
      );
      if (!existsInMapping) {
        // New column in sheet — create in Agora
        const sampleValues = sheetRows.slice(0, 10).map(row => String(row[i] || ''));
        const inferredType = inferColumnType(sampleValues);

        const maxPos = await db.agoraColumn.findFirst({
          where: { tableId: params.id },
          orderBy: { position: 'desc' },
          select: { position: true },
        });

        const newCol = await db.agoraColumn.create({
          data: {
            tableId: params.id,
            name: header,
            type: inferredType,
            position: (maxPos?.position ?? -1) + 1,
            settings: {},
          },
        });

        columnMapping[header] = { columnId: newCol.id, sheetIndex: i };
        stats.columnsAdded++;
      }
    }

    // Save updated column mapping
    await db.sheetTabMapping.update({
      where: { id: tabMapping.id },
      data: { columnMapping },
    });

    // ================================================================
    // STEP 3: Sync rows — compare sheet rows vs Agora rows
    // ================================================================
    const agoraRowCount = agoraRows.length;
    const sheetRowCount = sheetRows.length;

    // Process existing rows (compare cell by cell)
    const minRows = Math.min(agoraRowCount, sheetRowCount);
    for (let rowIdx = 0; rowIdx < minRows; rowIdx++) {
      const agoraRow = agoraRows[rowIdx];
      const sheetRow = sheetRows[rowIdx];
      const agoraData = agoraRow.data as Record<string, any>;

      // Skip locked rows — Agora always wins
      if (agoraRow.isLocked) {
        // Push Agora data to sheet for locked rows
        for (const [headerName, mapping] of Object.entries(columnMapping)) {
          const agoraVal = String(agoraData[mapping.columnId] || '');
          const sheetVal = String(sheetRow[mapping.sheetIndex] || '');
          if (agoraVal !== sheetVal) {
            await writeSheetCell(
              connection.spreadsheetId,
              tabMapping.sheetTabName,
              rowIdx,
              mapping.sheetIndex,
              agoraVal
            );
            stats.cellsUpdated++;
          }
        }
        continue;
      }

      // Compare each cell
      let rowChanged = false;
      const updatedData = { ...agoraData };

      for (const [headerName, mapping] of Object.entries(columnMapping)) {
        const agoraVal = String(agoraData[mapping.columnId] || '');
        const sheetVal = String(sheetRow[mapping.sheetIndex] || '');

        if (agoraVal !== sheetVal) {
          // Sheet has a different value — pull it into Agora
          // (Sheet wins for unlocked rows where the cell differs)
          updatedData[mapping.columnId] = sheetVal || '';
          rowChanged = true;
          stats.cellsUpdated++;
        }
      }

      if (rowChanged) {
        await db.agoraRow.update({
          where: { id: agoraRow.id },
          data: { data: updatedData },
        });

        // Broadcast changes via WebSocket
        for (const [headerName, mapping] of Object.entries(columnMapping)) {
          const oldVal = String(agoraData[mapping.columnId] || '');
          const newVal = String(updatedData[mapping.columnId] || '');
          if (oldVal !== newVal) {
            wsBroadcast(params.id, {
              type: 'cell-update',
              rowId: agoraRow.id,
              columnId: mapping.columnId,
              value: newVal,
            });
          }
        }
      }
    }

    // ================================================================
    // STEP 4: New rows in sheet that don't exist in Agora
    // ================================================================
    if (sheetRowCount > agoraRowCount) {
      for (let rowIdx = agoraRowCount; rowIdx < sheetRowCount; rowIdx++) {
        const sheetRow = sheetRows[rowIdx];
        const data: Record<string, any> = {};

        for (const [headerName, mapping] of Object.entries(columnMapping)) {
          const val = sheetRow[mapping.sheetIndex];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            data[mapping.columnId] = String(val);
          }
        }

        // Skip completely empty rows
        if (Object.keys(data).length === 0) continue;

        const newRow = await db.agoraRow.create({
          data: {
            tableId: params.id,
            data,
            position: rowIdx,
            createdById: session.user.id,
          },
        });

        wsBroadcast(params.id, {
          type: 'row-inserted',
          row: { ...newRow, data },
        });

        stats.rowsPulled++;
      }
    }

    // ================================================================
    // STEP 5: Rows in Agora that don't exist in sheet (push them)
    // ================================================================
    if (agoraRowCount > sheetRowCount) {
      for (let rowIdx = sheetRowCount; rowIdx < agoraRowCount; rowIdx++) {
        const agoraRow = agoraRows[rowIdx];
        const agoraData = agoraRow.data as Record<string, any>;
        const maxIndex = Math.max(...Object.values(columnMapping).map(m => m.sheetIndex), 0);
        const rowValues: any[] = new Array(maxIndex + 1).fill('');

        for (const [headerName, mapping] of Object.entries(columnMapping)) {
          const val = agoraData[mapping.columnId];
          if (val !== undefined && val !== null) {
            rowValues[mapping.sheetIndex] = String(val);
          }
        }

        await appendSheetRow(connection.spreadsheetId, tabMapping.sheetTabName, rowValues);
        stats.rowsPushed++;
      }
    }

    // Update sync timestamp
    await db.googleSheetConnection.update({
      where: { id: connection.id },
      data: { syncStatus: 'idle', lastSyncAt: new Date(), syncError: null },
    });
    await db.sheetTabMapping.update({
      where: { id: tabMapping.id },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      stats,
      message: `Sync complete: ${stats.rowsPulled} rows pulled, ${stats.rowsPushed} rows pushed, ${stats.cellsUpdated} cells updated, ${stats.columnsAdded} columns synced`,
    });
  } catch (error: any) {
    console.error('Google Sheets sync error:', error);

    await db.googleSheetConnection.update({
      where: { id: connection.id },
      data: { syncStatus: 'error', syncError: error.message || 'Sync failed' },
    });

    return NextResponse.json({ error: 'Sync failed: ' + (error.message || 'Unknown error') }, { status: 500 });
  }
}