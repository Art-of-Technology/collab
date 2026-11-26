-- Add storage for scheduled seat routines (CLB-956).
-- At rollout, grant the new table to the application role:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public."AgentRoutine" TO <application role>;
BEGIN;

CREATE TABLE "AgentRoutine" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "seatId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "everyMinutes" INTEGER NOT NULL,
  "dailyCap" INTEGER NOT NULL DEFAULT 3,
  "spendCapUSD" DECIMAL(65,30),
  "nextDueAt" TIMESTAMP(3) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "pausedReason" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentRoutine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentRoutine_seatId_idx" ON "AgentRoutine"("seatId");
CREATE INDEX "AgentRoutine_enabled_nextDueAt_idx" ON "AgentRoutine"("enabled", "nextDueAt");

ALTER TABLE "AgentRoutine" ADD CONSTRAINT "AgentRoutine_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRoutine" ADD CONSTRAINT "AgentRoutine_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRoutine" ADD CONSTRAINT "AgentRoutine_seatId_fkey"
  FOREIGN KEY ("seatId") REFERENCES "AgentSeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRoutine" ADD CONSTRAINT "AgentRoutine_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
