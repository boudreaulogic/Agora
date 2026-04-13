import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { columnId, value } = await request.json();

  // Get the row
  const row = await db.agoraRow.findUnique({
    where: { id: params.rowId },
    include: { table: true },
  });

  if (!row || row.table.createdById !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Update the cell data
  const currentData = row.data as any;
  currentData[columnId] = value;

  const updatedRow = await db.agoraRow.update({
    where: { id: params.rowId },
    data: { data: currentData },
  });

  return NextResponse.json(updatedRow);
}