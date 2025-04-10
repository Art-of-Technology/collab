-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "issueKey" TEXT;

-- CreateIndex
CREATE INDEX "Milestone_issueKey_idx" ON "Milestone"("issueKey");
