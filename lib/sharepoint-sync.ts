// Auto-sync hook — call this from row create, row update, form submit, approval complete
 
import { db } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
 
export async function syncToSharePoint(tableId: string, rowData: Record<string, any>, rowId?: string): Promise<void> {
  try {
    // Load sync config
    var setting = await db.systemSetting.findUnique({ where: { key: 'sp_sync_' + tableId } });
    if (!setting) return; // No sync configured
 
    var config: any;
    try {
      config = JSON.parse(setting.encrypted ? decrypt(setting.value) : setting.value);
    } catch { return; }
 
    if (!config.enabled || !config.siteId || !config.listId || !config.fieldMapping) return;
 
    // Get columns for type info
    var columns = await db.agoraColumn.findMany({
      where: { tableId: tableId },
      select: { id: true, name: true, type: true },
    });
 
    var { syncRowToSharePoint } = await import('@/lib/sharepoint');
    var result = await syncRowToSharePoint(
      {
        siteId: config.siteId,
        listId: config.listId,
        fieldMapping: config.fieldMapping,
        uniqueKeyColumnId: config.uniqueKeyColumnId,
        uniqueKeySpColumn: config.uniqueKeySpColumn,
      },
      rowData,
      columns as any[],
      config.uniqueKeyColumnId ? 'upsert' : 'create'
    );
 
    if (!result.success) {
      console.error('[SharePoint Auto-Sync] Table ' + tableId + ': ' + result.error);
    } else {
      console.log('[SharePoint Auto-Sync] Table ' + tableId + ': Synced item ' + result.itemId);
      // Save SP item ID back to the Agora row so we can track sync status
      if (rowId && result.itemId) {
        try {
          await db.agoraRow.update({ where: { id: rowId }, data: { spItemId: String(result.itemId) } });
        } catch (updateErr) {
          console.error('[SharePoint Auto-Sync] Failed to save spItemId:', updateErr);
        }
      }
    }
 
    // Update last sync status
    config.lastSyncAt = new Date().toISOString();
    config.lastSyncStatus = result.success ? 'success' : 'error';
    config.lastSyncError = result.success ? null : result.error;
    await db.systemSetting.update({
      where: { key: 'sp_sync_' + tableId },
      data: { value: JSON.stringify(config) },
    });
  } catch (err: any) {
    console.error('[SharePoint Auto-Sync Error]', err.message || err);
  }
}
 