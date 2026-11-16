-- App tokens: the SHA-256 of the plain access token, so a bearer token is found by one indexed read instead of decrypting every stored token.
-- NULL means the row is older than the column, or was written by a version that does not know it. The app stores the hash the first time it decrypts the row.
-- The column is on an existing table, so the application role needs no new grant at rollout.
BEGIN;
ALTER TABLE "AppToken" ADD COLUMN "tokenHash" TEXT;
CREATE UNIQUE INDEX "AppToken_tokenHash_key" ON "AppToken"("tokenHash");

-- A version that does not know the column replaces a token and leaves the hash of the old one behind.
-- That hash goes with the old token, so the row counts as one without a hash and the app finds it again.
CREATE FUNCTION "clear_replaced_token_hash"() RETURNS trigger AS $$
BEGIN
  IF NEW."accessToken" IS DISTINCT FROM OLD."accessToken" AND NEW."tokenHash" IS NOT DISTINCT FROM OLD."tokenHash" THEN
    NEW."tokenHash" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "clear_replaced_token_hash" BEFORE UPDATE OF "accessToken" ON "AppToken"
  FOR EACH ROW EXECUTE FUNCTION "clear_replaced_token_hash"();
COMMIT;
