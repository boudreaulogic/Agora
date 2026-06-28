import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { accessibleAutomationWhere, canAccessAutomation } from '@/lib/automations/access';

export const dynamic = 'force-dynamic';

// GET /api/automations/analytics?days=14[&automationId=...]
// Aggregate run analytics — global across the user's accessible automations, or
// scoped to a single automation. Powers the analytics dashboard + per-flow stats.
export async function GET(req: NextRequest) {
  try {
    var session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    var userId = (session.user as any).id;

    var url = new URL(req.url);
    var days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '14', 10) || 14, 1), 90);
    var automationId = url.searchParams.get('automationId');
    var since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Resolve the set of automations in scope (with names for the "top failing" list).
    var autoWhere: any;
    if (automationId) {
      var one = await db.automation.findUnique({ where: { id: automationId } });
      if (!one) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (!(await canAccessAutomation(userId, one))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      autoWhere = { id: automationId };
    } else {
      autoWhere = await accessibleAutomationWhere(userId);
    }

    var autos = await db.automation.findMany({ where: autoWhere, select: { id: true, name: true } });
    var nameById: Record<string, string> = {};
    autos.forEach(function(a) { nameById[a.id] = a.name; });
    var ids = autos.map(function(a) { return a.id; });

    if (ids.length === 0) {
      return NextResponse.json({
        days: days, totalRuns: 0, byStatus: {}, successRate: null,
        avgDurationMs: null, p95DurationMs: null, perDay: [], topFailing: [],
      });
    }

    var runs = await db.automationRun.findMany({
      where: { automationId: { in: ids }, startedAt: { gte: since } },
      select: { automationId: true, status: true, durationMs: true, startedAt: true },
      orderBy: { startedAt: 'asc' },
      take: 20000,
    });

    var byStatus: Record<string, number> = {};
    var durations: number[] = [];
    var failuresByAuto: Record<string, number> = {};
    var perDayMap: Record<string, { date: string; success: number; failed: number; other: number }> = {};

    runs.forEach(function(r) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (typeof r.durationMs === 'number') durations.push(r.durationMs);
      if (r.status === 'failed') failuresByAuto[r.automationId] = (failuresByAuto[r.automationId] || 0) + 1;

      var dayKey = r.startedAt.toISOString().slice(0, 10);
      if (!perDayMap[dayKey]) perDayMap[dayKey] = { date: dayKey, success: 0, failed: 0, other: 0 };
      if (r.status === 'success') perDayMap[dayKey].success++;
      else if (r.status === 'failed') perDayMap[dayKey].failed++;
      else perDayMap[dayKey].other++;
    });

    // Fill every day in the window so the chart has no gaps.
    var perDay: any[] = [];
    for (var d = days - 1; d >= 0; d--) {
      var key = new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      perDay.push(perDayMap[key] || { date: key, success: 0, failed: 0, other: 0 });
    }

    durations.sort(function(a, b) { return a - b; });
    var avgDurationMs = durations.length
      ? Math.round(durations.reduce(function(s, v) { return s + v; }, 0) / durations.length)
      : null;
    var p95DurationMs = durations.length
      ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]
      : null;

    var total = runs.length;
    var succeeded = byStatus['success'] || 0;
    var finished = succeeded + (byStatus['failed'] || 0);

    var topFailing = Object.keys(failuresByAuto)
      .map(function(aid) { return { automationId: aid, name: nameById[aid] || 'Unknown', failures: failuresByAuto[aid] }; })
      .sort(function(a, b) { return b.failures - a.failures; })
      .slice(0, 5);

    return NextResponse.json({
      days: days,
      totalRuns: total,
      byStatus: byStatus,
      successRate: finished > 0 ? Math.round((succeeded / finished) * 100) : null,
      avgDurationMs: avgDurationMs,
      p95DurationMs: p95DurationMs,
      perDay: perDay,
      topFailing: topFailing,
      automationCount: ids.length,
    });
  } catch (error: any) {
    console.error('[Automation Analytics]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
