-- Stores the built-in workspace role names in upper case and gives every workspace's owner an active OWNER membership (CLB-1077).
-- Data only: no table, column, index or type changes, so the schema checksum stays the same.
-- No grant: it only reads and writes rows of existing tables the application role already uses.
-- A role that equals one of the sixteen WorkspaceRole names in another letter case becomes that name; any other value,
-- a custom role among them, is left byte for byte. COLLATE "C" keeps upper() to ASCII letters whatever the database locale.
-- Safe to run again: a second run finds nothing to change.
BEGIN;

-- 1. Permission rows that would share (workspace, role, permission) once upper-cased: keep the one already in upper case
--    and delete the others first, so the unique index holds through step 2.
DELETE FROM "RolePermission" AS r
USING (
  SELECT "id", row_number() OVER (
    PARTITION BY "workspaceId", upper("role" COLLATE "C"), "permission"
    ORDER BY ("role" = upper("role" COLLATE "C")) DESC
  ) AS n
  FROM "RolePermission"
  WHERE upper("role" COLLATE "C") = ANY (enum_range(NULL::"WorkspaceRole")::text[])
) AS ranked
WHERE r."id" = ranked."id" AND ranked.n > 1;

-- 2. Upper-case the built-in names in permission rows.
UPDATE "RolePermission"
SET "role" = upper("role" COLLATE "C"), "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" <> upper("role" COLLATE "C")
  AND upper("role" COLLATE "C") = ANY (enum_range(NULL::"WorkspaceRole")::text[]);

-- 3. Upper-case the built-in names in memberships. A user has one membership per workspace, so no row can collide.
UPDATE "WorkspaceMember"
SET "role" = upper("role" COLLATE "C"), "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" <> upper("role" COLLATE "C")
  AND upper("role" COLLATE "C") = ANY (enum_range(NULL::"WorkspaceRole")::text[]);

-- 4. The owner's own membership becomes an active OWNER where it has another role or is inactive.
UPDATE "WorkspaceMember" AS m
SET "role" = 'OWNER', "status" = true, "updatedAt" = CURRENT_TIMESTAMP
FROM "Workspace" AS w
WHERE m."workspaceId" = w."id" AND m."userId" = w."ownerId"
  AND (m."role" <> 'OWNER' OR m."status" IS NOT TRUE);

-- 5. An owner with no membership gets one. The app's ids are Prisma cuids made in the client, so the database has no
--    default; a random UUID as text is unique and fits the TEXT id. createdAt has its own default.
INSERT INTO "WorkspaceMember" ("id", "userId", "workspaceId", "role", "status", "updatedAt")
SELECT gen_random_uuid()::text, w."ownerId", w."id", 'OWNER', true, CURRENT_TIMESTAMP
FROM "Workspace" AS w
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkspaceMember" AS m WHERE m."workspaceId" = w."id" AND m."userId" = w."ownerId"
);

COMMIT;
