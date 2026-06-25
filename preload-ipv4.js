// Node --require preload — loaded via NODE_OPTIONS before the app boots.
//
// Pins outbound sockets to IPv4. Docker Desktop's default bridge network has no
// routable IPv6, but Microsoft (login.microsoftonline.com, graph.microsoft.com)
// and Google endpoints return AAAA records first. Node's fetch uses Happy
// Eyeballs (autoSelectFamily), which races IPv4 and IPv6 — so it reaches the
// dead IPv6 route and fails with ENETUNREACH / UND_ERR_CONNECT_TIMEOUT.
// Disabling autoSelectFamily + ipv4first forces every outbound connection
// (SharePoint, Google Sheets, College Scorecard) onto IPv4.
//
// This runs at the Node process level (guaranteed) — unlike Next's
// instrumentation hook, which does NOT fire in standalone output on Next 14.2.
try {
  var net = require('net');
  if (typeof net.setDefaultAutoSelectFamily === 'function') {
    net.setDefaultAutoSelectFamily(false);
  }
  require('dns').setDefaultResultOrder('ipv4first');
  console.log('[preload-ipv4] Outbound networking pinned to IPv4 (autoSelectFamily off, ipv4first).');
} catch (e) {
  console.error('[preload-ipv4] failed:', e);
}
