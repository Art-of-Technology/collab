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
1. **Generate OAuth credentials**
   - Use the *Generate App Credentials* widget on `/dev/apps/new` (POST `/api/apps/generate-credentials`).
   - Copy the `client_id` and `client_secret` into your manifest’s `oauth` block. Secrets are shown once; store them securely.
2. **Prepare `manifest.json`**
   - Follow the schema below, host it on HTTPS (HTTP allowed for localhost), and ensure the slug is unique and not reserved.
3. **Import manifest**
   - Submit the manifest URL via the form on `/dev/apps/new` (POST `/api/apps/import-manifest`). The API fetches the file, validates it with Zod, persists the manifest snapshot and initial scopes, and hashes the OAuth secret.
4. **Review & iterate**
   - `/dev/apps/:id` displays the parsed manifest, current status, install analytics, webhook settings and workspace installs. Re-importing the same slug + new version updates metadata and app scopes.
5. **Publish**
   - Toggle availability via the *Publish* control (PATCH `/api/apps/by-id/:id/publish`). Published apps appear in workspace listings and can be installed by admins.

## App Manifest Reference
```json
{
  "schema": "https://developers.collab.com/schemas/app-manifest.v1.json",
  "name": "Hello Collab",
  "slug": "hello-collab",
  "version": "1.3.0",
  "description": "Sample integration that syncs issues from Collab.",
  "type": "external_iframe",
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
    "client_id": "<value from credential generator>",
    "client_secret": "<value from credential generator>",
    "redirect_uris": ["https://hello.example.com/oauth/callback"],
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
  }
}
```

### Validation Rules
- `slug`: lowercase alphanumeric + hyphen, max 50 chars; reserved slugs include `admin`, `api`, `auth`, `dev`, `manifest`, etc. (`RESERVED_APP_SLUGS`).
- `type`: one of `external_iframe`, `mfe_remote`, `server_only`.
- `entrypoint_url`: must resolve to HTTPS (localhost allowed for development) and passes `validateAppManifestSecurity` checks.
- `scopes`: deduplicated list of up to 10 values; allowed scopes come from `AppScopeSchema` (`workspace:read`, `issues:read`, `issues:write`, `comments:read`, `comments:write`, `user:read`, `leave:read`, `leave:write`).
- `oauth`: all redirect URIs validated as URLs; both `client_id` and `client_secret` are required when provided.
- `webhooks.url`: must be HTTPS in production; private-network hosts are rejected.
- Legacy fields `homepage_url` and `permissions_legacy` are mapped for backward compatibility but new manifests should use the fields above.

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
