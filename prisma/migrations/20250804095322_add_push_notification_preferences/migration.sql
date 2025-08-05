-- AlterTable
ALTER TABLE "NotificationPreferences" ADD COLUMN     "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pushSubscription" JSONB;
