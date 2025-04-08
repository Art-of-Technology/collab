-- AlterTable
ALTER TABLE "Epic" ADD COLUMN     "columnId" TEXT;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "columnId" TEXT;

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "columnId" TEXT;

-- AlterTable
ALTER TABLE "TaskColumn" ADD COLUMN     "description" TEXT,
ALTER COLUMN "order" SET DEFAULT 0,
ALTER COLUMN "color" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Epic_columnId_idx" ON "Epic"("columnId");

-- CreateIndex
CREATE INDEX "Milestone_columnId_idx" ON "Milestone"("columnId");

-- CreateIndex
CREATE INDEX "Story_columnId_idx" ON "Story"("columnId");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "TaskColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "TaskColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "TaskColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
