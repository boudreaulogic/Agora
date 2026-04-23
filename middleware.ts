import { NextRequest, NextResponse } from 'next/server';

// IP-based login rate limiting (15 attempts per IP per 15 min window)
var loginAttemptsByIp = new Map<string, { count: number; resetAt: number }>();

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
    var ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || 'unknown';
    var now = Date.now();
    var ipRecord = loginAttemptsByIp.get(ip);
    if (!ipRecord || ipRecord.resetAt < now) {
      loginAttemptsByIp.set(ip, { count: 1, resetAt: now + 900000 });
    } else {
      ipRecord.count++;
      if (ipRecord.count > 15) {
        return NextResponse.json({ error: 'Too many login attempts from this IP. Try again in 15 minutes.' }, { status: 429 });
      }
    }
    // Cleanup old entries periodically
    if (loginAttemptsByIp.size > 10000) {
      loginAttemptsByIp.forEach(function(v, k) { if (v.resetAt < now) loginAttemptsByIp.delete(k); });
    }
  }

  var isDev = process.env.NODE_ENV === 'development';

  // Content Security Policy
  // Note: 'unsafe-inline' and 'unsafe-eval' required for Next.js hydration and server actions
  // Cloudflare Insights script allowed explicitly
  var csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self' wss://* ws://*",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' javascript:",
    "frame-ancestors 'none'",
    isDev ? '' : 'upgrade-insecure-requests',
  ].filter(Boolean).join('; ');

  // MFA enforcement — redirect to verify page if MFA required but not verified
  var isMfaExempt = pathname === '/login' || pathname === '/setup' || pathname === '/verify-mfa' || pathname.startsWith('/api/') || pathname.startsWith('/_next/');
  if (!isMfaExempt) {
    var sessionToken = request.cookies.get('next-auth.session-token')?.value || request.cookies.get('__Secure-next-auth.session-token')?.value;
    if (sessionToken) {
      try {
        var jose = await import('jose');
        var secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || '');
        var { payload } = await jose.jwtVerify(sessionToken, secret);
        if (payload.mfaRequired === true && payload.mfaVerified !== true) {
          return NextResponse.redirect(new URL('/verify-mfa', request.url));
        }
      } catch {}
    }
  }

  var response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Security headers
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=()');

  if (!isDev) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

export var config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};