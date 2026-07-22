-- Knowledge Base Phase 2: Note Pinning
-- This migration adds pinning functionality to notes

-- Add pinning fields to Note table
ALTER TABLE "Note" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Note" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "Note" ADD COLUMN "pinnedBy" TEXT;

-- Create index for pinned notes queries
CREATE INDEX "Note_isPinned_idx" ON "Note"("isPinned");

-- Add foreign key constraint for pinnedBy
ALTER TABLE "Note" ADD CONSTRAINT "Note_pinnedBy_fkey" FOREIGN KEY ("pinnedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
