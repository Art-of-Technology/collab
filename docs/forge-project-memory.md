# Approved project memory

Project Notes links to `notes/memory`. Existing database Notes and their access
controls remain separate and are never migrated automatically. This view edits
canonical Markdown directly using the existing Notes UI primitives; the legacy
rich editor emits HTML/plain text and cannot preserve Markdown round trips.

Each bound project uses the fixed root file `project-memory.md` on an explicitly
configured `main` branch. The file contains strict project metadata and bounded
revision sections for Rules, Strategy, Decisions and Handoffs. No user-supplied
path, branch, identity or approval fields enter the writer request. The server
checks active tenant membership and the applicable Notes action permission
before resolving bindings or opening credentials on every read/mutation;
only workspace owners/admins approve. After reading the source, editing another
owner's draft also requires the existing edit-any-Note permission. New content
starts as Draft.

Source links must be credential-free HTTPS URLs on `slack.com` or its
subdomains. Invalid input is rejected before binding reads or writes and shown
as a validation error, not an uncertain save.

Draft edits keep the previous approved content. Approval requires the exact
file SHA the reviewer loaded and atomically supersedes the previous approved
revision. The current file retains the last superseded revision; older history
belongs to Git. The context selector always includes approved Rules and only
explicitly selected other approved notes. Drafts and superseded content are
excluded. This slice stores and selects approved context; it does not deliver
that context to running agents. Executor integration is a separate pending slice.

