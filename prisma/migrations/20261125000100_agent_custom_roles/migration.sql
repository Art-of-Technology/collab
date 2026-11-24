-- A workspace's own seat roles (CLB-626, CLB-627): a name, the built-in role it behaves like, its own instructions, and
-- whether it is retired; and on a seat, the custom role it has.
-- A new table, so the window grants it to the application role:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentCustomRole" TO "<application role>";
-- The new column is on an existing table, is nullable and needs no grant; no row is rewritten and nothing is backfilled.
-- The base role is a catalogue id, and the name and the instructions' length are checked in the application, as the seat
-- roles are: no CHECK constraint.
BEGIN;

-- At most one role of a name per workspace.
CREATE TABLE "AgentCustomRole" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseRole" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "retiredAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentCustomRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentCustomRole_workspaceId_name_key" ON "AgentCustomRole"("workspaceId", "name");
ALTER TABLE "AgentCustomRole" ADD CONSTRAINT "AgentCustomRole_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCustomRole" ADD CONSTRAINT "AgentCustomRole_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The custom role a seat has. NULL for every seat that exists: a built-in role. NO ACTION, checked at the end of the
-- statement, so a role with seats cannot be deleted while a workspace's delete still removes both.
ALTER TABLE "AgentSeat" ADD COLUMN "customRoleId" TEXT;
ALTER TABLE "AgentSeat" ADD CONSTRAINT "AgentSeat_customRoleId_fkey"
  FOREIGN KEY ("customRoleId") REFERENCES "AgentCustomRole"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
COMMIT;
