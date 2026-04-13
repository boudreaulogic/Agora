import { db } from '@/lib/db';

export async function ensureDefaultView(tableId: string, userId: string) {
  // Check if table has any views
  const existingViews = await db.agoraView.findMany({
    where: { tableId },
  });

  // If no views exist, create "All Items" default view
  if (existingViews.length === 0) {
    await db.agoraView.create({
      data: {
        tableId,
        name: 'All Items',
        type: 'grid',
        config: {
          filters: [],
          sorts: [],
          hiddenColumns: [],
        },
        isDefault: true,
        createdById: userId,
      },
    });
  }
}