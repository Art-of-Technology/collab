# Collab App Store

The Collab App Store enables third-party developers to ship apps that workspace administrators can install, authorize and manage directly inside Collab. This README captures the current implementation so engineers, reviewers and partner teams have a single reference for how the platform works.

## Platform Modules
- **App Registry** – Prisma models (`App`, `AppVersion`, `AppOAuthClient`, `AppScope`, `AppInstallation`, `AppWebhook`, `AppWebhookDelivery`) store manifests, versions, credentials, installs and webhook activity.
- **Developer Console (`/dev/apps`)** – internal UI to generate OAuth credentials, import manifests, review app metadata, publish/unpublish and manage webhooks & analytics per app.
- **Workspace Surface (`/(main)/[workspaceId]/apps/[slug]`)** – shows install CTA, consent dialog and routes users into the OAuth flow.
- **OAuth Service (`/api/oauth/*`)** – implements Authorization Code + PKCE, token issuance/refresh, token introspection and installation acknowledgements.
- **Webhook Pipeline** – optional per-installation webhooks with secret generation, retry logic and delivery analytics.

## Data Model Highlights
- `App`: canonical registration record with slug, publisher, manifest URL and lifecycle status (`DRAFT | PUBLISHED | SUSPENDED`).
- `AppVersion`: immutable snapshot of every imported manifest version.
- `AppScope`: normalized list of granted scopes used during consent.
- `AppOAuthClient`: hashes client secrets with bcrypt and stores redirect URIs.
- `AppInstallation`: tracks workspace installs, OAuth tokens (AES-256-GCM encrypted and base64-encoded) and granted scopes.
- `AppWebhook` / `AppWebhookDelivery`: manage webhook subscriptions and delivery attempts per installation.

## Developer Workflow
1. **Prepare `manifest.json`**
   - Follow the schema below, host it on HTTPS (HTTP allowed for localhost), and ensure the slug is unique and not reserved.
   - **Important:** Do NOT include `client_id` or `client_secret` in your manifest during submission. These will be automatically generated upon approval.
2. **Import manifest**
   - Submit the manifest URL via the form on `/dev/apps/new` (POST `/api/apps/import-manifest`). The API fetches the file, validates it with Zod, persists the manifest snapshot and initial scopes. App status will be set to `IN_REVIEW`.
3. **Review & iterate**
   - `/dev/apps/:id` displays the parsed manifest, current status, install analytics, webhook settings and workspace installs. Re-importing the same slug + new version updates metadata and app scopes.
4. **App Review & Approval**
   - Apps undergo review before publication. During this process, OAuth credentials are automatically generated based on your manifest's `client_type` and `token_endpoint_auth_method`:
     - **Public clients** (`client_type: "public"`): Only `client_id` is generated, PKCE is required
     - **Confidential clients with `client_secret_basic`**: Both `client_id` and `client_secret` are generated
     - **Confidential clients with `private_key_jwt`**: Only `client_id` is generated, JWKS is validated
5. **Publish**
   - Upon approval, toggle availability via the *Publish* control (PATCH `/api/apps/by-id/:id/publish`). This creates OAuth credentials and makes the app available for installation by workspace admins.

## App Manifest Reference
```json
{
  "schema": "https://developers.collab.com/schemas/app-manifest.v1.json",
  "name": "Hello Collab",
  "slug": "hello-collab",
  "version": "1.3.0",
  "description": "Sample integration that syncs issues from Collab.",
  "type": "embed",
  "entrypoint_url": "https://hello.example.com",
  "icon_url": "https://hello.example.com/icon.png",
  "publisher": {
    "name": "Hello Inc",
    "url": "https://hello.example.com",
    "support_email": "support@hello.example.com",
    "privacy_url": "https://hello.example.com/privacy",
    "terms_url": "https://hello.example.com/terms"
  },
  "oauth": {
    "client_type": "confidential",
    "token_endpoint_auth_method": "client_secret_basic",
    "redirect_uris": ["https://hello.example.com/oauth/callback"],
    "post_logout_redirect_uris": ["https://hello.example.com/logout"],
    "response_types": ["code"],
    "grant_types": ["authorization_code", "refresh_token"],
    "scopes": ["workspace:read", "issues:read"]
  },
  "webhooks": {
    "url": "https://hello.example.com/webhooks/collab",
    "events": ["issue.created", "app.installed"]
  },
  "scopes": ["workspace:read", "issues:read", "comments:write"],
  "permissions": {
    "org": true,
    "user": true
  },
  "category": "productivity",
  "visibility": "public",
  "versions": {
    "min_api": "2024-06",
    "tested_api": "2024-09"
  },
  "csp": {
    "connectSrc": ["https://api.collab.com"],
    "imgSrc": ["https://hello.example.com"],
    "frameAncestors": ["https://app.collab.com"]
  },
  "mfe": {
    "remoteName": "helloApp",
    "module": "./App",
    "integrity": "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  }
}
```

