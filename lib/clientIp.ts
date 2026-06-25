// Single source of truth for resolving the real client IP.
//
// Agora runs behind Cloudflare Tunnel. The only trustworthy client IP is the
// CF-Connecting-IP header, which Cloudflare sets at its edge and a client
// cannot forge. X-Forwarded-For is attacker-prependable — a request can carry
// `X-Forwarded-For: 1.2.3.4, <real>` and naive `split(',')[0]` parsing would
// trust the spoofed first hop, bypassing IP-keyed rate limits / lockouts and
// poisoning audit logs.
//
// Resolution order:
//   1. CF-Connecting-IP   (Cloudflare edge, unforgeable)
//   2. X-Real-IP          (set by our own nginx DMZ)
//   3. X-Forwarded-For    (LAST hop only — closest proxy, least attacker-controlled)
//   4. fallback 'unknown'
//
// Use this everywhere an IP is rate-limited, locked-out, or written to a log.

type HeaderGetter = { get(name: string): string | null };

export function getTrustedClientIp(headers: HeaderGetter): string {
  var cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  var real = headers.get('x-real-ip');
  if (real) return real.trim();

  // Use the LAST entry in X-Forwarded-For — the hop appended by the closest
  // trusted proxy, not the attacker-controlled leftmost value.
  var xff = headers.get('x-forwarded-for');
  if (xff) {
    var hops = xff.split(',');
    var last = hops[hops.length - 1];
    if (last && last.trim()) return last.trim();
  }

  return 'unknown';
}
