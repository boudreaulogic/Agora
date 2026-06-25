-- Add optional HMAC signing secret to automations.
-- When set, inbound webhook requests must include a valid
-- X-Agora-Signature: sha256=<HMAC-SHA256(secret, body)> header.
-- Existing automations get NULL (no signature required) for backwards compat.
ALTER TABLE "automations" ADD COLUMN "webhooksecret" TEXT;
