-- AlterEnum
-- Ensure BUG exists, then migrate DEFECT to BUG and drop DEFECT
DO $$ BEGIN
  ALTER TYPE "IssueType" ADD VALUE IF NOT EXISTS 'BUG';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Update existing records from DEFECT to BUG
UPDATE "Issue" SET "type" = 'BUG' WHERE "type"::text = 'DEFECT';

-- Update Project nextIssueNumbers JSON: rename DEFECT key to BUG if present
UPDATE "Project"
SET "nextIssueNumbers" = jsonb_set(
  COALESCE("nextIssueNumbers", '{}'::jsonb) - 'BUG',
  '{BUG}',
  COALESCE(("nextIssueNumbers"->'DEFECT'), '1'::jsonb),
  true
)
WHERE ("nextIssueNumbers" ? 'DEFECT') OR NOT ("nextIssueNumbers" ? 'BUG');

-- Remove DEFECT key if still present
UPDATE "Project"
SET "nextIssueNumbers" = ("nextIssueNumbers" - 'DEFECT')
WHERE ("nextIssueNumbers" ? 'DEFECT');

-- Drop DEFECT from enum by recreating type
DO $$
DECLARE
  _old TEXT := 'IssueType';
  _new TEXT := 'IssueType_new';
BEGIN
  -- Create new enum without DEFECT
  CREATE TYPE "IssueType_new" AS ENUM ('EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK');
  -- Alter column to new enum
  ALTER TABLE "Issue" ALTER COLUMN "type" TYPE "IssueType_new" USING "type"::text::"IssueType_new";
  -- Drop old enum and rename new
  DROP TYPE "IssueType";
  ALTER TYPE "IssueType_new" RENAME TO "IssueType";
END $$;
