// ============================================================
// lib/insights/embed-token.ts
// Embed token signing + verification, shared by the embed page and the
// public embed-query API so the HMAC scheme lives in exactly one place.
// Token format: "<hmacHex>.<base64url(JSON payload)>", payload = { dashboardId, createdAt, createdBy }.
// ============================================================

import crypto from 'crypto';

var MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface EmbedPayload { dashboardId: string; createdAt: number; createdBy?: string; }

function secret(): string {
  return process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || 'agora-default-key';
}

export function signEmbedToken(payload: EmbedPayload): string {
  var json = JSON.stringify(payload);
  var sig = crypto.createHmac('sha256', secret()).update(json).digest('hex');
  return sig + '.' + Buffer.from(json).toString('base64url');
}

// Returns the decoded payload if the token is valid for `dashboardId` and unexpired, else null.
export function verifyEmbedToken(token: string | undefined | null, dashboardId: string): EmbedPayload | null {
  if (!token) return null;
  var parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    var json = Buffer.from(parts[1], 'base64url').toString();
    var payload = JSON.parse(json) as EmbedPayload;
    var expected = crypto.createHmac('sha256', secret()).update(json).digest('hex');
    // Constant-time compare to avoid signature-timing leaks.
    var a = Buffer.from(expected);
    var b = Buffer.from(parts[0]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (payload.dashboardId !== dashboardId) return null;
    if (!payload.createdAt || Date.now() - payload.createdAt > MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
