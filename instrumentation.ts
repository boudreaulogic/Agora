// Next.js instrumentation hook — runs once at server startup (Node runtime only).
//
// Forces outbound connections to prefer/stick to IPv4. Docker Desktop's default
// bridge network has no routable IPv6, but Microsoft (login.microsoftonline.com,
// graph.microsoft.com) and Google endpoints return AAAA records first. Node's
// fetch uses Happy Eyeballs (autoSelectFamily), which races IPv4 and IPv6 in
// parallel regardless of DNS order — so it intermittently reaches for the dead
// IPv6 path and throws a bare "fetch failed". Disabling autoSelectFamily +
// ipv4first makes every outbound connector (SharePoint, Google Sheets, etc.)
// resolve and connect over IPv4 deterministically.
//
// NODE_OPTIONS=--dns-result-order=ipv4first (set on the web service) only
// reorders DNS results; it does NOT stop the IPv6 race. This hook does.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const net = await import('net');
    const dns = await import('dns');
    if (typeof (net as any).setDefaultAutoSelectFamily === 'function') {
      (net as any).setDefaultAutoSelectFamily(false);
    }
    dns.setDefaultResultOrder('ipv4first');
    console.log('[instrumentation] Outbound networking pinned to IPv4 (autoSelectFamily off, ipv4first).');
  } catch (err) {
    console.error('[instrumentation] Failed to pin IPv4 outbound:', err);
  }
}
