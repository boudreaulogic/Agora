// Cloudflare Turnstile (CAPTCHA) server-side verification.
//
// Completely inert unless TURNSTILE_SECRET_KEY is set, so public forms keep
// working until you add keys. To enable:
//   - TURNSTILE_SECRET_KEY  (server secret — enables enforcement)
//   - TURNSTILE_SITE_KEY    (public site key — returned to the form so it can
//                            render the widget)
// Both come from the Cloudflare dashboard → Turnstile.

export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY || null;
}

// Returns true if the submission may proceed. When Turnstile is disabled this
// always returns true. When enabled, a missing/invalid token returns false.
export async function verifyTurnstile(token: string | undefined | null, ip: string): Promise<boolean> {
  var secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // disabled — do not block submissions
  if (!token) return false;
  try {
    var form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);
    if (ip && ip !== 'unknown') form.append('remoteip', ip);
    var res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    var data = await res.json();
    return data && data.success === true;
  } catch {
    // Network/verify failure: fail closed (reject) so the captcha can't be
    // bypassed by knocking out the verify endpoint.
    return false;
  }
}
