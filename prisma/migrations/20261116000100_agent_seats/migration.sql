-- Agent seats: a seat is one project and one role, a run is one session working one issue.
-- Everything here is additive, so the version that is running does not notice it.
-- The application role has no default privileges. At rollout, in the same window, run:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public."AgentSeat", public."AgentRun" TO <application role>;
-- The new columns are on existing tables and need no grant.
BEGIN;

ALTER TABLE "Project" ADD COLUMN "agentMode" TEXT NOT NULL DEFAULT 'handoffs',
  ADD COLUMN "agentSwitchedAt" TIMESTAMP(3);

ALTER TABLE "Issue" ADD COLUMN "agentRequestRole" TEXT;

ALTER TABLE "ProjectStatus" ADD COLUMN "category" TEXT;

CREATE TABLE "AgentSeat" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ownerId" TEXT,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "lastSeenAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentSeat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "seatId" TEXT,
  "userId" TEXT NOT NULL,
  "runner" TEXT NOT NULL,
  "generation" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'running',
  "outcome" TEXT,
  "note" TEXT,
  "ask" JSONB,
  "usage" JSONB,
  "leaseUntil" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),

  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentSeat_userId_key" ON "AgentSeat"("userId");
CREATE INDEX "AgentSeat_projectId_role_idx" ON "AgentSeat"("projectId", "role");
CREATE INDEX "AgentRun_issueId_startedAt_idx" ON "AgentRun"("issueId", "startedAt");
CREATE INDEX "AgentRun_seatId_endedAt_idx" ON "AgentRun"("seatId", "endedAt");

-- The three rules Prisma cannot model. A fresh database gets the same statements from
-- scripts/bootstrap-empty-database.mjs, which reads them from this file by name.
CREATE UNIQUE INDEX "AgentRun_one_open" ON "AgentRun"("issueId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "AgentSeat_one_release" ON "AgentSeat"("projectId") WHERE "role" = 'release' AND "retiredAt" IS NULL;
CREATE UNIQUE INDEX "AgentSeat_one_default" ON "AgentSeat"("projectId", "role") WHERE "isDefault" AND "retiredAt" IS NULL;

ALTER TABLE "AgentSeat" ADD CONSTRAINT "AgentSeat_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentSeat" ADD CONSTRAINT "AgentSeat_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentSeat" ADD CONSTRAINT "AgentSeat_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentSeat" ADD CONSTRAINT "AgentSeat_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_seatId_fkey"
  FOREIGN KEY ("seatId") REFERENCES "AgentSeat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Give every existing status its group from its name; the first rule that matches wins.
-- A status made after this migration has no group until a person sets one.
UPDATE "ProjectStatus" SET "category" = CASE
  WHEN "isFinal" OR lower("name") ~ 'done|complete|cancel|deprecated|wont_fix|won_t_fix|rejected|deleted|waiting_for_deploy|ready_to_release|to_release' THEN 'done'
  WHEN lower("name") ~ 'review|test|qa' OR lower("name") = 'pr' THEN 'in_review'
  WHEN lower("name") ~ 'block' THEN 'blocked'
  WHEN lower("name") ~ 'progress|doing' THEN 'in_progress'
  ELSE 'todo'
END;

COMMIT;
