-- A seat may have the whole workspace as its scope (CLB-613): such a seat has no project.
-- Both statements touch an existing table, so the application role needs no new grant at rollout:
-- its table-level rights cover the changed column and the new index. No row is rewritten.
BEGIN;

ALTER TABLE "AgentSeat" ALTER COLUMN "projectId" DROP NOT NULL;

-- At most one default seat per role among a workspace's seats without a project, as AgentSeat_one_default is per project.
CREATE UNIQUE INDEX "AgentSeat_one_workspace_default" ON "AgentSeat"("workspaceId", "role") WHERE "projectId" IS NULL AND "isDefault" AND "retiredAt" IS NULL;

COMMIT;
