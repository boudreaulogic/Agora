-- Power Automate-style run history: retry policy + richer run observability + resubmit lineage.
-- All idempotent so it can be applied directly via SQL through the postgres container.

-- Retry policy on the automation
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "maxretries" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "retrydelaysec" INTEGER NOT NULL DEFAULT 0;

-- Run observability + resubmit lineage on the run
ALTER TABLE "automation_runs" ADD COLUMN IF NOT EXISTS "triggersource" TEXT;
ALTER TABLE "automation_runs" ADD COLUMN IF NOT EXISTS "triggeredbyuserid" TEXT;
ALTER TABLE "automation_runs" ADD COLUMN IF NOT EXISTS "durationms" INTEGER;
ALTER TABLE "automation_runs" ADD COLUMN IF NOT EXISTS "rerunofid" TEXT;

-- Self-FK: a re-run points at the run it was resubmitted from; null it out if the original is deleted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'automation_runs_rerunofid_fkey'
  ) THEN
    ALTER TABLE "automation_runs"
      ADD CONSTRAINT "automation_runs_rerunofid_fkey"
      FOREIGN KEY ("rerunofid") REFERENCES "automation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "automation_runs_rerunofid_idx" ON "automation_runs"("rerunofid");
