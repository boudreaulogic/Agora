import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { handleWebhookTrigger } from '@/lib/automations/engine';
import { db } from '@/lib/db';

// Verify HMAC-SHA256 signature from the sending service.
// Expected header: X-Agora-Signature: sha256=<hex>
// Computed as: HMAC-SHA256(webhookSecret, rawBody)
async function verifySignature(req: NextRequest, secret: string): Promise<boolean> {
  var sigHeader = req.headers.get('x-agora-signature') || req.headers.get('x-hub-signature-256') || '';
  if (!sigHeader.startsWith('sha256=')) return false;
  var providedSig = sigHeader.slice(7); // strip "sha256="

  var rawBody = await req.text();
  var expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    return providedSig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(providedSig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    var { slug } = await params;

    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
    }

    // Look up the automation to get its secret before reading the body
    var automation = await db.automation.findUnique({
      where: { webhookSlug: slug },
      select: { webhookSecret: true, enabled: true },
    });

    if (!automation || !automation.enabled) {
      return NextResponse.json({ error: 'Automation not found or disabled' }, { status: 404 });
    }

    // If a secret is configured, require a valid HMAC signature
    if (automation.webhookSecret) {
      var valid = await verifySignature(req, automation.webhookSecret);
      if (!valid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
      // Body was already consumed by verifySignature — parse it from text
      var bodyText = await req.text().catch(function() { return '{}'; });
      var payload: any = {};
      try { payload = JSON.parse(bodyText); } catch {}

      var result = await handleWebhookTrigger(slug, payload);
      return NextResponse.json({ ok: true, automationId: result?.automationId, runId: result?.runId });
    }

    // No secret configured — accept the request (backwards compat)
    var payload = await req.json().catch(function() { return {}; });
    var result = await handleWebhookTrigger(slug, payload);

    if (!result) {
      return NextResponse.json({ error: 'Automation not found or disabled' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, automationId: result.automationId, runId: result.runId });
  } catch (error: any) {
    console.error('[Webhook]', error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Webhook processing failed' : error.message },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  var { slug } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: 'Webhook endpoint active. Send a POST request to trigger.' });
}
