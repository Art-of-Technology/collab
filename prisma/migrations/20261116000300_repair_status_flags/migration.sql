-- CLB-524: repair the status flags that projects made in the web app or by onboarding stored wrong.
-- Data only: no table, column or index changes, so the application role needs no new grant at rollout. Running it twice changes nothing.
BEGIN;

-- A status named done or completed is final, in a project that has no final status at all.
-- A project that has one made a choice (a later "released", say) and is left alone.
-- This runs first: a status without a group reads as done only when it is final, and the next statement goes by the group.
UPDATE "ProjectStatus" s SET "isFinal" = true
WHERE lower(s."name") IN ('done', 'completed') AND NOT s."isFinal"
  AND NOT EXISTS (SELECT 1 FROM "ProjectStatus" f WHERE f."projectId" = s."projectId" AND f."isFinal");

-- A project keeps one of its default statuses: the first by order of the to do group, or the first of all when none is in that group.
-- An active status goes before an inactive one. A project with one default, or none, is not touched.
UPDATE "ProjectStatus" s SET "isDefault" = false
WHERE s."isDefault" AND s.id <> (
  SELECT k.id FROM "ProjectStatus" k
  WHERE k."projectId" = s."projectId" AND k."isDefault"
  ORDER BY k."isActive" DESC, (COALESCE(k."category", CASE WHEN k."isFinal" THEN 'done' ELSE 'todo' END) = 'todo') DESC, k."order", k.id
  LIMIT 1);

COMMIT;
