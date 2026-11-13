-- App review: remember which version an administrator approved, so an owner can publish only that one.
-- The column is on an existing table, so the application role needs no new grant at rollout.
BEGIN;

ALTER TABLE "App" ADD COLUMN "approvedVersionId" TEXT;

-- Apps that are published or suspended were let through before approvals were recorded:
-- their newest version counts as the approved one. Drafts and apps in review stay unapproved.
UPDATE "App" a
SET "approvedVersionId" = (
  SELECT v."id" FROM "AppVersion" v WHERE v."appId" = a."id" ORDER BY v."createdAt" DESC LIMIT 1
)
WHERE a."status" IN ('PUBLISHED', 'SUSPENDED');

COMMIT;
