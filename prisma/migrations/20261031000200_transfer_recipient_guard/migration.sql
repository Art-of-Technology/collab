BEGIN;
LOCK TABLE "AgentRegistration", "AgentHandoff", "AgentTransferOffer" IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "AgentHandoff" h
    LEFT JOIN "AgentRegistration" a ON a.id = h."claimedById"
    LEFT JOIN "AgentTransferOffer" o ON h."sourceKey" = 'transfer-offer:' || o.id AND o."workspaceId" = h."workspaceId"
    WHERE h."sourceKey" LIKE 'transfer-offer:%' AND h."status" = 'claimed'
      AND (a.id IS NULL OR a."managedWorker" IS NOT NULL OR o.status IS DISTINCT FROM 'accepted'
        OR o."recipientId" IS DISTINCT FROM h."claimedById" OR o."acceptedHandoffId" IS DISTINCT FROM h.id)
  ) THEN
    RAISE EXCEPTION 'Resolve unauthorized claims on transfer successors before migration';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "guard_transfer_managed_claim"() RETURNS trigger AS $$
DECLARE worker jsonb;
BEGIN
  IF NEW."sourceKey" LIKE 'transfer-offer:%' AND NEW."status" = 'claimed' AND NEW."claimedById" IS NOT NULL THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Transfer claims require read committed isolation' USING ERRCODE = 'P0001';
    END IF;
    SELECT "managedWorker" INTO worker FROM public."AgentRegistration" WHERE id = NEW."claimedById" FOR SHARE;
    IF NOT FOUND OR worker IS NOT NULL THEN
      RAISE EXCEPTION 'Managed workers cannot claim transfer successors' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."AgentTransferOffer" o
      WHERE NEW."sourceKey" = 'transfer-offer:' || o.id AND o."workspaceId" = NEW."workspaceId"
        AND o.status = 'accepted' AND o."recipientId" = NEW."claimedById"
        AND (o."acceptedHandoffId" = NEW.id OR (TG_OP = 'INSERT' AND o."acceptedHandoffId" IS NULL))) THEN
      RAISE EXCEPTION 'Only the original recipient can claim a transfer successor' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "guard_transfer_worker_conversion"() RETURNS trigger AS $$
BEGIN
  IF OLD."managedWorker" IS NULL AND NEW."managedWorker" IS NOT NULL
    AND current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Worker conversion requires read committed isolation' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."managedWorker" IS NOT NULL AND EXISTS (
    SELECT 1 FROM public."AgentHandoff" WHERE "claimedById" = NEW.id AND "status" = 'claimed' AND "sourceKey" LIKE 'transfer-offer:%'
  ) THEN
    RAISE EXCEPTION 'Release transfer successors before managed worker conversion' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMIT;
