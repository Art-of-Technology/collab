ALTER TABLE "Notification"
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "issueId" TEXT,
  ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Notification_workspaceId_idx" ON "Notification"("workspaceId");
CREATE INDEX "Notification_issueId_idx" ON "Notification"("issueId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
