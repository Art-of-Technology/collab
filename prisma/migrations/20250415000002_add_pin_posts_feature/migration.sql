-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedBy" TEXT;

-- CreateIndex
CREATE INDEX "Post_isPinned_idx" ON "Post"("isPinned");

-- CreateIndex
CREATE INDEX "Post_workspaceId_isPinned_idx" ON "Post"("workspaceId", "isPinned");

-- CreateIndex
CREATE INDEX "Post_pinnedBy_idx" ON "Post"("pinnedBy");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_pinnedBy_fkey" FOREIGN KEY ("pinnedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; 