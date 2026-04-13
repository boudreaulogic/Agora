import { NextRequest, NextResponse } from 'next/server';
import { handleWebhookTrigger } from '@/lib/automations/engine';
 
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    var { slug } = await params;
 
    var payload = await req.json().catch(function() {
      return {};
    });
 
    var result = await handleWebhookTrigger(slug, payload);
 
    if (!result) {
      return NextResponse.json(
        { error: 'Automation not found or disabled' },
        { status: 404 }
      );
    }
 
    return NextResponse.json({
      ok: true,
      automationId: result.automationId,
      runId: result.runId,
    });
  } catch (error: any) {
    console.error('[Webhook]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
 
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  var { slug } = await params;
  return NextResponse.json({
    ok: true,
    message: 'Webhook endpoint active. Send a POST request to trigger.',
    slug: slug,
  });
}