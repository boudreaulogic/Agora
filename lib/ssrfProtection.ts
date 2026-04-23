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

  // Fetch with timeout
  var controller = new AbortController();
  var timeout = setTimeout(function() { controller.abort(); }, opts?.timeoutMs || 10000);
  try {
    return await fetch(parsed.toString(), {
      method: opts?.method || 'GET',
      headers: opts?.headers,
      body: opts?.body,
      signal: controller.signal,
      redirect: 'manual', // Don't follow redirects automatically (they could redirect to internal IPs)
    });
  } finally {
    clearTimeout(timeout);
  }
}