/**
 * NextAuth.js v5 Configuration
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { db } from '@/lib/db';
import { verifyPassword, loginRateLimiter } from '@/lib/auth/password';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
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
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required');
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const rateLimitCheck = loginRateLimiter.check(email);
        if (!rateLimitCheck.allowed) {
          throw new Error('Too many login attempts. Please try again in 15 minutes.');
        }

        const user = await db.user.findUnique({
          where: { email },
        });

        if (!user) {
          throw new Error('Invalid email or password');
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('Account is temporarily locked. Please try again later.');
        }

        if (!user.isActive) {
          throw new Error('Account is inactive. Please contact support.');
        }

        const isValid = await verifyPassword(user.passwordHash, password);

        if (!isValid) {
          const failedAttempts = user.failedLoginAttempts + 1;
          const updates: any = {
            failedLoginAttempts: failedAttempts,
          };

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
              ipAddress: request?.headers?.get('x-forwarded-for') || 'unknown',
              userAgent: request?.headers?.get('user-agent') || 'unknown',
              metadata: { email, reason: 'Invalid password' },
            },
          });

          throw new Error('Invalid email or password');
        }

        loginRateLimiter.reset(email);

        await db.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastLoginIp: request?.headers?.get('x-forwarded-for') || 'unknown',
          },
        });

        await db.auditLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN_SUCCESS',
            ipAddress: request?.headers?.get('x-forwarded-for') || 'unknown',
            userAgent: request?.headers?.get('user-agent') || 'unknown',
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
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async signOut({ session, token }) {
      if (session?.user?.id) {
        await db.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'LOGOUT',
          },
        });
      }
    },
  },
});
