-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('UPDATE', 'BLOCKER', 'IDEA', 'QUESTION', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PostPriority" AS ENUM ('normal', 'high', 'critical');

-- AddColumn - Add temporary columns with enum types
ALTER TABLE "Post" ADD COLUMN "new_type" "PostType";
ALTER TABLE "Post" ADD COLUMN "new_priority" "PostPriority";

-- Update data - Convert existing string values to enum values
UPDATE "Post" 
SET "new_type" = 
  CASE 
    WHEN "type" = 'UPDATE' THEN 'UPDATE'::"PostType"
    WHEN "type" = 'BLOCKER' THEN 'BLOCKER'::"PostType"
    WHEN "type" = 'IDEA' THEN 'IDEA'::"PostType"
    WHEN "type" = 'QUESTION' THEN 'QUESTION'::"PostType"
    WHEN "type" = 'RESOLVED' THEN 'RESOLVED'::"PostType"
    ELSE 'UPDATE'::"PostType" -- Default fallback
  END;

UPDATE "Post" 
SET "new_priority" = 
  CASE 
    WHEN "priority" = 'normal' THEN 'normal'::"PostPriority"
    WHEN "priority" = 'high' THEN 'high'::"PostPriority"
    WHEN "priority" = 'critical' THEN 'critical'::"PostPriority"
    ELSE 'normal'::"PostPriority" -- Default fallback
  END;

-- Make the new columns NOT NULL
ALTER TABLE "Post" ALTER COLUMN "new_type" SET NOT NULL;
ALTER TABLE "Post" ALTER COLUMN "new_priority" SET NOT NULL;

-- Drop old columns
ALTER TABLE "Post" DROP COLUMN "type";
ALTER TABLE "Post" DROP COLUMN "priority";

-- Rename new columns to original names
ALTER TABLE "Post" RENAME COLUMN "new_type" TO "type";
ALTER TABLE "Post" RENAME COLUMN "new_priority" TO "priority";

-- Set default values
ALTER TABLE "Post" ALTER COLUMN "priority" SET DEFAULT 'normal'; 