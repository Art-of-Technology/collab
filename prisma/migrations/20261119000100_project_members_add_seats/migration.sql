-- No grant: a column on an existing table is covered by the rights the application role already has on it.
ALTER TABLE "Project" ADD COLUMN "membersAddSeats" BOOLEAN NOT NULL DEFAULT false;
