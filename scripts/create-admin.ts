#!/usr/bin/env tsx

/**
 * Create Admin User Script
 */

import { db } from '../src/lib/db';
import { hashPassword, validatePasswordStrength } from '../src/lib/auth/password';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('🔐 Agora Admin User Creation\n');

  const email = await question('Email address: ');
  if (!email || !email.includes('@')) {
    console.error('❌ Invalid email address');
    process.exit(1);
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.error('❌ User with this email already exists');
    process.exit(1);
  }

  const name = await question('Full name: ');
  const password = await question('Password (min 12 chars): ');
  const confirmPassword = await question('Confirm password: ');

  if (password !== confirmPassword) {
    console.error('❌ Passwords do not match');
    process.exit(1);
  }

  const validation = validatePasswordStrength(password);
  if (!validation.valid) {
    console.error('❌ Password does not meet requirements:');
    validation.errors.forEach((err) => console.error(`   - ${err}`));
    process.exit(1);
  }

  console.log('\n🔄 Creating user...');

  const passwordHash = await hashPassword(password);

  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash,
      isActive: true,
      isEmailVerified: true,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_CREATED',
      metadata: {
        email: user.email,
        createdBy: 'script',
      },
    },
  });

  console.log('✅ Admin user created successfully!');
  console.log(`\nEmail: ${email}`);
  console.log('\n🚀 You can now login at: http://localhost:3000/login\n');

  rl.close();
  await db.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
