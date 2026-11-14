-- Agent handoffs: keep the fact that a handoff was claimed on the handoff itself, so it outlives the user who claimed it.
-- NULL means unknown: the row is older than the column, or was written by a version that does not know it.
-- The column is on an existing table, so the application role needs no new grant at rollout.
ALTER TABLE "AgentHandoff" ADD COLUMN "claimedOnce" BOOLEAN;
