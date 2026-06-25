import { lookup } from 'dns/promises';

// Blocks requests to private networks, localhost, and cloud metadata endpoints
// Use this for any feature that fetches user-provided URLs (Data Connectors, webhooks, etc.)

function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  if (/^10\./.test(ip)) return true;
  if (/^127\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^0\./.test(ip)) return true;
  if (ip.startsWith('172.')) {
    var second = parseInt(ip.split('.')[1]);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 private
  if (ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  // Cloud metadata endpoints
  if (ip === '169.254.169.254') return true;
  if (ip === '169.254.170.2') return true;
  return false;
}

export async function safeFetch(inputUrl: string, opts?: { timeoutMs?: number; method?: string; headers?: Record<string, string>; body?: string }): Promise<Response> {
  var parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  // Only allow HTTP and HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS protocols are allowed');
  }

  // Block embedded credentials
  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed');
  }

  // Block common dangerous hostnames
  var blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal'];
  if (blockedHosts.indexOf(parsed.hostname) !== -1) {
    throw new Error('This hostname is not allowed');
  }

  // Resolve DNS and check the actual IP
  try {
    var result = await lookup(parsed.hostname);
    if (isPrivateIP(result.address)) {
      throw new Error('URLs resolving to private/internal IP addresses are not allowed');
    }
  } catch (err: any) {
    if (err.message && err.message.includes('not allowed')) throw err;
    throw new Error('Could not resolve hostname: ' + parsed.hostname);
  }

  // Fetch with timeout — redirects are handled manually to re-validate the
  // destination IP after each hop (prevents DNS rebinding / open-redirect SSRF).
  var controller = new AbortController();
  var timeout = setTimeout(function() { controller.abort(); }, opts?.timeoutMs || 10000);
  var MAX_REDIRECTS = 5;
  var currentUrl = parsed.toString();
  var response: Response;

  try {
    for (var hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(currentUrl, {
        method: opts?.method || 'GET',
        headers: opts?.headers,
        body: opts?.body,
        signal: controller.signal,
        redirect: 'manual',
      });

      // Not a redirect — we're done
      if (response.status < 300 || response.status >= 400) {
        return response;
      }

      // Redirect — re-validate the Location before following
      var location = response.headers.get('location');
      if (!location) return response;

      var nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new Error('Invalid redirect URL');
      }

      if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
        throw new Error('Redirect to non-HTTP protocol blocked');
      }
      if (nextUrl.username || nextUrl.password) {
        throw new Error('Redirect with embedded credentials blocked');
      }

      // Re-resolve and re-validate the redirect destination IP
      var blockedHosts2 = ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal'];
      if (blockedHosts2.indexOf(nextUrl.hostname) !== -1) {
        throw new Error('Redirect to blocked hostname');
      }
      var redirectResult = await lookup(nextUrl.hostname).catch(function() { return null; });
      if (!redirectResult || isPrivateIP(redirectResult.address)) {
        throw new Error('Redirect resolves to a private/internal IP address');
      }

      currentUrl = nextUrl.toString();
    }
    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timeout);
  }
}