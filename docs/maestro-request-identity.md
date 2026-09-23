# Gateway request identity

`COLLAB_AUTH_MODE=gateway` selects the qualified gateway assertion contract.
`nextauth` retains existing authentication; an unset mode preserves that legacy
default. Any other value fails closed. Gateway mode never falls back to cookies,
bearer tokens, email lookup, forwarded-user aliases or server environment user
identity. This is application preparation, not an enabled production gateway.

Required deployment configuration:

- `COLLAB_GATEWAY_ISSUER`: exact separately verified discovery issuer.
- `COLLAB_PUBLIC_ORIGIN`: exact HTTPS public origin, without a trailing slash.
- Explicit account mapping and the private deployment boundary described below.

The gateway strips incoming identity headers and replaces them with verified
claims on every authenticated request. Issuer, subject and email are canonical
unpadded base64url UTF-8; `X-Collab-Email-Verified` must be literal `true` after
the gateway's strict signed boolean check. The adapter rejects missing,
combined duplicate, malformed and oversized values, pins issuer, and requires
the exact company email domain. Header validation does not authenticate an
arbitrary network peer: deployment confinement is mandatory.

## Account and request boundary

Use the existing Account unique key with provider `maestro` and provider account
ID equal to SHA-256 of `issuer + NUL + subject`. An operator must explicitly
bind that key to an existing user after identity verification. There is no
automatic account creation, email linking, tenant enrollment or schema change.
Missing mappings, multiple Maestro mappings on a user, or a changed email that
does not match the mapped record fail closed for deliberate reconciliation.

The proxy requires mapped identity before app requests. The shared request
session adapter replaces direct NextAuth session imports across server pages,
actions and API routes, including the board and Notes. Current-user lookups use
the mapped user ID. The session endpoint serves the same identity to the
existing client SessionProvider; gateway callbacks and cookie mutations through
NextAuth are disabled. Session responses are not cached. The browser refreshes
its session every 60 seconds and on window focus; protected server requests
recheck mapping and application permissions immediately. This polling interval
is not a claim about IdP revocation propagation or native gateway session TTL.

All unsafe HTTP methods require Origin exactly equal to the configured public
origin, including server actions and custom API handlers. Missing/null/foreign
origins and same-site sibling origins fail before handlers. CORS or SameSite
alone is not used as CSRF protection. Health GET remains available for service
readiness; unrelated realtime mutation paths are not exempted from the proxy.

## Deployment trust and logout

The separately qualified topology confines access before requests enter Next:
only gateway and app share the private backend bridge, app and DB use a separate
private bridge, and app-only egress is separate. App/DB have no published ports;
app binds only the selected backend address, never a wildcard. No shared ingress
attachment, privileged network capability, Docker socket or namespace forwarding
is allowed. The gateway alone receives public ingress. No peer identity is
inferred from forwarded IP/Host/Origin headers. Host administrators and gateway
compromise remain trusted boundaries. Actual Next listener and deployed network
acceptance must pass before enabling this unsigned-header contract.

Gateway sign-out uses top-level navigation to the fixed same-origin native
`/oauth2/callback?logout=get` endpoint, excluded from application proxying by the
gateway. The qualified stock module clears its local cache/cookie and returns
its own Logged Out page without automatically navigating back to protected
content. Gateway configuration must retain the qualified server-cache session
and explicitly disabled revocation endpoint. This does not log out other apps,
terminate the IdP session or revoke provider tokens. GET local logout can be
triggered as nuisance forced logout by cross-site navigation; it is not claimed
to be CSRF protected. Legacy mode continues using NextAuth sign-out.

## Evidence and remaining acceptance

`node --test tests/security/gateway-identity.test.cjs` exercises five executable
checks: header validation, origin enforcement, explicit mapping/no legacy
fallback, browser session endpoint behavior, and mode-aware logout navigation.

A disposable PostgreSQL + HTTPS synthetic gateway fixture verified real Next
HTTP and browser behavior: mapped session, workspace server action, Notes UI,
approval/write/readback without NextAuth cookies; missing/duplicate claims 401;
unmapped identity 403; missing/foreign Origin 403; revoked tenant renders Next's
not-found boundary with no Notes data and zero Forge calls. Streaming can make
that not-found response HTTP 200, so UI denial and upstream-call evidence are
recorded separately. The development proxy needed WebSocket forwarding for HMR;
the initial missing-forwarding fixture stalled hydration and was corrected.

The board also loaded its fixture issue through the gateway. After membership
revocation, its real Refresh action removed all cards, showed access denial and
made zero Forge requests. Five identity checks and all 55 security/Forge checks
pass; targeted lint and nonincremental TypeScript pass before final packaging.

This synthetic proxy does not perform OIDC. Native signed-token, stripping,
session and local logout fixtures are separate Network Doctor evidence. A full
native gateway-to-Next exchange, final callback/hostname, actual image/listener,
production isolation, identity mapping and rollout remain unverified here.
No live identity, credentials, DNS, gateway configuration or deployment changed.
