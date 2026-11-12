-- Issue templates: a workspace's own template per issue type, and the switch that makes agents follow them.
-- The application role has no default privileges. At rollout, in the same window, run:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public."IssueTemplate" TO <application role>;
BEGIN;

ALTER TABLE "Workspace" ADD COLUMN "issueTemplatesEnforced" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "IssueTemplate" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "issueType" "IssueType" NOT NULL,
  "sections" JSONB NOT NULL,
  "requiredFields" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IssueTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IssueTemplate_workspaceId_issueType_key" ON "IssueTemplate"("workspaceId", "issueType");

ALTER TABLE "IssueTemplate" ADD CONSTRAINT "IssueTemplate_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
