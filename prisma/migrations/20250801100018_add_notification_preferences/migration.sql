-- CreateTable
CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskCreated" BOOLEAN NOT NULL DEFAULT true,
    "taskStatusChanged" BOOLEAN NOT NULL DEFAULT true,
    "taskAssigned" BOOLEAN NOT NULL DEFAULT true,
    "taskCommentAdded" BOOLEAN NOT NULL DEFAULT true,
    "taskPriorityChanged" BOOLEAN NOT NULL DEFAULT true,
    "taskDueDateChanged" BOOLEAN NOT NULL DEFAULT true,
    "taskColumnMoved" BOOLEAN NOT NULL DEFAULT false,
    "taskUpdated" BOOLEAN NOT NULL DEFAULT true,
    "taskDeleted" BOOLEAN NOT NULL DEFAULT true,
    "taskMentioned" BOOLEAN NOT NULL DEFAULT true,
    "boardTaskStatusChanged" BOOLEAN NOT NULL DEFAULT true,
    "postCommentAdded" BOOLEAN NOT NULL DEFAULT true,
    "postUpdated" BOOLEAN NOT NULL DEFAULT true,
    "postResolved" BOOLEAN NOT NULL DEFAULT true,
    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");

-- AddForeignKey
ALTER TABLE "NotificationPreferences" ADD CONSTRAINT "NotificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
