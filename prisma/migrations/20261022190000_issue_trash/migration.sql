ALTER TABLE "Issue" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletedById" TEXT;
CREATE INDEX "Issue_projectId_deletedAt_idx" ON "Issue"("projectId", "deletedAt");
CREATE INDEX "Issue_workspaceId_deletedAt_idx" ON "Issue"("workspaceId", "deletedAt");

-- A parent delete must never cascade through retained issues, including Trash.
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_projectId_fkey";
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_workspaceId_fkey";
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IssueDeletionAudit" (
  "id" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "issueKey" TEXT,
  "title" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "client" TEXT NOT NULL,
  "appId" TEXT,
  "installationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IssueDeletionAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IssueDeletionAudit_workspaceId_createdAt_idx" ON "IssueDeletionAudit"("workspaceId", "createdAt");
CREATE INDEX "IssueDeletionAudit_issueId_createdAt_idx" ON "IssueDeletionAudit"("issueId", "createdAt");
