import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import argon2 from 'argon2';

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Both passwords are required' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const newHash = await argon2.hash(newPassword);
    await db.user.update({
      where: { id: session.user.id },
      data: { passwordHash: newHash },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'PASSWORD_CHANGED',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API Error] Password change:', error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message },
      { status: 500 }
    );
  }
}