The writer uses Forge's create/update contents API with base64 content and
existing blob SHA, followed by source readback. A changed SHA is a conflict.
An uncertain response is never retried automatically; readback can confirm a
successful write whose response was lost. Otherwise the UI retains unsaved
text and asks the user to refresh and compare. These fields follow the
[Forgejo API source](https://codeberg.org/forgejo/forgejo/src/branch/forgejo/modules/structs/repo_file.go).

## Connection and limits

Extend the server-owned [project binding](forge-board.md) with:

```json
"memory": {
  "branch": "main",
  "writerOrigin": "https://memory-writer.internal:3443",
  "serviceTokenFile": "/run/secrets/collab-memory-service"
}
```

This replaces the former `memory.writeTokenFile` configuration, which is now
rejected. `writerOrigin` accepts a credential-free HTTPS origin with or without
a trailing slash; paths, queries and fragments are rejected. The app always
addresses `/v1/project-memory` at that origin.

`Dockerfile.memory-writer` declares UID/GID 10002:10002; deployment must run
Collab as 1001:1001. These source declarations do not prove runtime custody.
Mount configuration, credentials and TLS files read-only. The writer config
path is `/run/config/collab-memory-writer.json`, selected by
`COLLAB_MEMORY_WRITER_CONFIG_FILE`:

```json
{
  "origin": "https://forge.internal",
  "projectId": "the-bound-collab-project-id",
  "forgeTokenFile": "/run/secrets/notes-forge-token",
  "serviceTokenFile": "/run/secrets/collab-memory-service",
  "certificateFile": "/run/secrets/writer.crt",
  "keyFile": "/run/secrets/writer.key",
  "host": "192.0.2.10",
  "port": 3443
}
```

These addresses are examples, not deployment configuration. Network Doctor owns
the actual private address, TLS trust, secret custody and network policy:
only Collab may reach the writer, writer egress is Forge-only, and the writer
has no published host port. Collab retains direct Forge access for reads and
save readback using its application token. The app must trust the writer
certificate and the writer must trust Forge; TLS verification
stays enabled. The service credential must be distinct from the Forge token,
contain no whitespace and have at least 32 characters.

The integration mount contract uses
`COLLAB_FORGE_CONFIG_FILE=/run/config/collab-forge.json` and the approved NEW
Collab-only `read:repository` + `write:issue` token on existing principal11 at
`/run/secrets/collab-forge-token` for `readTokenFile` and the root-owned issue
writer. The optional `issues` binding is documented in the
[issue actions guide](forge-issue-actions.md).
No additional principal12 token is implied. The service bearer is mounted at
`/run/secrets/collab-memory-service` in both services. The native Notes token at
`/run/secrets/notes-forge-token` is writer-only. No credentials are provisioned
by this source change. Forge-only writer egress requires deployment enforcement;
a fixed URL or Docker bridge alone does not establish it.

Writer startup rejects wildcard and broadcast addresses by parsed address,
including expanded IPv6 and IPv4-mapped spellings. This local bind guard does
not establish the separate private-network or egress policy.

Only `POST /v1/project-memory` accepts writes. Its exact body fields are
`projectId`, `repositoryId`, `expectedSha` and `content`; project and repository
are assertions checked against server configuration. The service fixes the
repository to `Space/team-space` (ID 4), branch `main` and file
`project-memory.md`. It accepts no path, ref, author, force or origin overrides.
`GET /health` reports process liveness only, not Forge or credential readiness.

Native Forge code-write permission remains repository-wide. The isolated service
constrains requests to one file; compromise of its native token retains the
repository-wide residual risk. The app never receives that native token. This
boundary does not replace the app's tenant, Notes permission or approval checks.

For an uninitialized repository, the configured branch must exactly match its
verified default branch. Only then is Forgejo's empty contents response treated
as a missing memory file. The first authorized save initializes that branch with
the fixed file in one contents-API write; it does not create a README or choose
a fallback branch. In an initialized repository, a missing-file response also
requires confirmation that the configured branch exists. Wrong branches,
directory responses and malformed arrays are rejected. Concurrent first saves
use native create semantics and readback; an uncertain result is never retried.

The file must be a regular file, never a symlink or submodule. Reads verify its
path, size, canonical base64, Git blob hash, UTF-8, project and metadata schema.
Leading UTF-8 BOM bytes are preserved for schema validation and exact readback
comparison; a BOM-prefixed document is rejected, not silently normalized.
Both writer and app require the raw readback content to equal the requested
Markdown before confirming a save; equivalent parsed metadata is insufficient.
There is no generic file API, branch creation, rename, force option, execution
or migration. File size, revision history, text and source-link limits are
defined by the [memory schema and serializer](../src/lib/forge/memory.ts), with
upstream byte validation in the shared [file transport](../src/lib/forge/memory-file.mjs)
and document validation in the [memory store](../src/lib/forge/memory-store.ts).
Whole-file CAS serializes edits across the project; separate files are the
upgrade path if edit contention becomes material. Bounds fail visibly.

Credential fields are not accepted by the document schema. Free text must
contain references only; the UI explicitly tells authors not to enter secrets.
This is not a claim that arbitrary free-text secrets can be detected reliably.

## Evidence and remaining work

`node --test tests/security/forge-memory*.test.cjs tests/security/isolated-memory-writer.test.cjs tests/security/memory-file-bytes.test.cjs` runs executable checks
for lifecycle/provenance, malformed/cross-project documents, tenant rights,
stale approval at an unchanged draft revision number, fixed-path CAS,
concurrent conflicts, symlinks, integrity checks and lost-response readback.
The [access regression](../tests/security/forge-memory-access.test.cjs) also
checks that denied actions never resolve bindings and malformed source links
return validation errors without side effects. Focused local checks use
synthetic credentials, mocked Forge responses and an ephemeral localhost HTTPS
server; they do not prove native Forge concurrency or deployed network policy.

Historical retained evidence from a disposable PostgreSQL + local HTTPS fixture verified the real Notes page and
server actions: create Draft, approve revision 1, edit Draft revision 2 while
revision 1 stays Approved, reject stale approval after a concurrent source
edit, refresh/review and approve revision 2 with revision 1 Superseded. The
320px view has no horizontal page overflow. This historical fixture evidence has not been rerun for this integration and is
not current runtime, live Forge or deployment acceptance.

That historical fixture also used a deliberately delayed save and verified all form inputs and actions are natively
disabled while pending, then the saved draft is read back. This prevents edits
typed during an in-flight save from being silently discarded by its response.

Outstanding: independent pipeline review, live writer/binding validation,
remaining [gateway integration requirements](security/2026-09-23-hardening.md#gateway-session-core-inactive-integration),
full agent context consumption and staging
acceptance. No production configuration, token or repository was changed.
