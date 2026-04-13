import { db } from '@/lib/db';

export async function logActivity({
  tableId,
  rowId,
  columnId,
  userId,
  action,
  details,
}: {
  tableId: string;
  rowId?: string;
  columnId?: string;
  userId: string;
  action: string;
  details?: any;
}) {
  try {
    await db.tableActivity.create({
      data: {
        tableId,
        rowId: rowId || null,
        columnId: columnId || null,
        userId,
        action,
        details: details || null,
      },
    });
  } catch (error) {
    // Never let activity logging break the main operation
    console.error('Failed to log activity:', error);
  }
}