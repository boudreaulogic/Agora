-- Check if any existing linked record columns have data stored in rows
-- Look at the Link and Look up table for reference
SELECT r.id, LEFT(r.data::text, 200) as data
FROM agora_rows r
JOIN agora_tables t ON r."tableId" = t.id
WHERE t.name = 'Link and Look up'
LIMIT 3;

-- Also check what columns the Link and Look up table has
SELECT id, name, type, "linkedTableId", linkeddisplaycolumnid
FROM agora_columns
WHERE "tableId" IN (SELECT id FROM agora_tables WHERE name = 'Link and Look up')
ORDER BY position;