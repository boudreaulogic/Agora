/**
 * NextAuth.js v5 Configuration
 * 8 hour session max, no activity renewal
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { db } from '@/lib/db';
import { verifyPassword, loginRateLimiter } from '@/lib/auth/password';

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 8, // 8 hour hard limit
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required');
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Rate limiting
        const rateLimitCheck = loginRateLimiter.check(email);
        if (!rateLimitCheck.allowed) {
          throw new Error('Too many login attempts. Please try again in 15 minutes.');
        }

        // Find user
        const user = await db.user.findUnique({
          where: { email },
        });

        if (!user) {
          throw new Error('Invalid email or password');
        }

        // Check account lock
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('Account is temporarily locked. Please try again later.');
        }

        // Check active status
        if (!user.isActive) {
          throw new Error('Account is inactive. Please contact support.');
        }

        // Verify password
        const isValid = await verifyPassword(user.passwordHash, password);
        
        if (!isValid) {
          const failedAttempts = user.failedLoginAttempts + 1;
          const updates: any = { failedLoginAttempts: failedAttempts };

          // Lock account after 5 failed attempts
          if (failedAttempts >= 5) {
            updates.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
          }

          await db.user.update({
            where: { id: user.id },
            data: updates,
          });

          await db.auditLog.create({
            data: {
              userId: user.id,
              action: 'LOGIN_FAILED',
              metadata: { email, reason: 'Invalid password' },
            },
          });

          throw new Error('Invalid email or password');
        }

        // Successful login - reset counters
        loginRateLimiter.reset(email);

        await db.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        await db.auditLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN_SUCCESS',
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Check for MFA verification signal cookie
      if (token.mfaRequired && !token.mfaVerified) {
        try {
          var { cookies } = await import('next/headers');
          var signal = cookies().get('mfa-verified-signal');
          if (signal?.value === 'true') {
            token.mfaVerified = true;
            cookies().delete('mfa-verified-signal');
          }
        } catch {}
      }

      // On initial sign-in, set MFA flags
      if (user) {
        token.id = user.id;
        var dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { mfaEnabled: true },
        });
        token.mfaRequired = dbUser?.mfaEnabled || false;
        token.mfaVerified = false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).mfaRequired = token.mfaRequired as boolean;
        (session.user as any).mfaVerified = token.mfaVerified as boolean;
      }
      return session;
    },
  },
});