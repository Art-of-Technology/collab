-- Update existing TaskBoard records that have null issuePrefix values
UPDATE "TaskBoard" SET "issuePrefix" = 'TASK' WHERE "issuePrefix" IS NULL;

-- AlterTable
ALTER TABLE "TaskBoard" ALTER COLUMN "issuePrefix" SET NOT NULL; 