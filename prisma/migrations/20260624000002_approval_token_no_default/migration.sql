-- Remove the server-side cuid() default from ApprovalRequest.token.
-- Tokens are now generated with crypto.randomBytes(32).toString('hex') at
-- creation time, producing a 64-char hex string that is cryptographically random.
-- Existing rows keep their current token values — no data migration needed.

ALTER TABLE "approval_requests" ALTER COLUMN "token" DROP DEFAULT;
