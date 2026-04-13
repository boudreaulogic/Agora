CREATE TABLE "automations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "workspaceId" TEXT,
  "createdById" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "triggerConfig" JSONB NOT NULL DEFAULT '{}',
  "webhookslug" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_actions" (
  "id" TEXT NOT NULL,
  "automationid" TEXT NOT NULL,
  "sortorder" INTEGER NOT NULL DEFAULT 0,
  "actiontype" TEXT NOT NULL,
  "actionconfig" JSONB NOT NULL DEFAULT '{}',
  "conditionexpr" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_runs" (
  "id" TEXT NOT NULL,
  "automationid" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "triggerdata" JSONB,
  "stepresults" JSONB,
  "errormessage" TEXT,
  "startedat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedat" TIMESTAMP(3),
  CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automations_webhookslug_key" ON "automations"("webhookslug");
CREATE INDEX "automations_triggerType_idx" ON "automations"("triggerType");
CREATE INDEX "automations_enabled_idx" ON "automations"("enabled");
CREATE INDEX "automations_webhookslug_idx" ON "automations"("webhookslug");
CREATE INDEX "automations_createdById_idx" ON "automations"("createdById");
CREATE INDEX "automation_actions_automationid_idx" ON "automation_actions"("automationid");
CREATE INDEX "automation_runs_automationid_idx" ON "automation_runs"("automationid");
CREATE INDEX "automation_runs_status_idx" ON "automation_runs"("status");
CREATE INDEX "automation_runs_startedat_idx" ON "automation_runs"("startedat");

ALTER TABLE "automation_actions" ADD CONSTRAINT "automation_actions_automationid_fkey"
  FOREIGN KEY ("automationid") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automationid_fkey"
  FOREIGN KEY ("automationid") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;