import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter using sliding window
// For multi-replica deployments, swap to Redis-backed rate-limiter-flexible

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

var stores: Record<string, Map<string, RateLimitRecord>> = {};

function getStore(tier: string): Map<string, RateLimitRecord> {
  if (!stores[tier]) {
    stores[tier] = new Map();
    // Cleanup old entries every 5 minutes
    setInterval(function() {
      var now = Date.now();
      var store = stores[tier];
      store.forEach(function(record, key) {
        if (now > record.resetAt) store.delete(key);
      });
    }, 300000);
  }
  return stores[tier];
}

// Rate limit tiers
var TIERS: Record<string, { points: number; windowMs: number }> = {
  auth: { points: 5, windowMs: 60000 },       // 5 per minute (login, register)
  mutation: { points: 60, windowMs: 60000 },    // 60 per minute (create, update, delete)
  read: { points: 120, windowMs: 60000 },       // 120 per minute (list, get)
  upload: { points: 10, windowMs: 60000 },      // 10 per minute (file uploads)
  publicForm: { points: 20, windowMs: 60000 },  // 20 per minute (public form submissions)
};

function getClientIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || req.headers.get('cf-connecting-ip')
    || '127.0.0.1';
}

export function checkRateLimit(req: NextRequest, tier: string): { allowed: boolean; remaining: number; retryAfter?: number } {
  var config = TIERS[tier];
  if (!config) return { allowed: true, remaining: 999 };

  var store = getStore(tier);
  var key = getClientIP(req) + ':' + tier;
  var now = Date.now();

  var record = store.get(key);
  if (!record || now > record.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.points - 1 };
  }

  record.count++;
  if (record.count > config.points) {
    var retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter: retryAfter };
  }

  return { allowed: true, remaining: config.points - record.count };
}

export function rateLimitResponse(result: { remaining: number; retryAfter?: number }): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter || 60),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

// Convenience: wrap a handler with rate limiting
export function withRateLimit(tier: string) {
  return function(req: NextRequest): NextResponse | null {
    var result = checkRateLimit(req, tier);
    if (!result.allowed) {
      return rateLimitResponse(result);
    }
    return null; // continue to handler
  };
}