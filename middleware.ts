import { NextRequest, NextResponse } from 'next/server';

// IP-based login rate limiting (15 attempts per IP per 15 min window)
var loginAttemptsByIp = new Map<string, { count: number; resetAt: number }>();

// ---------------------------------------------------------------------------
// Public paths — everything else requires a valid session
// ---------------------------------------------------------------------------
var PUBLIC_EXACT = new Set(['/login', '/setup', '/verify-mfa']);
var PUBLIC_PREFIXES = [
  '/api/auth/',      // NextAuth's own endpoints
  '/api/public/',    // public form submission endpoints
  '/api/approvals/', // token-gated approval links (token is the credential)
  '/forms/',         // public form pages
  '/_next/',
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (var i = 0; i < PUBLIC_PREFIXES.length; i++) {
    if (pathname.startsWith(PUBLIC_PREFIXES[i])) return true;
  }
  return false;
}

var isProd = process.env.NODE_ENV === 'production';

// Cookie name must match the name configured in lib/auth.ts
var SESSION_COOKIE = isProd
  ? '__Host-next-auth.session-token'
  : 'next-auth.session-token';

// Fallback names for existing cookies during the transition to __Host-
var SESSION_COOKIE_FALLBACKS = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
];

export async function middleware(request: NextRequest) {
  // CVE-2025-29927 defense-in-depth — strip the exploit header
  var requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-middleware-subrequest');

  // Block oversized request bodies
  var contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  // Login rate limiting by IP — prevents credential stuffing
  var pathname = request.nextUrl.pathname;
  if (pathname === '/api/auth/callback/credentials' && request.method === 'POST') {
    var ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('cf-connecting-ip')
      || 'unknown';
    var now = Date.now();
    var ipRecord = loginAttemptsByIp.get(ip);
    if (!ipRecord || ipRecord.resetAt < now) {
      loginAttemptsByIp.set(ip, { count: 1, resetAt: now + 900000 });
    } else {
      ipRecord.count++;
      if (ipRecord.count > 15) {
        return NextResponse.json(
          { error: 'Too many login attempts from this IP. Try again in 15 minutes.' },
          { status: 429 }
        );
      }
    }
    if (loginAttemptsByIp.size > 10000) {
      loginAttemptsByIp.forEach(function(v, k) {
        if (v.resetAt < now) loginAttemptsByIp.delete(k);
      });
    }
  }

  var isDev = process.env.NODE_ENV === 'development';

  // Content Security Policy
  var csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self' wss://* ws://*",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    isDev ? '' : 'upgrade-insecure-requests',
  ].filter(Boolean).join('; ');

  // ---------------------------------------------------------------------------
  // P0-1: Global authentication gate — private by default
  // ---------------------------------------------------------------------------
  if (!isPublic(pathname)) {
    // Find session token — primary name first, then fallbacks
    var sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionToken) {
      for (var i = 0; i < SESSION_COOKIE_FALLBACKS.length; i++) {
        sessionToken = request.cookies.get(SESSION_COOKIE_FALLBACKS[i])?.value;
        if (sessionToken) break;
      }
    }

    if (!sessionToken) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Verify JWT signature and expiry — rejects tampered or expired tokens
    try {
      var jose = await import('jose');
      var secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || '');
      var { payload } = await jose.jwtVerify(sessionToken, secret);

      // MFA enforcement — applies to ALL routes (pages AND API).
      // Exemptions: /verify-mfa (the verification page itself),
      //   /api/auth/mfa (the OTP send/verify endpoint),
      //   /api/auth/nextauth (NextAuth's own handlers).
      // A password-only session must not reach any data endpoint.
      var mfaExempt =
        pathname === '/verify-mfa' ||
        pathname.startsWith('/api/auth/mfa') ||
        pathname.startsWith('/api/auth/nextauth');

      if (payload.mfaRequired === true && payload.mfaVerified !== true && !mfaExempt) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'MFA verification required', code: 'MFA_REQUIRED' },
            { status: 401 }
          );
        }
        return NextResponse.redirect(new URL('/verify-mfa', request.url));
      }
    } catch {
      // Invalid or expired JWT
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  var response = NextResponse.next({ request: { headers: requestHeaders } });

  // Security headers
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=()'
  );

  if (!isDev) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

export var config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
