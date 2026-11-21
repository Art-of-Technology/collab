BEGIN;

ALTER TABLE "Issue"
  ADD COLUMN "milestoneId" TEXT,
  ADD COLUMN "baselineStartDate" TIMESTAMP(3),
  ADD COLUMN "baselineDueDate" TIMESTAMP(3),
  ADD COLUMN "finishedAt" TIMESTAMP(3),
  ADD CONSTRAINT "Issue_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Issue_milestoneId_idx" ON "Issue"("milestoneId");

CREATE TABLE "ProjectBaseline" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "setById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dates" JSONB NOT NULL,
  CONSTRAINT "ProjectBaseline_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProjectBaseline_projectId_createdAt_idx" ON "ProjectBaseline"("projectId", "createdAt");

-- A completion starts on entry to a final status and survives moves between final
-- statuses. Trace back from the current status through a continuous chain of
-- events. Missing IDs, ambiguous labels, ties and gaps cannot prove an entry.
WITH RECURSIVE events AS (
  SELECT i."id", a."createdAt",
    COALESCE(a."oldStatusId", old_label.id) AS old_id,
    COALESCE(a."newStatusId", new_label.id) AS new_id,
    row_number() OVER (PARTITION BY i.id ORDER BY a."createdAt" DESC, a.id) AS step,
    count(*) OVER (PARTITION BY i.id, a."createdAt") AS tied
  FROM "Issue" i
  JOIN "ProjectStatus" current_status ON current_status.id = i."statusId"
    AND current_status."projectId" = i."projectId" AND current_status."isFinal"
  JOIN "BoardItemActivity" a ON a."itemId" = i.id AND a."itemType" = 'ISSUE'
    AND a."workspaceId" = i."workspaceId" AND a."createdAt" >= i."createdAt"
  LEFT JOIN LATERAL (
    SELECT min(s.id) AS id FROM "ProjectStatus" s
    WHERE a.action = 'UPDATED' AND s."projectId" = i."projectId"
      AND a."oldValue" IN (s.name, s."displayName")
    HAVING count(*) = 1
  ) old_label ON true
  LEFT JOIN LATERAL (
    SELECT min(s.id) AS id FROM "ProjectStatus" s
    WHERE a.action = 'UPDATED' AND s."projectId" = i."projectId"
      AND a."newValue" IN (s.name, s."displayName")
    HAVING count(*) = 1
  ) new_label ON true
  WHERE a.action = 'STATUS_CHANGED' OR (a.action = 'UPDATED' AND a."fieldName" = 'status')
), chain AS (
  SELECT e.* FROM events e JOIN "Issue" i ON i.id = e.id AND i."statusId" = e.new_id
  WHERE e.step = 1 AND e.tied = 1
  UNION ALL
  SELECT e.* FROM chain c JOIN "Issue" i ON i.id = c.id
  JOIN "ProjectStatus" s ON s.id = c.old_id AND s."projectId" = i."projectId" AND s."isFinal"
  JOIN events e ON e.id = c.id AND e.step = c.step + 1 AND e.new_id = c.old_id AND e.tied = 1
)
UPDATE "Issue" i SET "finishedAt" = c."createdAt"
FROM chain c JOIN "ProjectStatus" s ON s.id = c.old_id AND NOT s."isFinal"
WHERE i.id = c.id AND s."projectId" = i."projectId";

CREATE FUNCTION "track_issue_finish"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."statusId" IS NOT DISTINCT FROM OLD."statusId" THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ProjectStatus" WHERE id = NEW."statusId" AND "isFinal") THEN
    NEW."finishedAt" := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW."finishedAt" := NEW."createdAt";
  ELSIF NOT EXISTS (SELECT 1 FROM "ProjectStatus" WHERE id = OLD."statusId" AND "isFinal") THEN
    NEW."finishedAt" := statement_timestamp() AT TIME ZONE 'UTC';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "track_issue_finish"
BEFORE INSERT OR UPDATE OF "statusId" ON "Issue"
FOR EACH ROW EXECUTE FUNCTION "track_issue_finish"();

COMMIT;
