-- Seats rule 6 (CLB-519): a workspace rule gives every new project its seats, at most a fixed number a UTC day.
-- Three columns on an existing table, each with a constant default or none, so no row is rewritten and the
-- application role needs no new grant at rollout.
BEGIN;

ALTER TABLE "Workspace" ADD COLUMN "autoSeats" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoSeatsDay" DATE,
  ADD COLUMN "autoSeatsCount" INTEGER NOT NULL DEFAULT 0;

COMMIT;
