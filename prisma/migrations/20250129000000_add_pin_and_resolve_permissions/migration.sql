-- Add new permissions to the Permission enum
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'PIN_POST';

-- Add new post action types
ALTER TYPE "PostActionType" ADD VALUE IF NOT EXISTS 'PINNED';
ALTER TYPE "PostActionType" ADD VALUE IF NOT EXISTS 'UNPINNED';

-- Add isPinned field to Post model
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "pinnedBy" TEXT;

-- Add index for pinned posts
CREATE INDEX IF NOT EXISTS "Post_isPinned_idx" ON "Post"("isPinned");
CREATE INDEX IF NOT EXISTS "Post_workspaceId_isPinned_idx" ON "Post"("workspaceId", "isPinned");

-- Add foreign key for pinnedBy
ALTER TABLE "Post" ADD CONSTRAINT "Post_pinnedBy_fkey" FOREIGN KEY ("pinnedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; 