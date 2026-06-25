import { db } from '@/lib/db';
import crypto from 'crypto';

// Server-held key for HMAC-signing ledger entries. Derived from ENCRYPTION_KEY
// (which lives in env, outside the database) so that an attacker with DB-write
// access alone — SQL injection, a stolen backup, a compromised DB role —
// cannot forge or recompute a valid chain. Plain SHA-256 was tamper-EVIDENT
// (anyone could recompute it); HMAC makes it tamper-RESISTANT without the key.
function getLedgerKey(): Buffer {
  var key = process.env.ENCRYPTION_KEY;
  if (key && /^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(
      crypto.hkdfSync('sha256', Buffer.from(key, 'hex'), '', 'agora-audit-ledger-v1', 32)
    ) as Buffer;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY is required to sign the audit ledger in production.');
  }
  // Dev fallback — derive from NEXTAUTH_SECRET so local development works.
  return crypto.createHash('sha256').update(process.env.NEXTAUTH_SECRET || 'dev').digest();
}

function computeHash(data: {
  previousHash: string | null;
  action: string;
  actorId: string;
  rowSnapshot: any;
  timestamp: string;
  stage?: number;
  reason?: string;
}): string {
  const payload = JSON.stringify({
    ph: data.previousHash || 'GENESIS',
    a: data.action,
    u: data.actorId,
    s: data.rowSnapshot,
    t: data.timestamp,
    st: data.stage || 0,
    r: data.reason || '',
  });
  // HMAC-SHA256 keyed with the server-held ledger key (not plain SHA-256).
  return crypto.createHmac('sha256', getLedgerKey()).update(payload).digest('hex');
}

export async function addLedgerEntry({
  tableId,
  rowId,
  workflowId,
  requestId,
  action,
  stage,
  stageName,
  actorId,
  actorName,
  actorEmail,
  rowSnapshot,
  reason,
  workflowName,
  requiredApprovers,
  ipAddress,
}: {
  tableId: string;
  rowId: string;
  workflowId: string;
  requestId?: string;
  action: string;
  stage?: number;
  stageName?: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  rowSnapshot: any;
  reason?: string;
  workflowName: string;
  requiredApprovers?: any;
  ipAddress?: string;
}) {
  const lastEntry = await db.approvalLedger.findFirst({
    where: { tableId, rowId },
    orderBy: { createdAt: 'desc' },
    select: { entryHash: true },
  });

  const timestamp = new Date().toISOString();
  const entryHash = computeHash({
    previousHash: lastEntry?.entryHash || null,
    action,
    actorId,
    rowSnapshot,
    timestamp,
    stage,
    reason,
  });

  const entry = await db.approvalLedger.create({
    data: {
      tableId,
      rowId,
      workflowId,
      requestId: requestId || null,
      action,
      stage: stage || null,
      stageName: stageName || null,
      actorId,
      actorName,
      actorEmail,
      rowSnapshot,
      reason: reason || null,
      workflowName,
      requiredApprovers: requiredApprovers || null,
      previousHash: lastEntry?.entryHash || null,
      entryHash,
      ipAddress: ipAddress || null,
      createdAt: new Date(timestamp),
    },
  });

  return entry;
}

export async function verifyLedgerChain(tableId: string, rowId: string): Promise<{ valid: boolean; entries: number; brokenAt?: number }> {
  const entries = await db.approvalLedger.findMany({
    where: { tableId, rowId },
    orderBy: { createdAt: 'asc' },
  });

  if (entries.length === 0) return { valid: true, entries: 0 };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPrevHash = i === 0 ? null : entries[i - 1].entryHash;

    if (entry.previousHash !== expectedPrevHash) {
      return { valid: false, entries: entries.length, brokenAt: i };
    }

    const recomputed = computeHash({
      previousHash: entry.previousHash,
      action: entry.action,
      actorId: entry.actorId,
      rowSnapshot: entry.rowSnapshot,
      timestamp: entry.createdAt.toISOString(),
      stage: entry.stage || undefined,
      reason: entry.reason || undefined,
    });

    if (recomputed !== entry.entryHash) {
      return { valid: false, entries: entries.length, brokenAt: i };
    }
  }

  return { valid: true, entries: entries.length };
}