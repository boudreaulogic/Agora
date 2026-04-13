import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { canAdminTable } from '@/lib/tablePermissions';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const isAdminRequest = url.searchParams.get('admin') === 'true';

  if (isAdminRequest) {
    const hasAdmin = await canAdminTable(session.user.id, params.id);
    if (!hasAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const table = await db.agoraTable.findUnique({
      where: { id: params.id },
      select: { notificationTargets: true },
    });
    return NextResponse.json({ targets: (table?.notificationTargets as any) || {} });
  }

  const settings = await db.tableNotificationSetting.findUnique({
    where: { tableId_userId: { tableId: params.id, userId: session.user.id } },
  });
  return NextResponse.json(settings || {
    onRowCreated: false,
    onRowUpdated: false,
    onRowDeleted: false,
    onCommentAdded: false,
    onFormSubmission: false,
    onApprovalRequest: true,
    onApprovalComplete: true,
    emailEnabled: true,
  });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const isAdminRequest = url.searchParams.get('admin') === 'true';
  const body = await request.json();

  if (isAdminRequest) {
    const hasAdmin = await canAdminTable(session.user.id, params.id);
    if (!hasAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.agoraTable.update({
      where: { id: params.id },
      data: { notificationTargets: body.targets || {} },
    });
    return NextResponse.json({ success: true });
  }

  const settings = await db.tableNotificationSetting.upsert({
    where: { tableId_userId: { tableId: params.id, userId: session.user.id } },
    create: {
      tableId: params.id,
      userId: session.user.id,
      ...body,
    },
    update: body,
  });
  return NextResponse.json(settings);
}