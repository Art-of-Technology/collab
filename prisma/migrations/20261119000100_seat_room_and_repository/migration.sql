-- Columns for the seat stories that follow; the code that reads and writes them comes in later pull requests.
-- Every column is on an existing table, so the application role needs no new grant at rollout: its table-level
-- rights cover a new column. Every column is nullable or has a constant default, so no row is rewritten and
-- nothing is backfilled. The values a column takes are validated in the application, as the seat and run states are.
BEGIN;

-- A project with no repository connected holds a typed https address, which every seat of the project gets.
-- The owner's switch lets a member add their own seats to the project; off for every existing project.
ALTER TABLE "Project"
  ADD COLUMN "agentRepositoryUrl" TEXT,
  ADD COLUMN "membersMayAddSeats" BOOLEAN NOT NULL DEFAULT false;

-- A seat's own repository pick, where its project has several: a Repository or GitConnection id, so no foreign key.
-- Room is the percent of allowance left (0 to 100) on the program the seat would run next, with when it arrived.
ALTER TABLE "AgentSeat"
  ADD COLUMN "repositoryId" TEXT,
  ADD COLUMN "room" INTEGER,
  ADD COLUMN "roomProgram" TEXT,
  ADD COLUMN "roomAt" TIMESTAMP(3);

-- What the runner last said of itself: working, paused or disk_full. NULL from a runner that reports none.
ALTER TABLE "AgentRunner" ADD COLUMN "state" TEXT;

-- The program a run used. NULL for a run worked by hand or by a runner that reports none.
ALTER TABLE "AgentRun" ADD COLUMN "program" TEXT;

COMMIT;
