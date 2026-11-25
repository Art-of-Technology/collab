-- Who holds MANAGE_AGENTS and MANAGE_LEAVE from day one (CLB-1163), so nobody who manages agents today loses it.
-- Data only: no table, column, index or type changes. No grant: it only inserts rows into a table the application
-- role already writes. It changes and deletes no row; a row that is already there is left alone (ON CONFLICT on the
-- unique (workspaceId, role, permission)), so a second run adds nothing.
-- The app's ids are Prisma cuids made in the client, so the database has no default; a random UUID as text is unique
-- and fits the TEXT id. createdAt has its own default; updatedAt has none.
BEGIN;

-- 1. Every (workspace, role) that may edit permissions today may manage agents: built-in and custom roles alike.
INSERT INTO "RolePermission" ("id", "workspaceId", "role", "permission", "updatedAt")
SELECT gen_random_uuid()::text, r."workspaceId", r."role", 'MANAGE_AGENTS', CURRENT_TIMESTAMP
FROM "RolePermission" AS r
WHERE r."permission" = 'MANAGE_WORKSPACE_PERMISSIONS'
ON CONFLICT ("workspaceId", "role", "permission") DO NOTHING;

-- 2. ADMIN approves leave by default, in every workspace where ADMIN has any row.
INSERT INTO "RolePermission" ("id", "workspaceId", "role", "permission", "updatedAt")
SELECT gen_random_uuid()::text, a."workspaceId", 'ADMIN', 'MANAGE_LEAVE', CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "workspaceId" FROM "RolePermission" WHERE "role" = 'ADMIN') AS a
ON CONFLICT ("workspaceId", "role", "permission") DO NOTHING;

COMMIT;
