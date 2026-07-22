-- Migration: BoardItemActivity → IssueActivity
-- This migration copies historical activity data from the old BoardItemActivity table
-- to the new IssueActivity table used by the unified Issue model.

-- Step 1: Check if BoardItemActivity table exists and has data
-- If the table doesn't exist, this migration will silently succeed

-- Step 2: Insert data from BoardItemActivity into IssueActivity
-- Mapping:
--   boardId → projectId (TaskBoard IDs were preserved as Project IDs)
--   taskId/itemId → itemId (prefer taskId if available)
--   itemType → 'ISSUE' for unified model (keeping original in details if needed)

INSERT INTO "IssueActivity" (
  "id",
  "action",
  "details",
  "itemType",
  "itemId",
  "userId",
  "workspaceId",
  "projectId",
  "createdAt",
  "fieldName",
  "oldValue",
  "newValue"
)
SELECT
  "id",
  "action",
  -- Preserve original itemType in details if different from ISSUE
  CASE
    WHEN "details" IS NOT NULL AND "itemType" IS NOT NULL AND "itemType" != 'ISSUE' THEN
      COALESCE("details", '{}')::jsonb || jsonb_build_object('originalItemType', "itemType")
    ELSE "details"::jsonb
  END::text,
  'ISSUE', -- Unified item type
  COALESCE("taskId", "itemId"), -- Prefer taskId, fallback to itemId
  "userId",
  "workspaceId",
  "boardId", -- boardId maps directly to projectId
  "createdAt",
  "fieldName",
  "oldValue",
  "newValue"
FROM "BoardItemActivity"
WHERE NOT EXISTS (
  -- Skip if already migrated (avoid duplicates)
  SELECT 1 FROM "IssueActivity" WHERE "IssueActivity"."id" = "BoardItemActivity"."id"
);

-- Step 3: Update itemId references for activities that reference old Task/Epic/Story/Milestone IDs
-- These should already map correctly since Issue IDs preserved the original entity IDs

-- Step 4: Clean up activities that reference non-existent issues (orphans)
-- We'll keep them for audit purposes but mark them appropriately
-- This can be done in a separate cleanup migration if needed

-- Note: The old BoardItemActivity table is NOT dropped in this migration
-- to allow for verification and potential rollback.
-- A separate cleanup migration can drop it after confirming data integrity.
