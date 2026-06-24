import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { encrypt, decrypt } from '@/lib/encryption';

async function isAdmin(userId: string): Promise<boolean> {
  const userRoles = await db.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return userRoles.some(ur => ur.role.permissions.some(rp => rp.permission.slug === 'admin.access'));
}

// GET — fetch SMTP settings (password masked)
export async function GET() {
  const session = await auth();
  if (!session?.user || !(await isAdmin(session.user.id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const keys = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'];
  const settings = await db.systemSetting.findMany({ where: { key: { in: keys } } });

  const result: Record<string, string> = {};
  for (const s of settings) {
    if (s.encrypted) {
      result[s.key] = s.value ? '••••••••' : '';
    } else {
      result[s.key] = s.value;
    }
  }

  return NextResponse.json(result);
}

// PUT — update SMTP settings
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user || !(await isAdmin(session.user.id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();

  const settings: { key: string; value: string; encrypted: boolean }[] = [
    { key: 'smtp_host', value: body.smtp_host || '', encrypted: false },
    { key: 'smtp_port', value: body.smtp_port || '587', encrypted: false },
    { key: 'smtp_secure', value: body.smtp_secure || 'false', encrypted: false },
    { key: 'smtp_user', value: body.smtp_user || '', encrypted: false },
    { key: 'smtp_from', value: body.smtp_from || '', encrypted: false },
  ];

  // Only update password if it's not the masked placeholder
  if (body.smtp_pass && body.smtp_pass !== '••••••••') {
    settings.push({ key: 'smtp_pass', value: encrypt(body.smtp_pass.replace(/\s/g, '')), encrypted: true });
  }

  for (const s of settings) {
    await db.systemSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value, encrypted: s.encrypted },
      update: { value: s.value, encrypted: s.encrypted },
    });
  }

  return NextResponse.json({ success: true });
}

// POST — test SMTP connection
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !(await isAdmin(session.user.id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { testEmail } = await request.json();
  if (!testEmail) return NextResponse.json({ error: 'Provide testEmail' }, { status: 400 });

  try {
    const { getSmtpSettings } = await import('@/lib/email');
    const settings = await getSmtpSettings();
    if (!settings.user) return NextResponse.json({ error: 'SMTP not configured yet' }, { status: 400 });

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: { user: settings.user, pass: settings.pass },
    });

    await transporter.sendMail({
      from: settings.from,
      to: testEmail,
      subject: '✅ Agora SMTP Test',
      html: `<div style="font-family:sans-serif;padding:20px;"><h2>🏛️ Agora</h2><p>Your email settings are configured correctly!</p><p style="color:#666;font-size:12px;">Sent at ${new Date().toLocaleString()}</p></div>`,
    });

    return NextResponse.json({ success: true, message: `Test email sent to ${testEmail}` });
  } catch (err: any) {
    return NextResponse.json({ error: `SMTP test failed: ${err.message}` }, { status: 500 });
  }
}
