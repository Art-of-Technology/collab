# Native Maestro linking on the existing Collab account

This source-only integration reconciles reviewed native candidate `60299f33` and
local preview `f5489416` onto actual main
`3c9403b51e971f2e800631a9050be82d73fa9ef8`, after PR547 merged on GitHub.
Main's lock, schema, migrations, Forge write guards, gateway handlers, SVG fix
and selected-project dashboard remain intact. All executable and test bytes
match the preview; only this source-history paragraph changes. The native-only
`60b46085` and preview `f5489416` checkpoints remain preserved.
No deployment, provider registration, account mutation or migration is performed.
Main's Version access column/triggers remain required even with the worker off;
this source integration does not execute their migrations or prove native behavior.

Google stays available. A signed-in user opens **Profile → Connect Maestro**,
explicitly starts linking, completes a new Google OAuth round trip for the same
already-linked Google subject, then chooses **Connect Maestro**. The five-minute
encrypted, HttpOnly/Secure/SameSite cookie binds the original local user, Google
subject and each actual OAuth state. Session JWT issuance time is never Google
proof. Google account selection/SSO proves the provider account; it does not
claim the user re-entered a Google password. Expiry covers the entire flow.

Maestro is available only in `COLLAB_AUTH_MODE=nextauth` (the default), with `MAESTRO_ENABLED=true`,
`NEXTAUTH_URL=https://collab.weez.boo`, `MAESTRO_CLIENT_ID` and `NEXTAUTH_SECRET`
configured. Gateway and invalid modes reject native linking before session/account work. The client must separately admit exactly
`https://collab.weez.boo/api/auth/callback/maestro`. No Maestro client secret is
used: the approved client is public S256 with `token_endpoint_auth_method=none`.
Existing Google configuration and the existing NextAuth secret must be preserved.

The provider uses fixed metadata at `https://auth.maestro-connect.com` and the
existing NextAuth/OpenID-client validation path: RS256, issuer, audience, expiry,
state, PKCE and nonce, plus boolean `email_verified=true`. Discovery is not used,
so unchecked discovery metadata cannot replace the issuer or endpoints. Provider
`maestro` must never be repointed to another issuer. The account key is the raw
verified `sub`; no gateway hash or email-based linking is used. Existing Maestro
mapping conventions must be checked by the account owner before enabling; no
stored account is silently reinterpreted.

Unmapped ordinary Maestro login cannot create a user or link an account. The
request-local authorization permit is also required by the adapter. Linking
explicitly uses `ReadCommitted`, locks the existing `User` row, rechecks expiry and the Google account, then
checks both subject ownership and other Maestro subjects for the same user.
An identical mapping is idempotent; conflicting mappings refuse. Only the
Account identity fields are written, without access/refresh/ID tokens. Google,
local user ID, roles, memberships, projects and issues are retained. Maestro failure logs
emit fixed identifiers rather than OAuth payloads; existing Google image-event
logging is unchanged.

The shared session accessors now use the same auth configuration and stable
local user ID, refresh selected identity/profile fields and role from that row,
and reject missing users. External Maestro roles do not set local roles.
Redirects require parsed same-origin URLs and reject protocol-relative values,
lookalike hosts, backslashes and auth endpoint loops.

The two existing `/api/issues` list/create guards now require active membership
(or workspace ownership). Create accepts only the authenticated reporter; the
new-issue modal displays **Reporter: you**, including related issue creation.
Existing detail editing, relation selectors, project privacy and post-check
revocation remain separate policy surfaces; this is not a whole-app tenant audit.

## Local checks and limits

Run `node --test tests/native-maestro-link.test.cjs` with installed main
dependencies (NextAuth 4.24.15, Prisma 6.19.3, Next 16.3.6). The fixture executes the actual installed NextAuth callback route
and persistence handler with modeled Prisma/provider transport. Separately it
uses actual RSA-signed tokens and the installed OpenID client, with a fixture
JWKS transport, and executes state/PKCE/nonce cookie handling. Issue handlers,
stable-ID lookup, link initiation, Google preservation and refusal cases execute
actual source with modeled collaborators. No network provider or live DB is used.

For the issue regression only, set `MAESTRO_TEST_BASELINE_ISSUES=1` and use
`--test-name-pattern='existing issue list/create'`; this loads the exact main-base
Git blob into the same fixture. Three failing negatives and six passing controls
are expected; the enclosing failed parent is not a fourth regression.

Native PostgreSQL locking, concurrent transactions, catalog/schema compatibility,
real browser cookies, Google/Maestro flows, callback registration and deployment
remain separate acceptance gates. Copied/replayed callback cookies are not a
claim of globally atomic single use; row locking and the uniqueness constraint
bound conflicting account mappings. A failed response after a committed link is
not automatically retried. The existing Account schema needs no proposed DDL,
but actual catalog compatibility must be checked before relying on it.

The focused main-version run also retains the actual-core fixed-message DB-error
regression, rejects Forge-connected issue creation and explicitly denies native
auth/linking in gateway and invalid modes. Gateway hashed account keys remain
unchanged; native raw subjects are never translated or migrated into that scheme.
