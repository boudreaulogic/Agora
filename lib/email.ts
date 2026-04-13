// @ts-ignore
import nodemailer from 'nodemailer';

let _cachedPublicUrl: string | null = null;

async function getPublicUrl(): Promise<string> {
  if (_cachedPublicUrl) return _cachedPublicUrl;
  try {
    const { db } = await import('@/lib/db');
    const setting = await db.systemSetting.findUnique({ where: { key: 'public_url' } });
    if (setting?.value) {
      _cachedPublicUrl = setting.value;
      return setting.value;
    }
  } catch {}
  return process.env.PUBLIC_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

const APP_URL = process.env.PUBLIC_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

export async function getSmtpSettings() {
  try {
    const { db } = await import('@/lib/db');
    const { decrypt } = await import('@/lib/encryption');
    const keys = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'];
    const settings = await db.systemSetting.findMany({ where: { key: { in: keys } } });
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.encrypted ? decrypt(s.value) : s.value;
    }
    return {
      host: map.smtp_host || process.env.SMTP_HOST || '',
      port: parseInt(map.smtp_port || process.env.SMTP_PORT || '587'),
      secure: (map.smtp_secure || process.env.SMTP_SECURE) === 'true',
      user: map.smtp_user || process.env.SMTP_USER || '',
      pass: map.smtp_pass || process.env.SMTP_PASS || '',
      from: map.smtp_from || process.env.SMTP_FROM || 'Agora <noreply@agora.app>',
    };
  } catch {
    return {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'Agora <noreply@agora.app>',
    };
  }
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const settings = await getSmtpSettings();

  if (!settings.user) {
    console.log('[Email] SMTP not configured — skipping email to:', to);
    console.log('[Email] Subject:', subject);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: { user: settings.user, pass: settings.pass },
    });

    const info = await transporter.sendMail({
      from: settings.from,
      to,
      subject,
      html,
    });
    console.log('[Email] Sent:', info.messageId);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] Failed to send:', error);
    return { sent: false, reason: String(error) };
  }
}

export function approvalRequestEmail({
  recipientName,
  tableName,
  rowSummary,
  requestedBy,
  approveUrl,
  denyUrl,
  viewUrl,
  reason,
}: {
  recipientName: string;
  tableName: string;
  rowSummary: string;
  requestedBy: string;
  approveUrl: string;
  denyUrl: string;
  viewUrl: string;
  reason?: string;
}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:32px 16px;"><div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);padding:24px 32px;text-align:center;"><h1 style="color:white;font-size:20px;margin:0;">Agora</h1><p style="color:rgba(255,255,255,0.8);font-size:13px;margin:8px 0 0;">Approval Request</p></div><div style="padding:32px;"><p style="color:#374151;font-size:15px;margin:0 0 16px;">Hi <strong>${recipientName}</strong>,</p><p style="color:#374151;font-size:15px;margin:0 0 20px;"><strong>${requestedBy}</strong> has submitted a record for your approval in <strong>${tableName}</strong>.</p><div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px;"><p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;font-weight:600;">Record Details</p><p style="color:#111827;font-size:14px;margin:0;line-height:1.6;">${rowSummary}</p></div>${reason ? '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:0 0 20px;"><p style="color:#1e40af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;font-weight:600;">Note</p><p style="color:#1e40af;font-size:14px;margin:0;">' + reason + '</p></div>' : ''}<div style="text-align:center;margin:28px 0;"><a href="${approveUrl}" style="display:inline-block;background:#059669;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:0 6px;">Approve</a><a href="${denyUrl}" style="display:inline-block;background:#dc2626;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:0 6px;">Deny</a></div><div style="text-align:center;margin:20px 0 0;"><a href="${viewUrl}" style="color:#3b82f6;font-size:13px;text-decoration:none;">View full record in Agora</a></div></div><div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;"><p style="color:#9ca3af;font-size:11px;margin:0;">This email was sent by Agora.</p></div></div></div></body></html>`;
}

export function notificationEmail({
  recipientName,
  title,
  message,
  viewUrl,
}: {
  recipientName: string;
  title: string;
  message: string;
  viewUrl?: string;
}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:32px 16px;"><div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);padding:20px 32px;text-align:center;"><h1 style="color:white;font-size:18px;margin:0;">Agora</h1></div><div style="padding:28px 32px;"><p style="color:#374151;font-size:15px;margin:0 0 12px;">Hi <strong>${recipientName}</strong>,</p><h2 style="color:#111827;font-size:17px;margin:0 0 12px;">${title}</h2><p style="color:#4b5563;font-size:14px;margin:0 0 20px;line-height:1.6;">${message}</p>${viewUrl ? '<div style="text-align:center;"><a href="' + viewUrl + '" style="display:inline-block;background:#3b82f6;color:white;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View in Agora</a></div>' : ''}</div><div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;"><p style="color:#9ca3af;font-size:11px;margin:0;">Sent by Agora</p></div></div></div></body></html>`;
}

export { APP_URL };