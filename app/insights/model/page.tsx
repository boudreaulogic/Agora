export const dynamic = 'force-dynamic';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { DataModelCanvas } from './DataModelCanvas';

export default async function DataModelPage() {
  var session = await auth();
  if (!session?.user) redirect('/login');

  var tables = await db.agoraTable.findMany({
    include: {
      columns: {
        select: { id: true, name: true, type: true, linkedTableId: true, linkedDisplayColumnId: true, lookupLinkedColumnId: true, lookupFieldId: true, rollupLinkedColumnId: true, rollupFieldId: true, rollupFunction: true },
        orderBy: { position: 'asc' },
      },
      _count: { select: { rows: true } },
    },
    orderBy: { name: 'asc' },
  });

  return <DataModelCanvas tables={tables} />;
}