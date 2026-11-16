-- Runners: one program on one machine under one person's logins, which fetches the tokens of the seats it runs.
-- A new table, so the window grants it to the application role:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentRunner" TO "<application role>";
-- The two new columns are on existing tables and need no grant.
BEGIN;
CREATE TABLE "AgentRunner" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "ownerId" TEXT,
  "name" TEXT NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "pairingCode" TEXT,
  "pairingExpiresAt" TIMESTAMP(3),
  "admittedById" TEXT,
  "admittedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentRunner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentRunner_credentialHash_key" ON "AgentRunner"("credentialHash");
CREATE UNIQUE INDEX "AgentRunner_pairingCode_key" ON "AgentRunner"("pairingCode");
CREATE INDEX "AgentRunner_workspaceId_ownerId_idx" ON "AgentRunner"("workspaceId", "ownerId");
ALTER TABLE "AgentRunner" ADD CONSTRAINT "AgentRunner_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRunner" ADD CONSTRAINT "AgentRunner_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A seat a runner runs: its tokens are fetched by the runner and never made by hand.
ALTER TABLE "AgentSeat" ADD COLUMN "byRunner" BOOLEAN NOT NULL DEFAULT false;

-- Which runner fetched a token; NULL for a token made by hand.
ALTER TABLE "AppToken" ADD COLUMN "runnerId" TEXT;
CREATE INDEX "AppToken_runnerId_idx" ON "AppToken"("runnerId");
COMMIT;
