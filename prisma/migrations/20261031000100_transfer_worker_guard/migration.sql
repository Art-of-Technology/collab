BEGIN;
LOCK TABLE "AgentRegistration", "AgentHandoff" IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "AgentHandoff" h JOIN "AgentRegistration" a ON a.id = h."claimedById"
    WHERE h."sourceKey" LIKE 'transfer-offer:%' AND h."status" = 'claimed' AND a."managedWorker" IS NOT NULL) THEN
    RAISE EXCEPTION 'Resolve managed claims on transfer successors before migration';
  END IF;
END $$;

CREATE FUNCTION "guard_transfer_managed_claim"() RETURNS trigger AS $$
DECLARE worker jsonb;
BEGIN
  IF NEW."sourceKey" LIKE 'transfer-offer:%' AND NEW."status" = 'claimed' AND NEW."claimedById" IS NOT NULL THEN
    SELECT "managedWorker" INTO worker FROM public."AgentRegistration" WHERE id = NEW."claimedById" FOR SHARE;
    IF worker IS NOT NULL THEN
      RAISE EXCEPTION 'Managed workers cannot claim transfer successors' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "guard_transfer_managed_claim" BEFORE INSERT OR UPDATE OF "status", "claimedById", "sourceKey" ON "AgentHandoff"
  FOR EACH ROW EXECUTE FUNCTION "guard_transfer_managed_claim"();

CREATE FUNCTION "guard_transfer_worker_conversion"() RETURNS trigger AS $$
BEGIN
  IF NEW."managedWorker" IS NOT NULL AND EXISTS (
    SELECT 1 FROM public."AgentHandoff" WHERE "claimedById" = NEW.id AND "status" = 'claimed' AND "sourceKey" LIKE 'transfer-offer:%'
  ) THEN
    RAISE EXCEPTION 'Release transfer successors before managed worker conversion' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "guard_transfer_worker_conversion" BEFORE UPDATE OF "managedWorker" ON "AgentRegistration"
  FOR EACH ROW EXECUTE FUNCTION "guard_transfer_worker_conversion"();
COMMIT;
