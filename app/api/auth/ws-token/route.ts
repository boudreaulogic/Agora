import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Create a short-lived token for WebSocket auth
  const token = await new SignJWT({ 
    id: session.user.id, 
    name: session.user.name,
    email: session.user.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30s')
    .sign(secret);

  return NextResponse.json({ token });
}