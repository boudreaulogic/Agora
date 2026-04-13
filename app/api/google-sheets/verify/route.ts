import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { extractSpreadsheetId, getSheetMetadata } from '@/lib/googleSheets';

// POST — verify the service account can access a sheet and return its metadata
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { url } = await request.json();
  if (!url?.trim()) {
    return NextResponse.json({ error: 'Sheet URL is required' }, { status: 400 });
  }

  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) {
    return NextResponse.json({ error: 'Invalid Google Sheets URL. Make sure you paste the full URL from your browser.' }, { status: 400 });
  }

  try {
    const metadata = await getSheetMetadata(spreadsheetId);
    return NextResponse.json({
      spreadsheetId,
      title: metadata.title,
      tabs: metadata.tabs,
    });
  } catch (error: any) {
    const message = error?.message || '';
    if (message.includes('not found') || message.includes('404')) {
      return NextResponse.json({ error: 'Sheet not found. Check the URL is correct.' }, { status: 404 });
    }
    if (message.includes('forbidden') || message.includes('403') || message.includes('permission')) {
      return NextResponse.json({
        error: 'Access denied. Make sure you shared the sheet with the service account email as an Editor.',
      }, { status: 403 });
    }
    if (message.includes('not configured')) {
      return NextResponse.json({ error: 'Google Sheets integration is not configured. Ask your admin.' }, { status: 500 });
    }
    console.error('Google Sheets verify error:', error);
    return NextResponse.json({ error: 'Failed to access sheet: ' + message }, { status: 500 });
  }
}