-- Storage for two of a run's instruction layers (CLB-608, CLB-609, CLB-610): the organisation's per role, and a seat's own.
-- A new table, so the window grants it to the application role:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentRoleInstructions" TO "<application role>";
-- The new column is on an existing table, is nullable and needs no grant; no row is rewritten and nothing is backfilled.
-- The role is a catalogue id and each text's length is checked in the application, as the seat roles are: no CHECK constraint.
BEGIN;

-- A workspace's own instructions for one role: at most one row per workspace and role. No row means nothing added.
CREATE TABLE "AgentRoleInstructions" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentRoleInstructions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentRoleInstructions_workspaceId_role_key" ON "AgentRoleInstructions"("workspaceId", "role");
ALTER TABLE "AgentRoleInstructions" ADD CONSTRAINT "AgentRoleInstructions_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRoleInstructions" ADD CONSTRAINT "AgentRoleInstructions_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A seat's own instructions, the last layer of its runs. NULL for every seat that exists: nothing added.
ALTER TABLE "AgentSeat" ADD COLUMN "instructions" TEXT;
COMMIT;
