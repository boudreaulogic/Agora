import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// PATCH — batch update widget layouts (from drag-and-drop)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  var session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  var body = await request.json();
  var layouts = body.layouts || [];

  for (var i = 0; i < layouts.length; i++) {
    var layout = layouts[i];
    await db.widget.update({
      where: { id: layout.id },
      data: {
        layoutX: layout.x,
        layoutY: layout.y,
        layoutW: layout.w,
        layoutH: layout.h,
        sortOrder: layout.sortOrder !== undefined ? layout.sortOrder : i,
      },
    });
  }

  return NextResponse.json({ success: true, updated: layouts.length });
}