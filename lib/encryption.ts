import crypto from 'crypto';

var ALGORITHM = 'aes-256-gcm';
var IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  // Use dedicated ENCRYPTION_KEY if available, fall back to NEXTAUTH_SECRET for backwards compatibility
  var key = process.env.ENCRYPTION_KEY;
  if (key) {
    var buf = Buffer.from(key, 'hex');
    if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
    return buf;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY env var is not set. Generate one with: openssl rand -hex 32');
  }
  var secret = process.env.NEXTAUTH_SECRET || '';
  return crypto.createHash('sha256').update(secret).digest();
}

function deriveKey(purpose: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', getEncryptionKey(), '', purpose, 32)
  );
}

export function encrypt(text: string): string {
  var key = deriveKey('agora-field-encryption-v1');
  var iv = crypto.randomBytes(IV_LENGTH);
  var cipher = crypto.createCipheriv(ALGORITHM, key, iv) as any;
  var encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  var authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
  var key = deriveKey('agora-field-encryption-v1');
  var parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  var iv = Buffer.from(parts[0], 'hex');
  var authTag = Buffer.from(parts[1], 'hex');
  var encrypted = parts[2];
  var decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as any;
  decipher.setAuthTag(authTag);
  var decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}