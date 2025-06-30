-- Add slug column to TaskBoard (nullable first to handle existing data)
ALTER TABLE "TaskBoard" ADD COLUMN "slug" TEXT;

-- Generate slugs for existing boards based on their names
-- Convert to lowercase, replace spaces with hyphens, remove special characters
UPDATE "TaskBoard" SET "slug" = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE("name", '[^a-zA-Z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'
    ),
    '-+', '-', 'g'
  )
);

-- Handle potential duplicate slugs by appending numbers
WITH ranked_boards AS (
  SELECT 
    id,
    slug,
    ROW_NUMBER() OVER (PARTITION BY slug, "workspaceId" ORDER BY "createdAt") as rn
  FROM "TaskBoard"
  WHERE slug IS NOT NULL
)
UPDATE "TaskBoard" 
SET slug = CASE 
  WHEN rb.rn = 1 THEN rb.slug
  ELSE rb.slug || '-' || rb.rn::text
END
FROM ranked_boards rb
WHERE "TaskBoard".id = rb.id;

-- Make slug column required
ALTER TABLE "TaskBoard" ALTER COLUMN "slug" SET NOT NULL;

-- Add unique constraint for slug within workspace
CREATE UNIQUE INDEX "TaskBoard_slug_workspaceId_key" ON "TaskBoard"("slug", "workspaceId"); 