ALTER TABLE "AgentRegistration" ADD COLUMN "host" TEXT,
  ADD COLUMN "sessionId" TEXT, ADD COLUMN "watcher" JSONB;
CREATE UNIQUE INDEX "AgentRegistration_workspaceId_userId_host_sessionId_key"
  ON "AgentRegistration"("workspaceId", "userId", "host", "sessionId");
ALTER TABLE "AgentHandoff" ADD COLUMN "supersededById" TEXT;
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "AgentHandoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
