const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();

async function resetPassword() {
  try {
    const hash = await argon2.hash('admin123');
    
    await db.user.update({
      where: { email: 'admin@agora.local' },
      data: { 
        passwordHash: hash,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });
    
    console.log('✅ Password reset successfully!');
    console.log('Email: admin@agora.local');
    console.log('Password: admin123');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.$disconnect();
  }
}

resetPassword();