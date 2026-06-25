import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// PATCH — update a widget
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var body = await request.json();
  var updates: any = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if (body.dataConfig !== undefined) updates.dataConfig = body.dataConfig;
  if (body.vizConfig !== undefined) updates.vizConfig = body.vizConfig;
  if (body.layoutX !== undefined) updates.layoutX = body.layoutX;
  if (body.layoutY !== undefined) updates.layoutY = body.layoutY;
  if (body.layoutW !== undefined) updates.layoutW = body.layoutW;
  if (body.layoutH !== undefined) updates.layoutH = body.layoutH;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  var widget = await db.widget.update({
    where: { id: params.id },
    data: updates,
  });

  return NextResponse.json(widget);
}

// DELETE — delete a widget
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await db.widget.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}