import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/permissions';
import { getGoogleSheetsClient } from '@/lib/googleSheets';

// POST — test the Google Sheets connection
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await isAdmin(session.user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const sheets = await getGoogleSheetsClient();
    if (!sheets) {
      return NextResponse.json({ success: false, error: 'Google Sheets credentials not configured' });
    }

    // Try to access the API — this verifies the credentials work
    // We just call a simple endpoint that requires auth
    await sheets.spreadsheets.get({
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms', // Google's public example sheet
      fields: 'properties.title',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const message = error?.message || 'Unknown error';
    if (message.includes('invalid_grant') || message.includes('Invalid JWT')) {
      return NextResponse.json({ success: false, error: 'Invalid service account key — check that the JSON key is correct' });
    }
    if (message.includes('not found') || message.includes('404')) {
      // This is actually fine — it means auth worked but the test sheet isn't accessible
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, error: message });
  }
}