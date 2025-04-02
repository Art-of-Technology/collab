-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "html" TEXT,
ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "TaskCommentReaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "taskCommentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCommentReaction_taskCommentId_idx" ON "TaskCommentReaction"("taskCommentId");

-- CreateIndex
CREATE INDEX "TaskCommentReaction_authorId_idx" ON "TaskCommentReaction"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCommentReaction_authorId_taskCommentId_type_key" ON "TaskCommentReaction"("authorId", "taskCommentId", "type");

-- CreateIndex
CREATE INDEX "TaskComment_parentId_idx" ON "TaskComment"("parentId");

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_taskCommentId_fkey" FOREIGN KEY ("taskCommentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
