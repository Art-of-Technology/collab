-- Migration: BoardItemActivity → IssueActivity (Production-Ready)
-- This migration transforms the BoardItemActivity table to work with the unified Issue model
-- while preserving all historical activity data.

-- Step 1: Add projectId column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'BoardItemActivity' AND column_name = 'projectId'
    ) THEN
        ALTER TABLE "BoardItemActivity" ADD COLUMN "projectId" TEXT;
    END IF;
END $$;

-- Step 2: Populate projectId from the linked Issue's projectId
-- This handles all records where itemId references a valid Issue
UPDATE "BoardItemActivity" b
SET "projectId" = i."projectId"
FROM "Issue" i
WHERE b."itemId" = i."id"
  AND b."projectId" IS NULL
  AND i."projectId" IS NOT NULL;

-- Step 3: For records where boardId exists but projectId is still null,
-- try to use boardId directly (TaskBoard IDs were preserved as Project IDs during migration)
UPDATE "BoardItemActivity"
SET "projectId" = "boardId"
WHERE "projectId" IS NULL
  AND "boardId" IS NOT NULL;

-- Step 4: Create indexes for better query performance (if they don't exist)
CREATE INDEX IF NOT EXISTS "BoardItemActivity_projectId_idx" ON "BoardItemActivity"("projectId");

-- Step 5: Create composite index for team sync/planning view queries
CREATE INDEX IF NOT EXISTS "BoardItemActivity_team_sync_idx"
ON "BoardItemActivity"("workspaceId", "itemType", "action", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "BoardItemActivity_item_history_idx"
ON "BoardItemActivity"("itemId", "itemType", "action", "createdAt");

-- Note: We are NOT renaming the table or dropping columns to maintain backward compatibility
-- The Prisma model uses @@map("BoardItemActivity") to reference this table as IssueActivity

-- Step 6: Verify migration results (this will be shown in migration logs)
DO $$
DECLARE
    total_count INTEGER;
    with_project_id INTEGER;
    orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM "BoardItemActivity";
    SELECT COUNT(*) INTO with_project_id FROM "BoardItemActivity" WHERE "projectId" IS NOT NULL;
    SELECT COUNT(*) INTO orphan_count FROM "BoardItemActivity" WHERE "projectId" IS NULL;

    RAISE NOTICE 'Migration Summary:';
    RAISE NOTICE '  Total records: %', total_count;
    RAISE NOTICE '  Records with projectId: %', with_project_id;
    RAISE NOTICE '  Orphan records (no projectId): %', orphan_count;
END $$;
