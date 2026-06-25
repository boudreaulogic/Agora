-- Add attempts counter to mfa_codes for brute-force protection.
-- Codes are now stored as SHA-256 hex (never plaintext) so existing rows
-- will be expired/used naturally; no backfill needed.
ALTER TABLE "mfa_codes" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
