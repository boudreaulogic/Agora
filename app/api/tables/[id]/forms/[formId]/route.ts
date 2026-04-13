import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTablePermission } from '@/lib/tablePermissions';

// GET — single form
export async function GET(
  request: Request,
  { params }: { params: { id: string; formId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await db.agoraForm.findUnique({
    where: { id: params.formId },
  });

  if (!form || form.tableId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ form });
}

// PATCH — update form config
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; formId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const perm = await getTablePermission(session.user.id, params.id);
  if (perm !== 'owner' && perm !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();

  const form = await db.agoraForm.update({
    where: { id: params.formId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.fields !== undefined && { fields: body.fields }),
      ...(body.thankYouMessage !== undefined && { thankYouMessage: body.thankYouMessage }),
      ...(body.submitButtonText !== undefined && { submitButtonText: body.submitButtonText }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.allowMultiple !== undefined && { allowMultiple: body.allowMultiple }),
      ...(body.pages !== undefined && { pages: body.pages }),
    },
  });

  return NextResponse.json({ form });
}

// DELETE — delete form
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; formId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const perm = await getTablePermission(session.user.id, params.id);
  if (perm !== 'owner' && perm !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  await db.agoraForm.delete({ where: { id: params.formId } });

  return NextResponse.json({ success: true });
}