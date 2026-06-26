import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { encrypt, decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

async function isAdmin(userId: string): Promise<boolean> {
  var userRoles = await db.userRole.findMany({
    where: { userId: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return userRoles.some(function(ur) {
    return ur.role.slug === 'admin' || ur.role.slug === 'super_admin' ||
      ur.role.permissions.some(function(rp) { return rp.permission.slug === 'admin.access'; });
  });
}

// GET — fetch SharePoint settings (secret masked)
export async function GET() {
  var session = await auth();
  if (!session?.user || !(await isAdmin((session.user as any).id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  var keys = ['sp_client_id', 'sp_client_secret', 'sp_tenant_id', 'sp_site_url'];
  var settings = await db.systemSetting.findMany({ where: { key: { in: keys } } });

  var result: Record<string, string> = {};
  for (var i = 0; i < settings.length; i++) {
    var s = settings[i];
    if (s.key === 'sp_client_secret' && s.encrypted) {
      result[s.key] = s.value ? '••••••••' : '';
    } else if (s.encrypted) {
      try { result[s.key] = decrypt(s.value); } catch { result[s.key] = ''; }
    } else {
      result[s.key] = s.value;
    }
  }

  return NextResponse.json(result);
}

// PUT — save SharePoint settings
export async function PUT(request: Request) {
  var session = await auth();
  if (!session?.user || !(await isAdmin((session.user as any).id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  var body = await request.json();

  var settings: { key: string; value: string; encrypted: boolean }[] = [
    { key: 'sp_client_id', value: body.sp_client_id || '', encrypted: false },
    { key: 'sp_tenant_id', value: body.sp_tenant_id || '', encrypted: false },
    { key: 'sp_site_url', value: body.sp_site_url || '', encrypted: false },
  ];

  // Only update secret if not masked placeholder
  if (body.sp_client_secret && body.sp_client_secret !== '••••••••') {
    settings.push({ key: 'sp_client_secret', value: encrypt(body.sp_client_secret), encrypted: true });
  }

  for (var i = 0; i < settings.length; i++) {
    var s = settings[i];
    await db.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, encrypted: s.encrypted },
      create: { key: s.key, value: s.value, encrypted: s.encrypted },
    });
  }

  return NextResponse.json({ success: true });
}

// POST — test connection or fetch lists/columns
export async function POST(request: Request) {
  var session = await auth();
  if (!session?.user || !(await isAdmin((session.user as any).id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  var body = await request.json();

  if (body.action === 'test') {
    try {
      var { testConnection } = await import('@/lib/sharepoint');
      var result = await testConnection();
      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message || 'Connection failed' });
    }
  }

  if (body.action === 'get_lists') {
    try {
      var { getSiteId, getLists, getSharePointConfig } = await import('@/lib/sharepoint');
      // Optional per-site browsing: an admin can point at any granted site URL
      // (Sites.Selected). Falls back to the globally configured site.
      var browseUrl = (body.siteUrl || '').trim();
      if (!browseUrl) {
        var cfg = await getSharePointConfig();
        browseUrl = cfg?.siteUrl || '';
      }
      if (!browseUrl) return NextResponse.json({ error: 'No site URL configured' }, { status: 400 });
      var siteId = await getSiteId(browseUrl);
      var lists = await getLists(siteId);
      return NextResponse.json({ siteId: siteId, siteUrl: browseUrl, lists: lists });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Failed to fetch lists' }, { status: 500 });
    }
  }

  if (body.action === 'get_columns') {
    try {
      var { getListColumns } = await import('@/lib/sharepoint');
      var columns = await getListColumns(body.siteId, body.listId);
      return NextResponse.json({ columns: columns });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Failed to fetch columns' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}