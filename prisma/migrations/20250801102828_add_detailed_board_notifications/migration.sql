-- AlterTable
ALTER TABLE "NotificationPreferences" ADD COLUMN     "boardTaskAssigned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "boardTaskCompleted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "boardTaskCreated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "boardTaskDeleted" BOOLEAN NOT NULL DEFAULT true;
