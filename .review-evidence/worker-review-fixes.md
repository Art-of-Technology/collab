# Managed worker review fixes

Candidate starts at 0121eedc312700b33abd6bfdebb62cba9b4c0025. This round addresses W1-W8 and the bootstrap contract correction within the assigned review phase.

- W1: configure checks workspace:write and issues:read in addition to issues:write at the shared service boundary, covering creation, subscription changes and manual conversion. Start/renew/close retain issues:write.
- W2: private configure intent, full request and stable session identity are saved before dispatch. Unknown setup retries reuse that request and preserve the usage ledger; run refuses pending setup.
- W3/W5: one serialized renewal loop covers idle, cleanup, pre-dispatch reads, execution and usage-limit waits. Bounded retry applies only to reads and same-generation lease events, including lost start/close replies. Server fencing still rejects expired/closed generations.
- W4: expired/missing login and permanent runner configuration failures return observable paused states with normal exits. Unexpected failures and exhausted transient reads retain failure exits, with durable daemon restart accounting before runner startup checks.
- W6: uninstall verifies saved path/label/hash and closure without checking mutable runner paths. Setup refuses while an installation is recorded.
- W7: removed the unused alternate delivery/revision branch. The legacy callback retains its payload, deduplication, cancellation and private environment behavior.
- W8: removed the unreachable provider retry convention and fake-only restart tests. Provider results pause with known costs charged. Claiming and settlement phases preserve uncertain task mutations without resending them or repeating a model; committed completion can be reconciled after restart. Actual CLI subprocess recovery is tested after killing an idle owned daemon, including the restart limit.
- Bootstrap schema hash and new migration pin were updated without changing prior migration pins or unmodeled supplements. The executable bootstrap fixture passed without connecting a database.

All intended source fixes were applied before focused verification. Failure and ordinary paths were retraced, including setup, startup/auth, lease events, claim/context reads, child closure, result settlement, stop and service teardown.

## Verification

- `node --test packages/cli/test/worker.test.mjs tests/security/bootstrap-recipe.test.cjs`: 40 passed (22.42 seconds).
- Focused worker/callback selection in `packages/cli/test/cli.test.mjs`: 12 passed, 1 failed (18.94 seconds). The existing two-second callback-expiry test could not read its PID file: the callback had not initialized before expiry under concurrent load.
- That single unchanged callback-expiry test passed in isolation (2.40 seconds). Both original failure and isolated pass are retained; no assertion or timer was weakened.
- Root managed-worker security tests and TypeScript checks were not run: this worktree has no resolvable typescript, zod, @prisma/client or jsdom dependencies, and tsc is not on PATH. New service-boundary regressions await the outer executor's dependency preparation and validation phases.
- No Instructor approval is claimed. Its consultation/receipt workflow requires out-of-worktree writes, excluded by this phase's workspace boundary.

The source-phase evidence is provisional. No model/provider call, OS service installation, browser, database connection, host operation, publication, deployment or outer pipeline control occurred. Test service actions used local fakes. Budgets remain per configured worker in its private state directory on one host, not organisation-wide caps.
