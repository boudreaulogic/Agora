// Run with: docker exec -it agora-web npx tsx src/scripts/test-google-sheets.ts
const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Inline decrypt (matches your encryption.ts)
function decrypt(encryptedText: string): string {
  const ENCRYPTION_KEY = process.env.NEXTAUTH_SECRET || 'default-key-change-me-in-production!!';
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function main() {
  console.log('Testing Google Sheets connection...\n');

  const keySetting = await prisma.systemSetting.findUnique({ where: { key: 'google_sheets_key' } });
  const emailSetting = await prisma.systemSetting.findUnique({ where: { key: 'google_sheets_email' } });

  if (!keySetting?.value) {
    console.error('No Google Sheets key found in database. Configure it in Admin Panel → Google Sheets.');
    process.exit(1);
  }

  console.log('Service email:', emailSetting?.value || 'not set');
  console.log('Key stored:', keySetting.encrypted ? 'encrypted' : 'plaintext');

  const keyJson = keySetting.encrypted ? decrypt(keySetting.value) : keySetting.value;
  const credentials = JSON.parse(keyJson);

  console.log('Key parsed successfully. Client email:', credentials.client_email);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Test with Hunter's sheet
  const SHEET_ID = '1KNeJPWc_ZyGo8ZiwiOu-vE78PRYJJHKlAl7s3XygL2A';

  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'properties.title,sheets.properties',
    });

    console.log('\n✅ CONNECTION SUCCESSFUL!\n');
    console.log('Sheet name:', meta.data.properties?.title);
    console.log('Tabs:');
    meta.data.sheets?.forEach((s: any) => {
      console.log(`  - ${s.properties?.title} (${s.properties?.gridProperties?.rowCount} rows, ${s.properties?.gridProperties?.columnCount} cols)`);
    });

    // Read first tab data
    const firstTab = meta.data.sheets?.[0]?.properties?.title || 'Sheet1';
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${firstTab}'`,
    });

    const values = data.data.values || [];
    console.log(`\nData in "${firstTab}":`);
    console.log('  Total rows:', values.length);
    if (values.length > 0) {
      console.log('  Headers:', values[0].join(' | '));
      if (values.length > 1) {
        console.log('  First row:', values[1].join(' | '));
      }
    }
  } catch (error: any) {
    console.error('\n❌ CONNECTION FAILED\n');
    if (error.message?.includes('not found')) {
      console.error('Sheet not found. Make sure the sheet is shared with:', emailSetting?.value);
    } else if (error.message?.includes('forbidden') || error.message?.includes('403')) {
      console.error('Access denied. Share the sheet with:', emailSetting?.value, 'as Editor');
    } else {
      console.error('Error:', error.message);
    }
  }

  await prisma.$disconnect();
}

main();