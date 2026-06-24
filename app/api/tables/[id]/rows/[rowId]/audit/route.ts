import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { verifyLedgerChain } from '@/lib/approvalLedger';
import { getTablePermission } from '@/lib/tablePermissions';

export async function GET(request: Request, { params }: { params: { id: string; rowId: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const perm = await getTablePermission(session.user.id, params.id);
  if (!perm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rowCheck = await db.agoraRow.findUnique({ where: { id: params.rowId }, select: { tableId: true } });
  if (!rowCheck || rowCheck.tableId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const entries = await db.approvalLedger.findMany({
    where: { tableId: params.id, rowId: params.rowId },
    orderBy: { createdAt: 'asc' },
  });

  const chainResult = await verifyLedgerChain(params.id, params.rowId);

  return NextResponse.json({
    entries,
    chainValid: chainResult.valid,
    totalEntries: chainResult.entries,
    brokenAt: chainResult.brokenAt,
  });
}