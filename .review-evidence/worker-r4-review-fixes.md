# W15–W16 source review fixes

Starting candidate: `ca6d8e819035b064f782f249340f85aaf1747434`.

Both findings were confirmed in the current source before editing. Only W15 and W16 were addressed. Prior fixes, receipts and validation evidence remain intact.

## W15: prove absence before confirming stop

Invariant: stop/status may confirm absence only while holding the exclusive worker lock with no unresolved child or generation; authenticated control may confirm owned liveness or closure.

The affected paths are foreground and scheduled startup before control publication, missing/incomplete/unreachable control metadata, status and stop, truly absent workers, saved unclosed generations and children, normal authenticated control, and local recovery after login expiry. They share one stop/status boundary. Missing control metadata no longer reports success. When control cannot confirm the outcome, the caller acquires the existing worker lock and examines current durable state. A busy fresh startup returns `starting` with `stopped:false` from status and `stop_unconfirmed` from stop. Unresolved prior work remains uncertain. No new scheduler, shutdown protocol or PID signalling was introduced.

Post-fix trace: a fresh foreground or scheduled daemon holds its lock with doctor pending and no run ID/control record. Concurrent stop cannot acquire that lock and refuses closure; status reports starting without model activity. After the deterministic latch releases, normal startup publishes authenticated control, and owned stop confirms shutdown. Separate regressions hold the same lock with missing or unavailable control metadata, then release it and confirm absence without altering the saved state. A free lock does not clear an unresolved child or generation. Existing child-stop, actual CLI crash recovery, expired-login recovery and service-installation fencing regressions pass.

## W16: remove the unconfigured turn cutoff

Invariant: the emitted provider invocation retains configured cost and duration controls without an additional fixed turn ceiling.

The sole Claude execution invocation no longer sends `--max-turns 20`. No documentation or other current invocation specified that ceiling. The emitted-process-interface regression checks its absence and retains assertions for the exact reserved budget, configured timeout, dedicated session, default read-only tools and permission policy. Existing result/session/usage validation and budget-error behavior run in the same test. Reservations, starts/day, restarts/hour, uncertain-outcome handling and automatic retry policy were not changed.

## Verification

All code and regression changes were applied and both failure/success paths retraced before one focused verification invocation. Eleven selected behavioral regressions passed, with no failures or skips, in 20.07 seconds. The command and result are in `worker-r4-results.json`; complete output is in `worker-r4-focused.log`.

The unchanged prior 85-test result remains in `worker-r3-focused.log`. The prior TypeScript success in `worker-r3-types.log` is reused because this round changes only CLI `.mjs`, its tests and documentation; no TypeScript inputs or dependencies changed. Earlier callback failure and isolated-success evidence remain unchanged.

No complete test/lint suite, dependency installation, live model, native OS-service operation, DB, SSH, browser, OAuth, pipeline control, publication or deployment was performed. Source-phase checks do not establish native service or provider pilot acceptance. No new CI/CD Instructor approval is claimed; this phase retains the worktree-only advisory limitation recorded in the earlier review evidence.
