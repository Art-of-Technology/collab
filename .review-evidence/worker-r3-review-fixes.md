# W13–W14 source review fixes

Starting candidate: `3869f9087dedd61b14f971fbf12ff8c7cc61ea50`.

Both findings were confirmed against the current source before editing. Only W13 and W14 were addressed; previous fixes and evidence remain intact.

## W13: scheduled launch and teardown ownership

Invariant: successful uninstall must close the exact owned scheduled instances and prevent delayed launches from admitting work.

Affected boundaries: installation and generated arguments on all three platforms; service invocation admission under the existing worker lock; foreground admission without service identity; stop/closure preconditions; Windows disable, running-instance inspection, deletion; failed-install and interrupted-uninstall recovery with or without the local definition.

Each installation now records a UUID included in scheduled launch arguments. Under the worker lock, a service run requires the current, non-retired installation UUID. Uninstall persists retirement before supervisor actions. Foreground runs remain independent of installation identity. Windows disables the exact task and uses a bounded Task Scheduler running-instance query before deleting the registration. Inspection includes hidden tasks and selects the exact task path. Unknown closure retains the retired ownership record. Confirmed registration absence alone does not establish closure. Existing saved path/hash/label and owned-child closure checks remain enforced; no remembered PID is signalled.

Post-fix trace: a native CLI paused before lock admission is released while uninstall holds the lock, exits without dispatch, and is observed closed before fake task deletion. Later invocations with the retired UUID stop before doctor, accounting or API calls. Reinstallation produces a different UUID; a stale invocation cannot alter the new installation state. Ordinary foreground execution still completes work. Native supervisor actions remain faked in this phase.

Primary contracts consulted: [TaskService.GetRunningTasks](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskservice-getrunningtasks), [schtasks change](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-change), and [schtasks delete](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-delete). No live Windows service operation or PowerShell execution was performed; native Windows acceptance remains with the rollout owner.

## W14: exact owned recovery lookup

Invariant: recovery must resolve the exact agent owned by the current user and workspace, independently of the general list's cap.

Affected boundaries: idle-crash recovery; saved failed-close recovery; authenticated worker GET route; shared owned-agent query and sanitized response; existing capped list compatibility.

`GET /api/apps/auth/agents/worker?agent=NAME` requires `issues:read`, validates the name, and reuses the bounded workspace/user/name lookup. The general list still returns at most 200 agents. Both recovery cases use the same exact lookup before closing the saved generation and admitting a new one. Missing, wrong-owner, wrong-workspace and insufficient-scope cases refuse recovery; server generation fencing is unchanged.

Post-fix trace: an agent alphabetically beyond 201 other registrations is absent from the capped list but returned by the exact endpoint. Idle-crash and lost-close recovery close the original generation before starting a different generation. A missing owned record leaves the old generation unresolved and admits no model work. Normal setup, generation mutation and list callers retain their existing behavior.

## Focused verification

- `node --test --test-concurrency=1 packages/cli/test/worker.test.mjs tests/security/managed-worker.test.cjs`: 85 passed, 0 failed, 20.71 seconds.
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0, 18.33 seconds.
- Results: `worker-r3-results.json`; full output: `worker-r3-focused.log` and `worker-r3-types.log`.

All source and regression changes were applied before this verification batch. Existing dependencies were reused. No complete repository test/lint suite, dependency installation, model call, OS service installation, DB, browser, remote operation, or pipeline control was performed. Prior 89-test/types evidence and the earlier callback timing failure plus isolated success are retained unchanged. This is source-phase evidence, not publication, deployment or pilot acceptance. No CI/CD Instructor approval is claimed; external advisory receipt writes were outside this worktree-only phase.
