const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const connectors = await db.dataConnector.findMany({ where: { type: 'college_scorecard' } });
  for (const c of connectors) {
    console.log('=== Connector:', c.id, 'tableId:', c.tableId);
    console.log('fieldMapping:', JSON.stringify(c.fieldMapping, null, 2));
    const cols = await db.agoraColumn.findMany({ where: { tableId: c.tableId }, orderBy: { position: 'asc' }, select: { id: true, name: true } });
    console.log('Columns in table:');
    cols.forEach(col => console.log('  ', col.id, '->', col.name));
    const sampleRow = await db.agoraRow.findFirst({ where: { tableId: c.tableId } });
    if (sampleRow) console.log('Sample row data:', JSON.stringify(sampleRow.data, null, 2));
  }
  await db.$disconnect();
})();
