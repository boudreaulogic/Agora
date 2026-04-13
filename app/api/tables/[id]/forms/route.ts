import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

// GET — list forms for a table
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const perm = await getTablePermission(session.user.id, params.id);
  if (!perm) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const forms = await db.agoraForm.findMany({
    where: { tableId: params.id },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ forms });
}

// POST — create a new form for this table
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const perm = await getTablePermission(session.user.id, params.id);
  if (perm !== 'owner' && perm !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { name, description } = await request.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  // Generate slug
  const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let slug = baseSlug;
  let counter = 1;
  while (await db.agoraForm.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  // Get table columns and auto-generate fields config
  const columns = await db.agoraColumn.findMany({
    where: { tableId: params.id },
    orderBy: { position: 'asc' },
  });

  // Skip computed columns
  const skipTypes = ['formula', 'lookup', 'rollup', 'linked_record'];
  const fields = columns
    .filter(col => !skipTypes.includes(col.type))
    .map((col, i) => ({
      columnId: col.id,
      label: col.name,
      columnType: col.type,
      settings: col.settings || {},
      required: i === 0,
      placeholder: '',
      order: i,
      visible: true,
      pageId: 'page_1',
    }));

  const form = await db.agoraForm.create({
    data: {
      tableId: params.id,
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      fields,
      pages: [{ id: 'page_1', title: 'Page 1', description: '' }],
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ form });
}