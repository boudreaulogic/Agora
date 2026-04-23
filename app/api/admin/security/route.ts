import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify admin
  var isAdmin = await db.userRole.findFirst({
    where: {
      userId: (session.user as any).id,
      role: { permissions: { some: { permission: { slug: 'admin.access' } } } },
    },
  });
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Recent login activity (last 100)
  var loginActivity = await db.auditLog.findMany({
    where: {
      action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'MFA_CODE_SENT', 'MFA_VERIFY_SUCCESS', 'MFA_VERIFY_FAILED', 'MFA_ENABLED', 'MFA_DISABLED'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Fetch user details separately since AuditLog may not have a relation
  var userIds = [...new Set(loginActivity.map(function(l: any) { return l.userId; }).filter(Boolean))];
  var users = await db.user.findMany({
    where: { id: { in: userIds as string[] } },
    select: { id: true, name: true, email: true },
  });
  var userMap = Object.fromEntries(users.map(function(u) { return [u.id, u]; }));
  var loginActivityWithUsers = loginActivity.map(function(log: any) {
    return { ...log, user: userMap[log.userId] || null };
  });

  // Failed login count last 24h
  var oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  var failedLogins24h = await db.auditLog.count({
    where: { action: 'LOGIN_FAILED', createdAt: { gte: oneDayAgo } },
  });

  // Successful logins last 24h
  var successLogins24h = await db.auditLog.count({
    where: { action: 'LOGIN_SUCCESS', createdAt: { gte: oneDayAgo } },
  });

  // Users with MFA enabled
  var mfaUsers = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, mfaEnabled: true, lastLoginAt: true, failedLoginAttempts: true, lockedUntil: true, isActive: true },
    orderBy: { name: 'asc' },
  });

  // Locked accounts
  var lockedAccounts = mfaUsers.filter(function(u) { return u.lockedUntil && u.lockedUntil > new Date(); });

  // Users who never logged in
  var neverLoggedIn = mfaUsers.filter(function(u) { return !u.lastLoginAt; });

  return NextResponse.json({
    loginActivity: loginActivityWithUsers,
    stats: {
      failedLogins24h: failedLogins24h,
      successLogins24h: successLogins24h,
      totalUsers: mfaUsers.length,
      mfaEnabledCount: mfaUsers.filter(function(u) { return u.mfaEnabled; }).length,
      lockedAccounts: lockedAccounts.length,
      neverLoggedIn: neverLoggedIn.length,
    },
    users: mfaUsers,
  });
}

// PATCH — toggle MFA for a specific user (admin action)
export async function PATCH(request: Request) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var isAdmin = await db.userRole.findFirst({
    where: {
      userId: (session.user as any).id,
      role: { permissions: { some: { permission: { slug: 'admin.access' } } } },
    },
  });
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  var body = await request.json();
  var { userId, mfaEnabled, action } = body;

  if (action === 'toggle_mfa' && userId) {
    await db.user.update({
      where: { id: userId },
      data: { mfaEnabled: mfaEnabled },
    });

    await db.auditLog.create({
      data: {
        userId: (session.user as any).id,
        action: mfaEnabled ? 'ADMIN_MFA_ENABLED' : 'ADMIN_MFA_DISABLED',
        metadata: { targetUserId: userId },
      },
    });

    return NextResponse.json({ success: true });
  }

  if (action === 'reset_mfa' && userId) {
    // Clear all MFA codes and disable MFA
    await db.mfaCode.deleteMany({ where: { userId: userId } });
    await db.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, totpSecret: null },
    });

    await db.auditLog.create({
      data: {
        userId: (session.user as any).id,
        action: 'ADMIN_MFA_RESET',
        metadata: { targetUserId: userId },
      },
    });

    return NextResponse.json({ success: true });
  }

  if (action === 'unlock' && userId) {
    await db.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    await db.auditLog.create({
      data: {
        userId: (session.user as any).id,
        action: 'ADMIN_ACCOUNT_UNLOCKED',
        metadata: { targetUserId: userId },
      },
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}