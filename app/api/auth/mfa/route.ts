import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function generateCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

// POST — send MFA code or verify MFA code
export async function POST(request: Request) {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  var body = await request.json();
  var action = body.action; // 'send' or 'verify'

  var user = await db.user.findUnique({
    where: { id: (session.user as any).id },
    select: { id: true, email: true, name: true, mfaEnabled: true, mfaMethod: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (action === 'send') {
    var code = generateCode();
    var expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.mfaCode.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    await db.mfaCode.create({
      data: {
        userId: user.id,
        code: code,
        method: 'email',
        expiresAt: expiresAt,
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    try {
      await sendEmail({
        to: user.email,
        subject: 'Your Agora verification code',
        html: '<div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">' +
          '<h2 style="color: #111827; margin-bottom: 8px;">Verification Code</h2>' +
          '<p style="color: #6b7280; font-size: 14px; margin-bottom: 20px;">Enter this code to complete your sign-in to Agora:</p>' +
          '<div style="background: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">' +
          '<span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827;">' + code + '</span>' +
          '</div>' +
          '<p style="color: #9ca3af; font-size: 12px;">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>' +
          '</div>',
      });
    } catch (emailErr) {
      console.error('MFA email failed:', emailErr);
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 });
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'MFA_CODE_SENT',
        metadata: { method: 'email', email: user.email },
      },
    });

    return NextResponse.json({ sent: true, method: 'email' });
  }

  if (action === 'verify') {
    var submittedCode = String(body.code || '').trim();
    if (!submittedCode || submittedCode.length !== 6) {
      return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
    }

    var mfaCode = await db.mfaCode.findFirst({
      where: {
        userId: user.id,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!mfaCode) {
      await db.auditLog.create({
        data: { userId: user.id, action: 'MFA_VERIFY_FAILED', metadata: { reason: 'No valid code found' } },
      });
      return NextResponse.json({ error: 'Code expired or not found. Request a new one.' }, { status: 400 });
    }

    if (mfaCode.code !== submittedCode) {
      await db.auditLog.create({
        data: { userId: user.id, action: 'MFA_VERIFY_FAILED', metadata: { reason: 'Wrong code' } },
      });
      return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 });
    }

    await db.mfaCode.update({
      where: { id: mfaCode.id },
      data: { used: true },
    });

    await db.auditLog.create({
      data: { userId: user.id, action: 'MFA_VERIFY_SUCCESS', metadata: { method: 'email' } },
    });

    // Set httpOnly signal cookie to trigger JWT update — NOT a client-side cookie
    var { cookies } = await import('next/headers');
    cookies().set('mfa-verified-signal', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10,
      path: '/',
    });

    return NextResponse.json({ verified: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// GET — check MFA status for current user
export async function GET() {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  var user = await db.user.findUnique({
    where: { id: (session.user as any).id },
    select: { mfaEnabled: true, mfaMethod: true },
  });

  return NextResponse.json({
    mfaEnabled: user?.mfaEnabled || false,
    mfaMethod: user?.mfaMethod || 'email',
  });
}

// PATCH — enable/disable MFA
export async function PATCH(request: Request) {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  var body = await request.json();
  var enabled = body.enabled;

  await db.user.update({
    where: { id: (session.user as any).id },
    data: { mfaEnabled: enabled },
  });

  await db.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: enabled ? 'MFA_ENABLED' : 'MFA_DISABLED',
    },
  });

  return NextResponse.json({ mfaEnabled: enabled });
}