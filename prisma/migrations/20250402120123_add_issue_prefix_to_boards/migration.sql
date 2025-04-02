-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "issueKey" TEXT;

-- AlterTable
ALTER TABLE "TaskBoard" ADD COLUMN     "issuePrefix" TEXT,
ADD COLUMN     "nextIssueNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Task_issueKey_idx" ON "Task"("issueKey");
