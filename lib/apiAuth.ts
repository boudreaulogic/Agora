import { db } from './db';
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

// =============================================================================
// API KEY UTILITIES
// =============================================================================

/**
 * Generate a new API key with prefix.
 * Returns the raw key (shown once) and the hash (stored in DB).
 */
export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const rawKey = `agora_live_${random}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.substring(0, 16); // "agora_live_xxxxx"
  return { rawKey, keyHash, keyPrefix };
}

/**
 * Hash an API key with SHA-256 for storage.
 */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

// =============================================================================
// RATE LIMITER (in-memory sliding window)
// =============================================================================

const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > 120000) { // 2 minutes stale
      rateLimitStore.delete(key);
    }
  }
}, 300000);

function checkRateLimit(keyId: string, limit: number): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const entry = rateLimitStore.get(keyId);

  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitStore.set(keyId, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetIn: windowMs };
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  const resetIn = windowMs - (now - entry.windowStart);

  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetIn };
  }

  return { allowed: true, remaining, resetIn };
}

// =============================================================================
// API AUTH MIDDLEWARE
// =============================================================================

export interface ApiAuthResult {
  keyId: string;
  userId: string;
  tableScope: string[];
  permissions: string; // 'read' | 'readwrite' | 'admin'
  rateLimit: number;
}

/**
 * Authenticate an API request using the Authorization header.
 * Returns the authenticated context or a NextResponse error.
 */
export async function authenticateApiRequest(
  request: Request
): Promise<ApiAuthResult | NextResponse> {
  // Extract bearer token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header. Use: Bearer agora_live_...' } },
      { status: 401 }
    );
  }

  const rawKey = authHeader.substring(7).trim();
  if (!rawKey.startsWith('agora_live_')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid API key format' } },
      { status: 401 }
    );
  }

  // Look up key by hash
  const keyHash = hashApiKey(rawKey);
  const apiKey = await db.apiKey.findUnique({
    where: { keyHash },
    include: {
      user: { select: { id: true, isActive: true } },
    },
  });

  if (!apiKey) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } },
      { status: 401 }
    );
  }

  // Check key is active
  if (!apiKey.isActive) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'API key has been revoked' } },
      { status: 401 }
    );
  }

  // Check expiration
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'API key has expired' } },
      { status: 401 }
    );
  }

  // Check user is still active
  if (!apiKey.user.isActive) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'User account is deactivated' } },
      { status: 401 }
    );
  }

  // Rate limiting
  const { allowed, remaining, resetIn } = checkRateLimit(apiKey.id, apiKey.rateLimit);
  if (!allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: `Rate limit exceeded. Try again in ${Math.ceil(resetIn / 1000)} seconds.` } },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(resetIn / 1000)),
          'X-RateLimit-Limit': String(apiKey.rateLimit),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // Update last used (fire and forget — don't block the response)
  db.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  const tableScope = (apiKey.tableScope as string[]) || [];

  return {
    keyId: apiKey.id,
    userId: apiKey.userId,
    tableScope,
    permissions: apiKey.permissions,
    rateLimit: apiKey.rateLimit,
  };
}

/**
 * Check if an API key has access to a specific table.
 */
export function hasTableAccess(auth: ApiAuthResult, tableId: string): boolean {
  // Empty scope = all tables the user can access (checked at query time)
  if (auth.tableScope.length === 0) return true;
  return auth.tableScope.includes(tableId);
}

/**
 * Check if the API key permission level allows the requested action.
 */
export function hasPermission(auth: ApiAuthResult, action: 'read' | 'write' | 'admin'): boolean {
  switch (auth.permissions) {
    case 'admin':
      return true;
    case 'readwrite':
      return action === 'read' || action === 'write';
    case 'read':
      return action === 'read';
    default:
      return false;
  }
}

/**
 * Add standard rate limit headers to a response.
 */
export function addRateLimitHeaders(response: NextResponse, auth: ApiAuthResult): NextResponse {
  const entry = rateLimitStore.get(auth.keyId);
  const remaining = entry ? Math.max(0, auth.rateLimit - entry.count) : auth.rateLimit;
  response.headers.set('X-RateLimit-Limit', String(auth.rateLimit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  return response;
}