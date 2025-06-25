-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "epicId" TEXT;
ALTER TABLE "Comment" ADD COLUMN "storyId" TEXT;
ALTER TABLE "Comment" ADD COLUMN "milestoneId" TEXT;

-- CreateIndex
CREATE INDEX "Comment_epicId_idx" ON "Comment"("epicId");
CREATE INDEX "Comment_storyId_idx" ON "Comment"("storyId");
CREATE INDEX "Comment_milestoneId_idx" ON "Comment"("milestoneId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE; 