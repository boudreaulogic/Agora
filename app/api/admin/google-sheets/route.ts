import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/permissions';
import { encrypt, decrypt } from '@/lib/encryption';

// GET — check if Google Sheets is configured
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await isAdmin(session.user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const emailSetting = await db.systemSetting.findUnique({ where: { key: 'google_sheets_email' } });
  const keySetting = await db.systemSetting.findUnique({ where: { key: 'google_sheets_key' } });

  return NextResponse.json({
    serviceEmail: emailSetting?.value || '',
    isConfigured: !!(emailSetting?.value && keySetting?.value),
  });
}

// PUT — save Google Sheets credentials
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await isAdmin(session.user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { serviceEmail, serviceKey } = await request.json();

  if (!serviceEmail?.trim()) {
    return NextResponse.json({ error: 'Service account email is required' }, { status: 400 });
  }

  // Save email (not encrypted — users need to see it)
  await db.systemSetting.upsert({
    where: { key: 'google_sheets_email' },
    create: { key: 'google_sheets_email', value: serviceEmail.trim(), encrypted: false },
    update: { value: serviceEmail.trim() },
  });

  // Save key (encrypted)
  if (serviceKey && serviceKey !== '••••••••••••••••••••••••••••••••') {
    // Validate JSON format
    try {
      const parsed = JSON.parse(serviceKey);
      if (!parsed.private_key || !parsed.client_email) {
        return NextResponse.json({ error: 'Invalid service account key — missing private_key or client_email' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON format for service account key' }, { status: 400 });
    }

    const encryptedKey = encrypt(serviceKey.trim());
    await db.systemSetting.upsert({
      where: { key: 'google_sheets_key' },
      create: { key: 'google_sheets_key', value: encryptedKey, encrypted: true },
      update: { value: encryptedKey, encrypted: true },
    });
  }

  return NextResponse.json({ success: true });
}

// DELETE — remove Google Sheets credentials
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await isAdmin(session.user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await db.systemSetting.deleteMany({
    where: { key: { in: ['google_sheets_email', 'google_sheets_key'] } },
  });

  return NextResponse.json({ success: true });
}