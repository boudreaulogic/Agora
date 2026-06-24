import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkScheduledAutomations } from '@/lib/automations/scheduler';

export async function GET(req: NextRequest) {
  try {
    var cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[Cron] CRON_SECRET env var is not set');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    var provided = new URL(req.url).searchParams.get('secret') || '';
    var match = provided.length === cronSecret.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(cronSecret));
    if (!match) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
 
    var fired = await checkScheduledAutomations();
 
    return NextResponse.json({
      ok: true,
      automationsFired: fired,
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Cron]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
 