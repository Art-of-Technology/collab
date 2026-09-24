# Approved project memory

Project Notes links to `notes/memory`. Existing database Notes and their access
controls remain separate and are never migrated automatically. This view edits
canonical Markdown directly using the existing Notes UI primitives; the legacy
rich editor emits HTML/plain text and cannot preserve Markdown round trips.

Each bound project uses the fixed root file `project-memory.md` on an explicitly
configured branch. The file contains strict project metadata and bounded
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
  "writeTokenFile": "/run/secrets/collab-memory-writer"
}
```

This is a configuration example, not authorization to allocate credentials or
activate writes. The memory writer must be a separate identity/credential from
the issue writer and reader, limited to the intended repository. Native code
write permission is not path scoped: the application boundary restricts writes
to the fixed file. Deployment must also establish the separately reviewed
writer custody/enforcement boundary. Do not widen the issue-only principal.

The file must be a regular file, never a symlink or submodule. Reads verify its
path, size, canonical base64, Git blob hash, UTF-8, project and metadata schema.
There is no generic file API, branch creation, rename, force option, execution
or migration. File size, revision history, text and source-link limits are
defined by the [memory schema and serializer](../src/lib/forge/memory.ts), with
upstream file validation in the [memory store](../src/lib/forge/memory-store.ts).
Whole-file CAS serializes edits across the project; separate files are the
upgrade path if edit contention becomes material. Bounds fail visibly.

Credential fields are not accepted by the document schema. Free text must
contain references only; the UI explicitly tells authors not to enter secrets.
This is not a claim that arbitrary free-text secrets can be detected reliably.

## Evidence and remaining work

`node --test tests/security/forge-memory*.test.cjs` runs four executable checks
for lifecycle/provenance, malformed/cross-project documents, tenant rights,
stale approval at an unchanged draft revision number, fixed-path CAS,
concurrent conflicts, symlinks, integrity checks and lost-response readback.
The [access regression](../tests/security/forge-memory-access.test.cjs) also
checks that denied actions never resolve bindings and malformed source links
return validation errors without side effects. Implementation validation
reported passing checks, targeted lint and nonincremental TypeScript.

An earlier implementation's disposable PostgreSQL + local HTTPS fixture verified
the real Notes page and server actions: create Draft, approve revision 1,
edit Draft revision 2 while
revision 1 stays Approved, reject stale approval after a concurrent source
edit, refresh/review and approve revision 2 with revision 1 Superseded. The
320px view has no horizontal page overflow. This is fixture evidence, not a
live Forge or deployment claim, and does not establish hydrated UI or revocation
acceptance for the current authorization change.

A deliberately delayed save verified all form inputs and actions are natively
disabled while pending, then the saved draft is read back. This prevents edits
typed during an in-flight save from being silently discarded by its response.

Outstanding: independent pipeline review, live writer/binding validation,
gateway identity integration, full agent context consumption and staging
acceptance. No production configuration, token or repository was changed.
