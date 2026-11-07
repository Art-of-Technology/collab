BEGIN;

-- A separate table is invisible to older name-routed handoff inboxes.
CREATE TABLE "AgentReviewRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "originalHandoffId" TEXT NOT NULL,
  "ownerAgentId" TEXT,
  "reviewerAgentId" TEXT,
  "requestId" TEXT NOT NULL,
  "repository" TEXT NOT NULL,
  "pullRequestNumber" INTEGER NOT NULL,
  "revision" TEXT NOT NULL,
  "requestContent" TEXT NOT NULL,
  "responseContent" TEXT,
  "responseOutcome" TEXT,
  "reviewedRevision" TEXT,
  "holdReason" TEXT,
  "holdVersion" INTEGER NOT NULL DEFAULT 0,
  "cancelReason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentReviewRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentReviewRequest_status_check" CHECK ("status" IN ('pending', 'claimed', 'replied', 'resolved', 'cancelled')),
  CONSTRAINT "AgentReviewRequest_pr_check" CHECK ("pullRequestNumber" > 0),
  CONSTRAINT "AgentReviewRequest_hold_version_check" CHECK ("holdVersion" >= 0),
  CONSTRAINT "AgentReviewRequest_repository_check" CHECK ("repository" ~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'),
  CONSTRAINT "AgentReviewRequest_revision_check" CHECK ("revision" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
  CONSTRAINT "AgentReviewRequest_content_check" CHECK (length(btrim("requestContent")) BETWEEN 1 AND 16000 AND ("responseContent" IS NULL OR length("responseContent") <= 16000) AND ("holdReason" IS NULL OR length(btrim("holdReason")) BETWEEN 1 AND 2000) AND ("cancelReason" IS NULL OR length("cancelReason") <= 2000)),
  CONSTRAINT "AgentReviewRequest_response_check" CHECK (
    ("responseOutcome" IS NULL AND "responseContent" IS NULL AND "reviewedRevision" IS NULL AND "status" IN ('pending', 'claimed', 'cancelled')) OR
    ("responseOutcome" IS NOT NULL AND "responseContent" IS NOT NULL AND "reviewedRevision" IS NOT NULL AND
     "responseOutcome" IN ('approved', 'changes_requested', 'blocked') AND length(btrim("responseContent")) > 0 AND "reviewedRevision" = "revision" AND "status" IN ('replied', 'resolved', 'cancelled'))
  ),
  CONSTRAINT "AgentReviewRequest_resolution_check" CHECK ("status" <> 'resolved' OR ("responseOutcome" = 'approved' AND "holdReason" IS NULL)),
  CONSTRAINT "AgentReviewRequest_cancellation_check" CHECK (("status" = 'cancelled') = ("cancelReason" IS NOT NULL AND length(btrim("cancelReason")) > 0)),
  CONSTRAINT "AgentReviewRequest_distinct_agents_check" CHECK ("ownerAgentId" IS NULL OR "reviewerAgentId" IS NULL OR "ownerAgentId" <> "reviewerAgentId")
);

CREATE UNIQUE INDEX "AgentReviewRequest_workspaceId_ownerAgentId_requestId_key" ON "AgentReviewRequest"("workspaceId", "ownerAgentId", "requestId");
CREATE UNIQUE INDEX "AgentReviewRequest_one_active_per_handoff" ON "AgentReviewRequest"("originalHandoffId") WHERE "status" IN ('pending', 'claimed', 'replied');
CREATE INDEX "AgentReviewRequest_reviewerAgentId_status_createdAt_id_idx" ON "AgentReviewRequest"("reviewerAgentId", "status", "createdAt", "id");
CREATE INDEX "AgentReviewRequest_originalHandoffId_status_idx" ON "AgentReviewRequest"("originalHandoffId", "status");

ALTER TABLE "AgentReviewRequest" ADD CONSTRAINT "AgentReviewRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentReviewRequest" ADD CONSTRAINT "AgentReviewRequest_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentReviewRequest" ADD CONSTRAINT "AgentReviewRequest_originalHandoffId_fkey" FOREIGN KEY ("originalHandoffId") REFERENCES "AgentHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentReviewRequest" ADD CONSTRAINT "AgentReviewRequest_ownerAgentId_fkey" FOREIGN KEY ("ownerAgentId") REFERENCES "AgentRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentReviewRequest" ADD CONSTRAINT "AgentReviewRequest_reviewerAgentId_fkey" FOREIGN KEY ("reviewerAgentId") REFERENCES "AgentRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Review creation and transfer creation serialize on the exact parent claim.
CREATE FUNCTION "guard_review_request"() RETURNS trigger AS $$
DECLARE parent public."AgentHandoff"%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Review creation requires read committed isolation' USING ERRCODE = 'P0001';
    END IF;
    IF NEW."status" <> 'pending' OR NEW."ownerAgentId" IS NULL OR NEW."reviewerAgentId" IS NULL OR NEW."holdReason" IS NOT NULL OR NEW."holdVersion" <> 0 THEN
      RAISE EXCEPTION 'A new review requires an owner and reviewer' USING ERRCODE = 'P0001';
    END IF;
    -- Lock cascade parents before registrations and the claim to avoid deletion deadlocks.
    PERFORM id FROM public."Workspace" WHERE id = NEW."workspaceId" FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review workspace is unavailable' USING ERRCODE = 'P0001'; END IF;
    PERFORM id FROM public."Issue" WHERE id = NEW."issueId" AND "workspaceId" = NEW."workspaceId" FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review issue is unavailable' USING ERRCODE = 'P0001'; END IF;
    PERFORM id FROM public."AgentRegistration"
      WHERE "workspaceId" = NEW."workspaceId" AND id IN (NEW."ownerAgentId", NEW."reviewerAgentId") ORDER BY id FOR KEY SHARE;
    IF NOT EXISTS (SELECT 1 FROM public."AgentRegistration" WHERE id = NEW."ownerAgentId" AND "workspaceId" = NEW."workspaceId")
       OR NOT EXISTS (SELECT 1 FROM public."AgentRegistration" WHERE id = NEW."reviewerAgentId" AND "workspaceId" = NEW."workspaceId") THEN
      RAISE EXCEPTION 'Review agents must belong to the workspace' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO parent FROM public."AgentHandoff" WHERE id = NEW."originalHandoffId" FOR UPDATE;
    IF NOT FOUND OR parent."workspaceId" <> NEW."workspaceId" OR parent."issueId" <> NEW."issueId"
       OR parent."status" <> 'claimed' OR parent."claimedById" IS DISTINCT FROM NEW."ownerAgentId" THEN
      RAISE EXCEPTION 'The original claim does not match the review' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public."AgentTransferOffer" WHERE "parentId" = parent.id AND "status" = 'pending') THEN
      RAISE EXCEPTION 'A transfer offer is already pending' USING ERRCODE = 'P0001';
    END IF;
    -- Force an MVCC version change so older repeatable-read writers fail closed.
    UPDATE public."AgentHandoff" SET "updatedAt" = "updatedAt" WHERE id = parent.id;
    RETURN NEW;
  END IF;

  IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" OR NEW."issueId" IS DISTINCT FROM OLD."issueId"
     OR NEW."originalHandoffId" IS DISTINCT FROM OLD."originalHandoffId" OR NEW."requestId" IS DISTINCT FROM OLD."requestId"
     OR NEW."repository" IS DISTINCT FROM OLD."repository" OR NEW."pullRequestNumber" IS DISTINCT FROM OLD."pullRequestNumber"
     OR NEW."revision" IS DISTINCT FROM OLD."revision" OR NEW."requestContent" IS DISTINCT FROM OLD."requestContent"
     OR (NEW."ownerAgentId" IS DISTINCT FROM OLD."ownerAgentId" AND NOT (NEW."ownerAgentId" IS NULL AND pg_trigger_depth() > 1))
     OR (NEW."reviewerAgentId" IS DISTINCT FROM OLD."reviewerAgentId" AND NOT (NEW."reviewerAgentId" IS NULL AND pg_trigger_depth() > 1)) THEN
    RAISE EXCEPTION 'Review request identity and candidate are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'pending' AND NEW."status" IN ('claimed', 'cancelled')) OR
    (OLD."status" = 'claimed' AND NEW."status" IN ('replied', 'cancelled')) OR
    (OLD."status" = 'replied' AND NEW."status" IN ('resolved', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid review state transition' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."holdReason" IS DISTINCT FROM OLD."holdReason" THEN
    IF OLD."holdVersion" = 2147483647 OR NEW."holdVersion" <> OLD."holdVersion" + 1 THEN
      RAISE EXCEPTION 'Review hold change requires the next version' USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW."holdVersion" IS DISTINCT FROM OLD."holdVersion" THEN
    RAISE EXCEPTION 'Review hold version can change only with the hold' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW."responseContent" IS DISTINCT FROM OLD."responseContent" OR NEW."responseOutcome" IS DISTINCT FROM OLD."responseOutcome"
      OR NEW."reviewedRevision" IS DISTINCT FROM OLD."reviewedRevision")
    AND NOT (OLD."status" = 'claimed' AND NEW."status" = 'replied' AND OLD."responseContent" IS NULL
      AND OLD."responseOutcome" IS NULL AND OLD."reviewedRevision" IS NULL) THEN
    RAISE EXCEPTION 'Recorded review responses are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."status" = 'resolved' AND OLD."holdReason" IS NOT NULL THEN
    RAISE EXCEPTION 'Clear the explicit hold before resolving' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."status" = 'cancelled' AND OLD."status" IS DISTINCT FROM NEW."status" AND OLD."holdReason" IS NOT NULL
    AND NOT (NEW."cancelReason" = 'owner_deleted' AND pg_trigger_depth() > 1) THEN
    RAISE EXCEPTION 'Clear the explicit hold before cancelling' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."status" IN ('claimed', 'replied', 'resolved') AND OLD."status" IS DISTINCT FROM NEW."status"
    AND (NEW."ownerAgentId" IS NULL OR NEW."reviewerAgentId" IS NULL) THEN
    RAISE EXCEPTION 'Review identities are no longer available' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."status" IN ('resolved', 'cancelled') AND
    (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."holdReason" IS DISTINCT FROM OLD."holdReason" OR NEW."cancelReason" IS DISTINCT FROM OLD."cancelReason") THEN
    RAISE EXCEPTION 'A closed review is immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "guard_review_request" BEFORE INSERT OR UPDATE ON "AgentReviewRequest"
  FOR EACH ROW EXECUTE FUNCTION "guard_review_request"();

CREATE FUNCTION "guard_pending_review_claim"() RETURNS trigger AS $$
BEGIN
  IF (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."claimedById" IS DISTINCT FROM OLD."claimedById")
    AND EXISTS (SELECT 1 FROM public."AgentReviewRequest" WHERE "originalHandoffId" = OLD.id AND "status" IN ('pending', 'claimed', 'replied')) THEN
    RAISE EXCEPTION 'Resolve or cancel the pending review before changing its claim' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "guard_pending_review_claim" BEFORE UPDATE OF "status", "claimedById" ON "AgentHandoff"
  FOR EACH ROW EXECUTE FUNCTION "guard_pending_review_claim"();

CREATE FUNCTION "guard_review_against_transfer"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'pending' THEN
    PERFORM 1 FROM public."AgentHandoff" WHERE id = NEW."parentId" FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public."AgentReviewRequest" WHERE "originalHandoffId" = NEW."parentId" AND "status" IN ('pending', 'claimed', 'replied')) THEN
      RAISE EXCEPTION 'Resolve or cancel the review before transferring the claim' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "guard_review_against_transfer" BEFORE INSERT OR UPDATE OF "status", "parentId" ON "AgentTransferOffer"
  FOR EACH ROW EXECUTE FUNCTION "guard_review_against_transfer"();

-- Account deletion cancels owned reviews before claimant foreign keys are nulled.
CREATE FUNCTION "cancel_reviews_on_owner_delete"() RETURNS trigger AS $$
DECLARE review RECORD;
BEGIN
  FOR review IN SELECT id, "originalHandoffId" FROM public."AgentReviewRequest"
    WHERE "ownerAgentId" = OLD.id AND "status" IN ('pending', 'claimed', 'replied') ORDER BY "originalHandoffId", id
  LOOP
    PERFORM 1 FROM public."AgentHandoff" WHERE id = review."originalHandoffId" FOR UPDATE;
    UPDATE public."AgentReviewRequest" SET "status" = 'cancelled', "cancelReason" = 'owner_deleted', "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = review.id AND "ownerAgentId" = OLD.id AND "status" IN ('pending', 'claimed', 'replied');
  END LOOP;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "cancel_reviews_on_owner_delete" BEFORE DELETE ON "AgentRegistration"
  FOR EACH ROW EXECUTE FUNCTION "cancel_reviews_on_owner_delete"();

COMMIT;
