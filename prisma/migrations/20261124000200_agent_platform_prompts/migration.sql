-- The versions of each role's platform prompt that a system admin saved on the admin Roles page (CLB-916).
-- A new table, so the window grants it to the application role:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentPlatformPrompt" TO "<application role>";
-- No existing row is read, rewritten or backfilled. With the table empty, every run keeps the repository's text.
-- The role is a catalogue id and the text's length is checked in the application, as the seat roles are: no CHECK constraint.
BEGIN;

-- One row per saved version, only ever added. The highest version of a role is in force; a NULL text means the repository's.
CREATE TABLE "AgentPlatformPrompt" (
  "id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "text" TEXT,
  "reason" TEXT NOT NULL,
  "shippedSha256" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentPlatformPrompt_pkey" PRIMARY KEY ("id")
);
-- Two saves at once cannot both take the next version of a role.
CREATE UNIQUE INDEX "AgentPlatformPrompt_role_version_key" ON "AgentPlatformPrompt"("role", "version");
ALTER TABLE "AgentPlatformPrompt" ADD CONSTRAINT "AgentPlatformPrompt_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
