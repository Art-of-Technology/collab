# Issue Trash and Restore

Moving an issue to Trash keeps its ID, issue key, comments, work logs, relationships and history. It disappears from ordinary boards, lists, search and counts, and ordinary issue APIs cannot read or modify it. Children remain separate issues; their link to a trashed parent is retained and becomes visible again when the parent is restored.

Open **Project settings → Trash** to restore an issue. There is no automatic expiration or purge. Workspace administrators can permanently delete an already trashed issue by typing its exact key (or ID for legacy issues without a key). Permanent deletion removes its dependent content. A separate audit record retains the issue identity, title, project/workspace, actor, authenticated client and time.

App and agent tokens can move issues to Trash and restore them with `issues:write`; they cannot permanently delete issues. Preview and Trash listing require `issues:read`. The browser keeps its issue deletion permissions for moving and restoring issues, and additionally checks workspace administrator status for permanent deletion.

Status removal (including Settings saves) refuses while a trashed issue still uses that status, even when its displayed issue count is zero. Restore the issue before reassigning its status. A parent cannot move to another project while a retained child would be left behind.

For stored version and release visibility during Trash/Restore, see [Version and release list access](github-version-access.md).

## CLI and app API

See the [CLI commands and inputs](../packages/cli/README.md#commands-and-inputs) for project-scoped previews, Trash, Restore and compatibility requirements, and the [app API reference](../public/docs/third-party-api.md#issue-trash-and-restore) for endpoint parameters and scopes.

## Deployment and data preservation

The migration adds nullable Trash fields and a standalone audit table, then changes the Issue-to-project/workspace foreign keys from cascading deletion to restriction. Parent deletion cannot remove active or trashed issues. Empty-database bootstrap is qualified separately; it must never run on an existing database.

Before an existing-database migration, identify the current application database, schema and migration ledger, take a fresh private custom-format backup, inspect its table of contents, and retain a hash-verified copy away from the database host. Apply only the reviewed additive SQL when the database has no Prisma migration ledger; do not blindly replay migration history. Preserve current application environment variables and encryption keys during release.

The fields and audit table must remain on image rollback. An image predating Trash does not honor its visibility or deletion rules; reverting to it requires preventing issue writes until the compatible image is restored. Previously hard-deleted records and comments are not recovered by this migration.

Verification includes executable CLI/API/UI tests, an actual PostgreSQL lifecycle with audit-failure rollback, nested visibility, scoped restore/purge and database-level parent deletion refusal. Search delivery remains best-effort, so search results recheck current issue visibility before returning content.
