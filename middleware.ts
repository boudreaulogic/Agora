import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getTrustedClientIp } from '@/lib/clientIp';

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

// Routes allowed to be embedded in an <iframe> on an external site (public
// forms, embeddable dashboards). Everything else stays X-Frame-Options DENY /
// frame-ancestors 'none' so the authenticated app can't be clickjacked.
var EMBED_PREFIXES = ['/forms/', '/embed/'];
// Allowed parent origins for embedding. Override with FORM_EMBED_ORIGINS
// (space- or comma-separated). Defaults to the Boudreau Logic WordPress site.
var EMBED_ANCESTORS = (process.env.FORM_EMBED_ORIGINS || 'https://boudreaulogic.com https://www.boudreaulogic.com')
  .replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
function isEmbeddablePath(pathname: string): boolean {
  for (var i = 0; i < EMBED_PREFIXES.length; i++) {
    if (pathname.startsWith(EMBED_PREFIXES[i])) return true;
  }
  return false;
}

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
    var ip = getTrustedClientIp(request.headers);
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
  // Embeddable routes (forms/dashboards) may be framed by the allowed parent
  // origins; everything else forbids framing entirely. challenges.cloudflare.com
  // is whitelisted so an optional Cloudflare Turnstile widget can load on forms.
  var embeddable = isEmbeddablePath(pathname);
  var frameAncestors = embeddable
    ? "frame-ancestors 'self' " + EMBED_ANCESTORS
    : "frame-ancestors 'none'";
  var csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self' wss://* ws://* https://challenges.cloudflare.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    frameAncestors,
    isDev ? '' : 'upgrade-insecure-requests',
  ].filter(Boolean).join('; ');

  // ---------------------------------------------------------------------------
  // P0-1: Global authentication gate — private by default
  // ---------------------------------------------------------------------------
  if (!isPublic(pathname)) {
    // Decode the Auth.js session token. NextAuth v5 stores it as an ENCRYPTED
    // JWE (A256CBC-HS512, salted with the cookie name), NOT a signed JWS — so it
    // must be decrypted via getToken(). A plain jose.jwtVerify() (signature
    // check) always throws on a JWE, which previously redirected every
    // authenticated request back to /login and produced an infinite
    // /login ⇄ / redirect loop (ERR_TOO_MANY_REDIRECTS) once a user signed in.
    //
    // We try the primary cookie name first, then the transitional fallbacks.
    // The decryption salt MUST equal the cookie name the token was issued under,
    // so getToken() is called per-candidate with matching cookieName + salt.
    var secret = process.env.NEXTAUTH_SECRET || '';
    var candidateCookies = [SESSION_COOKIE].concat(SESSION_COOKIE_FALLBACKS);
    var token: any = null;
    for (var i = 0; i < candidateCookies.length; i++) {
      var cookieName = candidateCookies[i];
      if (!request.cookies.get(cookieName)) continue;
      try {
        token = await getToken({
          req: request,
          secret: secret,
          cookieName: cookieName,
          salt: cookieName,
          secureCookie:
            cookieName.indexOf('__Host-') === 0 || cookieName.indexOf('__Secure-') === 0,
        });
      } catch {
        token = null;
      }
      if (token) break;
    }

    if (!token) {
      // No session, or a tampered/expired/undecryptable token
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // MFA enforcement — applies to ALL routes (pages AND API).
    // Exemptions: /verify-mfa (the verification page itself),
    //   /api/auth/mfa (the OTP send/verify endpoint),
    //   /api/auth/nextauth (NextAuth's own handlers).
    // A password-only session must not reach any data endpoint.
    var mfaExempt =
      pathname === '/verify-mfa' ||
      pathname.startsWith('/api/auth/mfa') ||
      pathname.startsWith('/api/auth/nextauth');

    if (token.mfaRequired === true && token.mfaVerified !== true && !mfaExempt) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'MFA verification required', code: 'MFA_REQUIRED' },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL('/verify-mfa', request.url));
    }
  }

  var response = NextResponse.next({ request: { headers: requestHeaders } });

  // Security headers
  response.headers.set('Content-Security-Policy', csp);
  // X-Frame-Options can't express an allowlist, so only DENY on non-embeddable
  // routes; embeddable routes rely on the CSP frame-ancestors directive above.
  if (!embeddable) response.headers.set('X-Frame-Options', 'DENY');
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
