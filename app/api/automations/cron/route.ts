import { NextRequest, NextResponse } from 'next/server';
import { checkScheduledAutomations } from '@/lib/automations/scheduler';
 
export async function GET(req: NextRequest) {
  try {
    var url = new URL(req.url);
    var secret = url.searchParams.get('secret');
 
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
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
 