### Validation Rules
- `slug`: lowercase alphanumeric + hyphen, max 50 chars; reserved slugs include `admin`, `api`, `auth`, `dev`, `manifest`, etc. (`RESERVED_APP_SLUGS`).
- `type`: one of `embed`, `mfe_remote`, `server_only`.
- `entrypoint_url`: must resolve to HTTPS (localhost allowed for development) and passes `validateAppManifestSecurity` checks.
- `scopes`: deduplicated list of up to 10 values; allowed scopes come from `AppScopeSchema` (`workspace:read`, `issues:read`, `issues:write`, `comments:read`, `comments:write`, `user:read`, `leave:read`, `leave:write`).
- `oauth`: all redirect URIs validated as URLs; authentication method determines credential requirements.
- `webhooks.url`: must be HTTPS in production; private-network hosts are rejected.
- Legacy fields `homepage_url` and `permissions_legacy` are mapped for backward compatibility but new manifests should use the fields above.

### OAuth Authentication Methods

The platform supports three OAuth 2.0 client authentication methods:

#### 1. Public Clients (`client_type: "public"`)
- **Auth Method**: `token_endpoint_auth_method: "none"`
- **Credentials**: Only `client_id` is generated
- **Security**: PKCE (Proof Key for Code Exchange) is **required**
- **Use Case**: Single-page applications, mobile apps, or any client that cannot securely store secrets

```json
{
  "oauth": {
    "client_type": "public",
    "token_endpoint_auth_method": "none",
    "redirect_uris": ["https://myapp.example.com/callback"],
    "post_logout_redirect_uris": ["https://myapp.example.com/logout"],
    "response_types": ["code"],
    "grant_types": ["authorization_code", "refresh_token"]
  }
}
```

#### 2. Confidential Clients with Client Secret (`client_type: "confidential"`)
- **Auth Method**: `token_endpoint_auth_method: "client_secret_basic"`
- **Credentials**: Both `client_id` and `client_secret` are generated
- **Security**: Client secret is shown only once after approval and must be stored securely
- **Use Case**: Server-side applications that can securely store secrets

```json
{
  "oauth": {
    "client_type": "confidential", 
    "token_endpoint_auth_method": "client_secret_basic",
    "redirect_uris": ["https://myapp.example.com/callback"],
    "post_logout_redirect_uris": ["https://myapp.example.com/logout"],
    "response_types": ["code"],
    "grant_types": ["authorization_code", "refresh_token"]
  }
}
```

#### 3. Confidential Clients with JWT Assertion (`client_type: "confidential"`)
- **Auth Method**: `token_endpoint_auth_method: "private_key_jwt"`
- **Credentials**: Only `client_id` is generated
- **Security**: Client authenticates using JWT signed with their private key
- **Requirements**: Must provide `jwks_uri` pointing to public keys (JWKS)
- **Use Case**: High-security applications with existing PKI infrastructure

```json
{
  "oauth": {
    "client_type": "confidential",
    "token_endpoint_auth_method": "private_key_jwt", 
    "jwks_uri": "https://myapp.example.com/.well-known/jwks.json",
    "redirect_uris": ["https://myapp.example.com/callback"],
    "post_logout_redirect_uris": ["https://myapp.example.com/logout"],
    "response_types": ["code"],
    "grant_types": ["authorization_code", "refresh_token"]
  }
}
```

**OAuth Field Reference:**
- `post_logout_redirect_uris`: Optional array of URIs where users are redirected after logout
- `response_types`: Supported OAuth response types (defaults to `["code"]`)
- `grant_types`: Supported OAuth grant types (defaults to `["authorization_code", "refresh_token"]`)

**JWKS Requirements for `private_key_jwt`:**
- JWKS must be accessible via HTTPS
- Keys must include `kid` (Key ID) and appropriate `alg` (Algorithm)
- Supported algorithms: RS256, RS384, RS512, ES256, ES384, ES512, EdDSA
- RSA keys must be at least 2048 bits
- Supported curves: P-256, P-384, P-521 (EC), Ed25519, Ed448 (OKP)

### Micro-Frontend (MFE) Configuration

For `mfe_remote` app types, the `mfe` configuration object is required:

- `remoteName`: Unique name for the remote module (used in module federation)
- `module`: Entry point module path (e.g., `"./App"`, `"./Dashboard"`)
- `integrity`: Optional SRI (Subresource Integrity) hash for security verification

```json
{
  "type": "mfe_remote",
  "mfe": {
    "remoteName": "myAppRemote",
    "module": "./App",
    "integrity": "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  }
}
```

## Installation Flow
1. Workspace admins click **Install App** on the workspace app surface. The button opens `ConsentDialog`, rendering scopes, high-risk warnings and requiring acknowledgement when scopes are labelled “high”.
2. The dialog calls `installApp` (server action → POST `/api/apps/[slug]/installations`) which:
   - Verifies the user is an OWNER/ADMIN in the workspace.
   - Confirms the app is `PUBLISHED` and passes `validateAppManifestSecurity`.
   - Creates a `PENDING` installation with requested scopes and logs the attempt (`logAppInstallAttempt`).
