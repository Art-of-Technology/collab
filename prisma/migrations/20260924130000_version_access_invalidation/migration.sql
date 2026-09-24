ALTER TABLE "Version" ADD COLUMN "issueAccessInvalidated" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Version" ALTER COLUMN "issueAccessInvalidated" SET DEFAULT false;

CREATE FUNCTION "retain_version_access_invalidation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."issueAccessInvalidated" THEN
    NEW."issueAccessInvalidated" := true;
  END IF;
  IF NEW."parentVersionId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "Version" WHERE id = NEW."parentVersionId" AND "issueAccessInvalidated"
  ) THEN
    NEW."issueAccessInvalidated" := true;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "retain_version_access_invalidation"
BEFORE INSERT OR UPDATE ON "Version"
FOR EACH ROW EXECUTE FUNCTION "retain_version_access_invalidation"();

CREATE FUNCTION "invalidate_child_version_access"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."issueAccessInvalidated" AND NOT OLD."issueAccessInvalidated" THEN
    UPDATE "Version" SET "issueAccessInvalidated" = true
    WHERE "parentVersionId" = NEW.id AND NOT "issueAccessInvalidated";
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "invalidate_child_version_access"
AFTER UPDATE ON "Version"
FOR EACH ROW EXECUTE FUNCTION "invalidate_child_version_access"();

CREATE FUNCTION "invalidate_unlinked_version_access"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."issueId" = OLD."issueId" AND NEW."versionId" = OLD."versionId" THEN
    RETURN NEW;
  END IF;
  UPDATE "Version" SET "issueAccessInvalidated" = true WHERE id = OLD."versionId";
  IF TG_OP = 'UPDATE' THEN
    UPDATE "Version" SET "issueAccessInvalidated" = true WHERE id = NEW."versionId";
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "invalidate_unlinked_version_access"
BEFORE DELETE OR UPDATE OF "issueId", "versionId" ON "VersionIssue"
FOR EACH ROW EXECUTE FUNCTION "invalidate_unlinked_version_access"();

CREATE FUNCTION "invalidate_issue_version_access"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."workspaceId" IS NOT DISTINCT FROM OLD."workspaceId"
    AND NEW."projectId" IS NOT DISTINCT FROM OLD."projectId"
    AND NEW."statusId" IS NOT DISTINCT FROM OLD."statusId" THEN
    RETURN NEW;
  END IF;
  UPDATE "Version" SET "issueAccessInvalidated" = true
  WHERE id IN (SELECT "versionId" FROM "VersionIssue" WHERE "issueId" = OLD.id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "invalidate_issue_version_access"
BEFORE DELETE OR UPDATE OF "workspaceId", "projectId", "statusId" ON "Issue"
FOR EACH ROW EXECUTE FUNCTION "invalidate_issue_version_access"();

CREATE FUNCTION "invalidate_project_version_access"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."workspaceId" IS NOT DISTINCT FROM OLD."workspaceId" THEN RETURN NEW; END IF;
  UPDATE "Version" SET "issueAccessInvalidated" = true WHERE id IN (
    SELECT vi."versionId" FROM "VersionIssue" vi JOIN "Issue" i ON i.id = vi."issueId"
    LEFT JOIN "ProjectStatus" s ON s.id = i."statusId"
    WHERE i."projectId" = OLD.id OR s."projectId" = OLD.id
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "invalidate_project_version_access"
BEFORE DELETE OR UPDATE OF "workspaceId" ON "Project"
FOR EACH ROW EXECUTE FUNCTION "invalidate_project_version_access"();

CREATE FUNCTION "invalidate_status_version_access"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."projectId" IS NOT DISTINCT FROM OLD."projectId" THEN RETURN NEW; END IF;
  UPDATE "Version" SET "issueAccessInvalidated" = true WHERE id IN (
    SELECT vi."versionId" FROM "VersionIssue" vi JOIN "Issue" i ON i.id = vi."issueId"
    WHERE i."statusId" = OLD.id
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "invalidate_status_version_access"
BEFORE DELETE OR UPDATE OF "projectId" ON "ProjectStatus"
FOR EACH ROW EXECUTE FUNCTION "invalidate_status_version_access"();
