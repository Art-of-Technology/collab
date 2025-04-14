-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "taskCommentId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_taskCommentId_idx" ON "Notification"("taskCommentId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskCommentId_fkey" FOREIGN KEY ("taskCommentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
