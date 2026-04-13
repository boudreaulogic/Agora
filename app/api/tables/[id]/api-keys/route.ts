import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { canAdminTable } from '@/lib/tablePermissions';
import { generateApiKey } from '@/lib/apiAuth';

// GET — list all API keys for this table
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasAdmin = await canAdminTable(session.user.id, params.id);
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Only owners and admins can manage API keys' }, { status: 403 });
  }

  // Get all keys that include this table in their scope
  const allKeys = await db.apiKey.findMany({
    where: {
      isActive: true,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Filter to keys scoped to this table (or keys with empty scope = all tables)
  const tableKeys = allKeys.filter(key => {
    const scope = (key.tableScope as string[]) || [];
    return scope.length === 0 || scope.includes(params.id);
  });

  // Never return the hash — only prefix for identification
  const safeKeys = tableKeys.map(key => ({
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    permissions: key.permissions,
    tableScope: key.tableScope,
    rateLimit: key.rateLimit,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt,
    createdBy: key.user,
  }));

  return NextResponse.json({ keys: safeKeys });
}

// POST — generate a new API key for this table
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasAdmin = await canAdminTable(session.user.id, params.id);
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Only owners and admins can generate API keys' }, { status: 403 });
  }

  const body = await request.json();
  const { name, permissions = 'read', expiresIn } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
  }

  const validPermissions = ['read', 'readwrite', 'admin'];
  if (!validPermissions.includes(permissions)) {
    return NextResponse.json({ error: 'Invalid permissions. Use: read, readwrite, or admin' }, { status: 400 });
  }

  // Generate the key
  const { rawKey, keyHash, keyPrefix } = generateApiKey();

  // Calculate expiration
  let expiresAt: Date | null = null;
  if (expiresIn === '30d') expiresAt = new Date(Date.now() + 30 * 86400000);
  else if (expiresIn === '90d') expiresAt = new Date(Date.now() + 90 * 86400000);
  else if (expiresIn === '1y') expiresAt = new Date(Date.now() + 365 * 86400000);
  // null = never expires

  const apiKey = await db.apiKey.create({
    data: {
      userId: session.user.id,
      name: name.trim(),
      keyHash,
      keyPrefix,
      permissions,
      tableScope: [params.id], // Scoped to this table
      expiresAt,
    },
  });

  // Return the raw key ONCE — it can never be retrieved again
  return NextResponse.json({
    key: {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      permissions: apiKey.permissions,
      rawKey, // ← ONLY TIME this is ever returned
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    },
    warning: 'Save this key now. It will not be shown again.',
  });
}

// DELETE — revoke an API key
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasAdmin = await canAdminTable(session.user.id, params.id);
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Only owners and admins can revoke API keys' }, { status: 403 });
  }

  const { keyId } = await request.json();
  if (!keyId) {
    return NextResponse.json({ error: 'keyId is required' }, { status: 400 });
  }

  // Verify the key exists and is scoped to this table
  const key = await db.apiKey.findUnique({ where: { id: keyId } });
  if (!key) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  }

  const scope = (key.tableScope as string[]) || [];
  if (scope.length > 0 && !scope.includes(params.id)) {
    return NextResponse.json({ error: 'This key is not scoped to this table' }, { status: 403 });
  }

  // Soft delete — deactivate instead of hard delete for audit trail
  await db.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true, message: 'API key revoked' });
}