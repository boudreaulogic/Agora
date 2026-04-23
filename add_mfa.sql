-- Add MFA fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_method VARCHAR(20) DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;

-- MFA verification codes table
CREATE TABLE IF NOT EXISTS mfa_codes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  method VARCHAR(20) NOT NULL DEFAULT 'email',
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_mfa_codes_user_id ON mfa_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_codes_expires ON mfa_codes(expires_at);