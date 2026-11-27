-- CreateTable
CREATE TABLE "IssueNotificationSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slackUrlEnc" BYTEA,
    "slackOn" BOOLEAN NOT NULL DEFAULT false,
    "slackEverOn" BOOLEAN NOT NULL DEFAULT false,
    "slackOffAt" TIMESTAMP(3),
    "slackFailedAt" TIMESTAMP(3),
    "mineAssigned" BOOLEAN NOT NULL DEFAULT false,
    "mineReported" BOOLEAN NOT NULL DEFAULT false,
    "mineFollowed" BOOLEAN NOT NULL DEFAULT false,
    "onStatus" BOOLEAN NOT NULL DEFAULT false,
    "onAssigned" BOOLEAN NOT NULL DEFAULT false,
    "onReactions" BOOLEAN NOT NULL DEFAULT false,
    "comments" TEXT NOT NULL DEFAULT 'off',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueNotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueNotificationSetting_workspaceId_idx" ON "IssueNotificationSetting"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueNotificationSetting_userId_workspaceId_key" ON "IssueNotificationSetting"("userId", "workspaceId");

-- AddForeignKey
ALTER TABLE "IssueNotificationSetting" ADD CONSTRAINT "IssueNotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueNotificationSetting" ADD CONSTRAINT "IssueNotificationSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

