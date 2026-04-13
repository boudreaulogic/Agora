#!/usr/bin/env tsx

import { db } from '../src/lib/db';

async function main() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('❌ Please provide an email address');
    console.log('Usage: npm run assign-super-admin your@email.com');
    process.exit(1);
  }

  console.log(`🔍 Looking for user: ${email}...`);

  // Get user
  const user = await db.user.findUnique({ where: { email } });
  
  if (!user) {
    console.error(`❌ User not found: ${email}`);
    process.exit(1);
  }

  console.log(`✓ Found user: ${user.name || user.email}`);

  // Get super admin role
  const superAdmin = await db.role.findUnique({ where: { slug: 'super_admin' } });
  
  if (!superAdmin) {
    console.error('❌ Super Admin role not found. Run: npm run db:seed');
    process.exit(1);
  }

  // Check if already assigned
  const existing = await db.userRole.findUnique({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: superAdmin.id,
      },
    },
  });

  if (existing) {
    console.log('⚠️  User already has Super Admin role!');
    process.exit(0);
  }

  // Assign role
  await db.userRole.create({
    data: {
      userId: user.id,
      roleId: superAdmin.id,
    },
  });

  console.log('✅ Super Admin role assigned!');
  console.log(`\n${user.email} is now a Super Admin 🔥\n`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});