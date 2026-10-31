BEGIN;
LOCK TABLE "AgentHandoff", "AgentTransferOffer" IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "AgentTransferOffer" o LEFT JOIN "AgentHandoff" h ON h.id = o."parentId"
    WHERE o.status = 'pending' AND (h.id IS NULL OR h.status <> 'claimed' OR h."claimedById" IS DISTINCT FROM o."senderId"
      OR o."senderId" IS NULL OR h."workspaceId" <> o."workspaceId" OR h."issueId" <> o."issueId"))
    OR EXISTS (SELECT 1 FROM "AgentTransferOffer" WHERE status = 'pending' GROUP BY "parentId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve inconsistent pending transfer offers before migration';
  END IF;
END $$;
UPDATE "AgentHandoff" h SET "updatedAt" = h."updatedAt"
  WHERE EXISTS (SELECT 1 FROM "AgentTransferOffer" o WHERE o."parentId" = h.id AND o.status = 'pending');
CREATE UNIQUE INDEX "AgentTransferOffer_one_pending_parent" ON "AgentTransferOffer" ("parentId") WHERE status = 'pending';

CREATE FUNCTION "serialize_pending_transfer_offer"() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD."parentId" IS DISTINCT FROM NEW."parentId" OR OLD."senderId" IS DISTINCT FROM NEW."senderId"
    OR OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId" OR OLD."issueId" IS DISTINCT FROM NEW."issueId") THEN
    UPDATE public."AgentHandoff" SET "updatedAt" = "updatedAt"
      WHERE id = NEW."parentId" AND "workspaceId" = NEW."workspaceId" AND "issueId" = NEW."issueId"
        AND status = 'claimed' AND "claimedById" = NEW."senderId";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pending transfer requires the original claim' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "serialize_pending_transfer_offer" BEFORE INSERT OR UPDATE OF status, "parentId", "senderId", "workspaceId", "issueId" ON "AgentTransferOffer"
  FOR EACH ROW EXECUTE FUNCTION "serialize_pending_transfer_offer"();
COMMIT;
