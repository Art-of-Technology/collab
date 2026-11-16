-- App tokens: the SHA-256 of the plain access token, so a bearer token is found by one indexed read instead of decrypting every stored token.
-- NULL means the row is older than the column, or was written by a version that does not know it. The app stores the hash the first time it decrypts the row.
-- The column is on an existing table, so the application role needs no new grant at rollout.
ALTER TABLE "AppToken" ADD COLUMN "tokenHash" TEXT;
CREATE UNIQUE INDEX "AppToken_tokenHash_key" ON "AppToken"("tokenHash");