3. The client fetches `/api/apps/:slug` to resolve OAuth metadata and redirects to `/api/oauth/authorize` with PKCE support (`code_challenge` optional, `S256` enforced when present).
4. Authorization endpoint checks membership, installation status and trims requested scopes to the approved set before issuing a one-time code (10 min expiry) stored in `AppOAuthAuthorizationCode`.
5. The app exchanges the code via `POST /api/oauth/token` (Authorization Code or Refresh Token grant). Access/refresh tokens are random opaque values, encrypted using AES-256-GCM (`encryptToken`) and persisted on the installation.
6. Once the partner app receives tokens it should call `POST /api/apps/installations/:id/ack` with the Bearer access token so we can log `logAppInstallSuccess` and mark the install as completed.
7. Introspection is available through `POST /api/oauth/introspect` for apps to validate long-lived tokens. Tokens expire hourly; refresh tokens are required for renewal and are validated by decrypting and comparing stored values.
8. Uninstallation happens via `POST /api/apps/:slug/uninstall`, setting the installation status to `REMOVED`, clearing webhooks and emitting an `app.uninstalled` event.

### OAuth & Installation Endpoints
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/apps/generate-credentials` | Authenticated developer credential generation. |
| POST | `/api/apps/import-manifest` | Fetch and register a manifest (create or update app & latest version). |
| GET | `/api/apps` | Paginated app list filtered by status or publisher. |
| GET | `/api/apps/:slug` | Public app detail, versions, scopes, OAuth metadata. |
| PATCH | `/api/apps/by-id/:id/publish` | Toggle `status` between `DRAFT` and `PUBLISHED`. |
| POST | `/api/apps/:slug/installations` | Create `PENDING` installation for a workspace admin. |
| POST | `/api/apps/installations/:id/ack` | Partner acknowledgement after OAuth token exchange. |
| POST | `/api/apps/:slug/uninstall` | Mark installation as `REMOVED` and clean webhook records. |
| GET/POST | `/api/apps/:slug/webhooks` | List or create webhooks for a workspace installation. |
| POST | `/api/apps/:slug/webhooks/test` | Send a test event to a webhook (admin only). |
| DELETE | `/api/apps/:slug/webhooks/:webhookId` | Remove a webhook subscription. |
| GET | `/api/oauth/authorize` | OAuth authorization endpoint (supports PKCE & workspace scoping). |
| POST | `/api/oauth/token` | Exchange authorization code or refresh token for access tokens. |
| POST | `/api/oauth/introspect` | Validate token state and metadata per RFC 7662. |

## Webhooks
- Managed per installation in the Developer Console under the *Webhooks* tab (`WebhookManager`).
- Secrets are generated automatically (`generateWebhookSecret`) and returned once on creation.
- Supported event types: `issue.created`, `issue.updated`, `issue.deleted`, `post.created`, `post.updated`, `workspace.member_added`, `workspace.member_removed`, `app.installed`, `app.uninstalled` (`WEBHOOK_EVENT_TYPES`).
- Deliveries record attempts, exponential backoff schedules and status codes. Analytics view surfaces aggregate delivery counts and success rate (currently mocked for UI testing).

## Security Guarantees
- Manifests validated with Zod before storage; reserved slug list blocks collisions with core routes.
- `validateAppManifestSecurity` enforces HTTPS entrypoints and flags suspicious scopes during install.
- OAuth client secrets hashed with bcrypt; secure string comparison prevents timing attacks.
- Access & refresh tokens encrypted using AES-256-GCM with 32-byte `APP_TOKENS_KEY`; decrypted lazily when validating refreshes or introspecting.
- Workspace membership checks ensure only admins can install/uninstall or manage webhooks.
- Consent dialog forces explicit acknowledgement when scopes are marked high risk.
- CSP helpers exist (`buildCSP`, `getSecurityHeaders`) for surfaces embedding third-party content.

## Environment & Local Setup
- Define `APP_TOKENS_KEY` as a 32-character string in `.env` to enable token encryption/decryption.
- Standard local workflow:
  1. Install dependencies: `npm install`.
  2. Run migrations: `npm run db:migrate`.
  3. Start dev server: `npm run dev` and visit `/dev/apps`.
- Sandbox manifest hosts can be HTTP (localhost) in development; production requires HTTPS.

## Useful UI Routes
- `/dev/apps` – app catalog, status badges, quick stats.
- `/dev/apps/new` – credential generator + manifest importer.
- `/dev/apps/:id` – overview, installation list, webhook manager, analytics.
- `/dev/apps/:id` → *Publish* – toggles store availability.
- `/[workspaceId]/apps/:slug` – workspace surface showing install CTA and post-install actions.

## Next Steps
- Wire analytics to real delivery + install metrics once instrumentation lands in the data warehouse.
- Expand scope catalog, including granular resource-level permissions.
- Flesh out third-party developer docs (host manifest schema, testing tools, sample apps) before opening submissions.
