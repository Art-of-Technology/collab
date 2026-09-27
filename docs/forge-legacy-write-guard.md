# Legacy writes in Forge-connected projects

A project in `COLLAB_FORGE_CONFIG_FILE` uses Forge issue authority. Legacy issue
creation, editing, moves, deletion, comments, reactions, relations, assignment,
and work logs through browser routes, server actions, AI actions and third-party app API handlers
reject writes affecting that project. Existing database records
and read endpoints remain available. Other legacy projects retain their normal
write paths.

Shared preflight guards run after the entrypoint's authorization and before
mutations. Moves check both projects; relations and parent links check both
issues; bulk relations check the entire batch before starting writes. Status
reassignment checks its project. Deletion-only preflight checks configured issues,
both endpoints of cascading issue relations, and children whose parent would be
cleared. Workspace deletion also rejects configured bindings and checks issues
reached through either their workspace or their project's workspace foreign key.
Ordinary edits do not scan deletion cascades. Onboarding creates a new project
and needs no existing-project guard; read handlers need no write-error branch. Invalid
connection configuration fails closed. Guards read binding metadata, never Forge
tokens or remote data.

Forge guard denials in the third-party app API return HTTP 409 with
`error: forge_connected_project` and a human-readable `error_description`.
Parent changes check the old and new parent before writes. Existing OAuth, scope and
workspace access checks still apply.

These checks are not an atomic lock against changing bindings or concurrently
moving a legacy issue. Binding activation and disconnection require a quiesced,
reconciled rollout. This change does not activate a connection or migrate data.

Run `node --test tests/security/forge-legacy-write-guard.test.cjs`. The checks
execute comment routes/actions, worklog creation, mixed bulk relations, both
move directions, issue deletion, and both workspace deletion callers with controlled database
dependencies. They assert no writes on denial and preserved unrelated writes;
they are not a production database or gateway acceptance test.

The app API composition check is `node --test tests/security/forge-app-write-guard.test.cjs`.
It exercises guarded create, edit, assignment, comment, work-log and relation
mutations, including parent-deletion effects and foreign-workspace denials.
It uses controlled database dependencies and does not qualify OAuth middleware
or production database concurrency.
