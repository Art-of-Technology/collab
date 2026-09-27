# Legacy writes in Forge-connected projects

A project in `COLLAB_FORGE_CONFIG_FILE` uses Forge issue authority. Legacy issue
creation, editing, moves, deletion, comments, reactions, relations, assignment,
and work logs through browser routes, server actions and AI actions reject writes
affecting that project. Third-party app API guards are a separate required slice
before activation; this change alone does not protect those endpoints. Existing database records
and read endpoints remain available. Other legacy projects retain their normal
write paths.

Shared preflight guards run after the entrypoint's authorization and before
mutations. Moves check both projects; relations and parent links check both
issues; bulk relations check the entire batch before starting writes. Status
reassignment checks its project. Workspace deletion rejects a workspace with a
configured binding so cascading deletion cannot remove retained records.
Onboarding checks its newly created project within the transaction. Invalid
connection configuration fails closed. Guards read binding metadata, never Forge
tokens or remote data.

These checks are not an atomic lock against changing bindings or concurrently
moving a legacy issue. Binding activation and disconnection require a quiesced,
reconciled rollout. This change does not activate a connection or migrate data.

Run `node --test tests/security/forge-legacy-write-guard.test.cjs`. The checks
execute comment routes/actions, worklog creation, mixed bulk relations, both
move directions, and workspace deletion routes/actions with controlled database
dependencies. They assert no writes on denial and preserved unrelated writes;
they are not a production database or gateway acceptance test.
