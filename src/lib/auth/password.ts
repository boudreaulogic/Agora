/**
 * Secure Password Hashing with Argon2id
 */

import * as argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letters');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain numbers');
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push('Password must contain special characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function generateSecureToken(): string {
  return require('crypto').randomBytes(32).toString('hex');
}

export class LoginRateLimiter {
  private attempts = new Map<string, { count: number; resetAt: Date }>();

  check(identifier: string): { allowed: boolean; remainingAttempts: number } {
    const now = new Date();
    const record = this.attempts.get(identifier);

    if (!record || record.resetAt < now) {
      this.attempts.set(identifier, {
        count: 1,
        resetAt: new Date(now.getTime() + 15 * 60 * 1000),
      });
      return { allowed: true, remainingAttempts: 4 };
    }

    if (record.count >= 5) {
      return { allowed: false, remainingAttempts: 0 };
    }

    record.count++;
    return { allowed: true, remainingAttempts: 5 - record.count };
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

export const loginRateLimiter = new LoginRateLimiter();
