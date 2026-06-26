import { google } from 'googleapis';
import { db } from './db';
import { decrypt } from './encryption';

/**
 * Get an authenticated Google Sheets client using the service account credentials.
 * Reads from SystemSettings (DB) first, falls back to env vars.
 */
export async function getGoogleSheetsClient() {
  let serviceKey: string | null = null;

  // Try database first
  const keySetting = await db.systemSetting.findUnique({ where: { key: 'google_sheets_key' } });
  if (keySetting?.value) {
    serviceKey = keySetting.encrypted ? decrypt(keySetting.value) : keySetting.value;
  }

  // Fallback to env var
  if (!serviceKey && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  }

  if (!serviceKey) return null;

  try {
    const credentials = JSON.parse(serviceKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    return sheets;
  } catch (error) {
    console.error('Failed to create Google Sheets client:', error);
    return null;
  }
}

/**
 * Get the service account email (for display to users).
 */
export async function getServiceAccountEmail(): Promise<string | null> {
  const emailSetting = await db.systemSetting.findUnique({ where: { key: 'google_sheets_email' } });
  if (emailSetting?.value) return emailSetting.value;
  return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null;
}

/**
 * Extract the spreadsheet ID from a Google Sheets URL.
 */
export function extractSpreadsheetId(url: string): string | null {
  // Handles: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch metadata about a Google Sheet (name, tabs).
 */
export async function getSheetMetadata(spreadsheetId: string) {
  const sheets = await getGoogleSheetsClient();
  if (!sheets) throw new Error('Google Sheets not configured');

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties',
  });

  const title = response.data.properties?.title || 'Untitled';
  const tabs = (response.data.sheets || []).map((sheet: any) => ({
    sheetId: sheet.properties?.sheetId,
    title: sheet.properties?.title || 'Sheet',
    index: sheet.properties?.index || 0,
    rowCount: sheet.properties?.gridProperties?.rowCount || 0,
    columnCount: sheet.properties?.gridProperties?.columnCount || 0,
  }));

  return { title, tabs };
}

/**
 * Read all data from a specific tab.
 * Returns { headers: string[], rows: string[][] }
 */
export async function readSheetTab(spreadsheetId: string, tabName: string) {
  const sheets = await getGoogleSheetsClient();
  if (!sheets) throw new Error('Google Sheets not configured');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'`,
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const values = response.data.values || [];
  if (values.length === 0) return { headers: [], rows: [] };

  const headers = values[0].map((h: any) => String(h || '').trim());
  const rows = values.slice(1);

  return { headers, rows };
}

/**
 * Write a single cell value back to the sheet.
 */
export async function writeSheetCell(
  spreadsheetId: string,
  tabName: string,
  rowIndex: number, // 0-based data row (not counting header)
  colIndex: number, // 0-based column
  value: any
) {
  const sheets = await getGoogleSheetsClient();
  if (!sheets) throw new Error('Google Sheets not configured');

  // Convert column index to letter (0=A, 1=B, 25=Z, 26=AA, etc.)
  const colLetter = columnIndexToLetter(colIndex);
  const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-based indexing

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!${colLetter}${sheetRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[value === null || value === undefined ? '' : value]],
    },
  });
}

/**
 * Append a new row to the end of a sheet tab.
 */
export async function appendSheetRow(
  spreadsheetId: string,
  tabName: string,
  values: any[]
) {
  const sheets = await getGoogleSheetsClient();
  if (!sheets) throw new Error('Google Sheets not configured');

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tabName}'!A:ZZ`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  });
}

/**
 * Delete a row from a sheet tab.
 */
export async function deleteSheetRow(
  spreadsheetId: string,
  sheetTabId: number,
  rowIndex: number // 0-based data row (not counting header)
) {
  const sheets = await getGoogleSheetsClient();
  if (!sheets) throw new Error('Google Sheets not configured');

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetTabId,
            dimension: 'ROWS',
            startIndex: rowIndex + 1, // +1 for header row
            endIndex: rowIndex + 2,
          },
        },
      }],
    },
  });
}

/**
 * Infer column type from a set of sample values.
 */
export function inferColumnType(values: string[]): string {
  const nonEmpty = values.filter(v => v && v.trim());
  if (nonEmpty.length === 0) return 'text';

  // Check for numbers
  const allNumbers = nonEmpty.every(v => !isNaN(Number(v.replace(/[$,]/g, ''))));
  if (allNumbers) {
    const hasCurrency = nonEmpty.some(v => v.includes('$'));
    if (hasCurrency) return 'currency';
    const hasPercent = nonEmpty.some(v => v.includes('%'));
    if (hasPercent) return 'percent';
    return 'number';
  }

  // Check for dates
  const datePattern = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{4}-\d{2}-\d{2}/;
  const allDates = nonEmpty.every(v => datePattern.test(v) || !isNaN(Date.parse(v)));
  if (allDates && nonEmpty.length >= 2) return 'date';

  // Check for emails
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const allEmails = nonEmpty.every(v => emailPattern.test(v));
  if (allEmails) return 'email';

  // Check for URLs
  const urlPattern = /^https?:\/\//;
  const allUrls = nonEmpty.every(v => urlPattern.test(v));
  if (allUrls) return 'url';

  // Check for booleans
  const allBools = nonEmpty.every(v => ['true', 'false', 'yes', 'no', '1', '0'].includes(v.toLowerCase()));
  if (allBools) return 'checkbox';

  // Check for select (few unique values relative to total)
  const unique = new Set(nonEmpty.map(v => v.toLowerCase()));
  if (unique.size <= 8 && nonEmpty.length >= 4) return 'select';

  // Check for phone numbers
  const phonePattern = /^[\d\s\-\(\)\+]+$/;
  const allPhones = nonEmpty.every(v => phonePattern.test(v) && v.replace(/\D/g, '').length >= 7);
  if (allPhones) return 'phone';

  return 'text';
}

