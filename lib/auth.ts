/**
 * NextAuth.js v5 Configuration
 * 8-hour session max with server-side revocable session records (UserSession).
 * The JWT carries a `sid` claim; every session callback validates it against
 * the DB. Revoking the row (or disabling the user) ends the session immediately.
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { db } from '@/lib/db';
import { verifyPassword, loginRateLimiter } from '@/lib/auth/password';

var SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

var isProd = process.env.NODE_ENV === 'production';

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE,
  },
  cookies: {
    sessionToken: {
      // __Host- prefix: forces Secure + Path=/ + no Domain — strictest browser binding
      // Falls back to plain name over HTTP in dev (browser won't send __Host- without TLS)
      name: isProd ? '__Host-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: isProd,
      },
    },
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

        var email = credentials.email as string;
        var password = credentials.password as string;

        // Rate limiting
        var rateLimitCheck = loginRateLimiter.check(email);
        if (!rateLimitCheck.allowed) {
          throw new Error('Too many login attempts. Please try again in 15 minutes.');
        }

        var user = await db.user.findUnique({ where: { email } });

        if (!user) throw new Error('Invalid email or password');

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('Account is temporarily locked. Please try again later.');
        }

        if (!user.isActive) {
          throw new Error('Account is inactive. Please contact support.');
        }

        var isValid = await verifyPassword(user.passwordHash, password);

        if (!isValid) {
          var failedAttempts = user.failedLoginAttempts + 1;
          var updates: any = { failedLoginAttempts: failedAttempts };

          // Exponential backoff lockout — harder to DoS a specific account than a flat 30-min lock.
          // After N failures: 2^(N-4) minutes, capped at 30 min.
          // Attempts 1-4: no lockout. Attempt 5: 2 min. 6: 4 min. 7: 8 min. 8+: 30 min max.
          if (failedAttempts >= 5) {
            var backoffMinutes = Math.min(Math.pow(2, failedAttempts - 4), 30);
            updates.lockedUntil = new Date(Date.now() + backoffMinutes * 60 * 1000);
          }

          await db.user.update({ where: { id: user.id }, data: updates });
          await db.auditLog.create({
            data: { userId: user.id, action: 'LOGIN_FAILED', metadata: { email, reason: 'Invalid password', attempt: failedAttempts } },
          });
          throw new Error('Invalid email or password');
        }

        loginRateLimiter.reset(email);

        await db.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
        });

        await db.auditLog.create({ data: { userId: user.id, action: 'LOGIN_SUCCESS' } });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // MFA signal cookie — set by the MFA verify route after OTP confirmation
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

      // Initial sign-in: create a UserSession row and store its id as `sid`
      if (user) {
        token.id = user.id;

        // Best-effort capture of request context for audit
        var userAgent = '';
        var ipAddress = '';
        try {
          var { headers } = await import('next/headers');
          var hdrs = headers();
          userAgent = hdrs.get('user-agent') || '';
          ipAddress =
            hdrs.get('cf-connecting-ip') ||
            hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            '';
        } catch {}

        var userSession = await db.userSession.create({
          data: {
            userId: user.id,
            expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
            userAgent: userAgent || null,
            ipAddress: ipAddress || null,
          },
        });
        token.sid = userSession.id;

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
      // Validate the server-side session record on every request.
      // If the row is missing, revoked, expired, or the user is disabled → reject.
      if (token.sid) {
        try {
          var record = await db.userSession.findUnique({
            where: { id: token.sid as string },
            select: {
              revokedAt: true,
              expiresAt: true,
              user: { select: { isActive: true } },
            },
          });

          if (
            !record ||
            record.revokedAt !== null ||
            record.expiresAt < new Date() ||
            !record.user.isActive
          ) {
            // Return a session object without a user — NextAuth treats this as unauthenticated
            return { ...session, user: undefined as any };
          }
        } catch {
          // DB error: fail closed (reject the session)
          return { ...session, user: undefined as any };
        }
      }

      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).sid = token.sid as string;
        (session.user as any).mfaRequired = token.mfaRequired as boolean;
        (session.user as any).mfaVerified = token.mfaVerified as boolean;
      }
      return session;
    },
  },
});
