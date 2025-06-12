-- CreateEnum
CREATE TYPE "PostActionType" AS ENUM ('CREATED', 'EDITED', 'TYPE_CHANGED', 'PRIORITY_CHANGED', 'RESOLVED', 'REOPENED', 'DELETED');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "resolvedById" TEXT;

-- CreateTable
CREATE TABLE "PostAction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "PostActionType" NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Post_resolvedAt_idx" ON "Post"("resolvedAt");

-- CreateIndex
CREATE INDEX "Post_resolvedById_idx" ON "Post"("resolvedById");

-- CreateIndex
CREATE INDEX "PostAction_postId_idx" ON "PostAction"("postId");

-- CreateIndex
CREATE INDEX "PostAction_userId_idx" ON "PostAction"("userId");

-- CreateIndex
CREATE INDEX "PostAction_action_idx" ON "PostAction"("action");

-- CreateIndex
CREATE INDEX "PostAction_createdAt_idx" ON "PostAction"("createdAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAction" ADD CONSTRAINT "PostAction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAction" ADD CONSTRAINT "PostAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; 