/**
 * Convert a 0-based column index to a spreadsheet column letter.
 * 0 = A, 1 = B, 25 = Z, 26 = AA, etc.
 */
function columnIndexToLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Get an authenticated Google Drive client.
 */
export async function getGoogleDriveClient() {
  var serviceKey: string | null = null;
  var keySetting = await db.systemSetting.findUnique({ where: { key: 'google_sheets_key' } });
  if (keySetting?.value) {
    serviceKey = keySetting.encrypted ? decrypt(keySetting.value) : keySetting.value;
  }
  if (!serviceKey && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  }
  if (!serviceKey) return null;

  try {
    var credentials = JSON.parse(serviceKey);
    var auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    var drive = google.drive({ version: 'v3', auth });
    return drive;
  } catch (error) {
    console.error('Failed to create Google Drive client:', error);
    return null;
  }
}

/**
 * The configured destination for attachment uploads — a Shared Drive (or a
 * folder inside one) that the service account is a member of. A service account
 * has NO "My Drive" storage quota, so uploads must land in a Shared Drive whose
 * storage is pooled. Set in Admin → Google Sheets.
 */
export async function getConfiguredDriveFolderId(): Promise<string | null> {
  try {
    var s = await db.systemSetting.findUnique({ where: { key: 'google_drive_folder_id' } });
    return s?.value ? s.value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Upload a file to Google Drive under the configured Shared Drive folder.
 * Creates the named subfolder if needed, makes the file viewable by anyone with
 * the link (so a sheet HYPERLINK opens), and returns the file's webViewLink.
 */
export async function uploadToDrive(
  filename: string,
  fileBuffer: Buffer,
  mimeType: string,
  folderName: string,
  parentFolderId?: string
): Promise<{ success: boolean; fileId?: string; webViewLink?: string; error?: string }> {
  try {
    var drive = await getGoogleDriveClient();
    if (!drive) return { success: false, error: 'Google Drive not configured' };

    // Resolve the root: explicit parent, else the configured Shared Drive folder.
    var rootId = parentFolderId || await getConfiguredDriveFolderId();
    if (!rootId) {
      return { success: false, error: 'No Google Drive folder configured. Create a Shared Drive, add the service account as Content Manager, and set its ID in Admin → Google Sheets.' };
    }

    // Find or create the per-table subfolder under that root.
    var folderId = await findOrCreateFolder(drive, folderName, rootId);

    // Upload the file (supportsAllDrives required for Shared Drives).
    var { Readable } = await import('stream');
    var stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);

    var fileRes = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType: mimeType,
        body: stream,
      },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    });

    // Make the file viewable by anyone with the link so the HYPERLINK works.
    try {
      await drive.permissions.create({
        fileId: fileRes.data.id as string,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
      });
    } catch (permErr: any) {
      console.error('[Google Drive] Could not set link permission:', permErr.message);
    }

    console.log('[Google Drive] Uploaded: ' + filename + ' to folder: ' + folderName);
    return {
      success: true,
      fileId: fileRes.data.id || undefined,
      webViewLink: fileRes.data.webViewLink || undefined,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Drive upload failed' };
  }
}

/**
 * Find or create a folder in Google Drive.
 */
async function findOrCreateFolder(drive: any, folderName: string, parentId?: string): Promise<string> {
  // Search for existing folder
  var query = "mimeType='application/vnd.google-apps.folder' and name='" + folderName.replace(/'/g, "\\'") + "' and trashed=false";
  if (parentId) {
    query += " and '" + parentId + "' in parents";
  }

  var searchRes = await drive.files.list({
    q: query,
    fields: 'files(id,name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id;
  }

  // Create folder
  var folderMeta: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    folderMeta.parents = [parentId];
  }

  var createRes = await drive.files.create({
    requestBody: folderMeta,
    fields: 'id',
    supportsAllDrives: true,
  });

  console.log('[Google Drive] Created folder: ' + folderName);
  return createRes.data.id;
}

/**
 * Find or create a nested folder path like "Agora Attachments/TableName/RowId"
 */
export async function findOrCreateFolderPath(folderPath: string[]): Promise<string> {
  var drive = await getGoogleDriveClient();
  if (!drive) throw new Error('Google Drive not configured');

  var currentParentId: string | undefined = undefined;
  for (var i = 0; i < folderPath.length; i++) {
    currentParentId = await findOrCreateFolder(drive, folderPath[i], currentParentId);
  }
  return currentParentId!;
}