# Worker re-review fixes: W9-W12

Starting candidate: 1a5a3d5c9c377ee55f25d2156a50b2a1218e3355. This round changes only the four selected findings and their tests/documentation; prior fencing, lease, usage and uncertain-task behavior is retained.

- W9: the HTTP client identifies known configure rejection codes only on the configure endpoint, with the matching HTTP status and JSON response. Setup then clears the rejected request payload while retaining its saved configuration/session identity and usage. The next setup may correct conversion or labels. Lost replies, timeouts, 5xx, malformed responses and unknown rejection codes retain the exact request and reject changed retries. The successful setup path still removes the pending intent; run continues to refuse incomplete setup.
- W10: removed the mutable repository-cwd parameter from service definitions. All three supervisors launch in the private configuration directory, and only runner checks/execution use the repository cwd. Typed configuration consumers launch the actual CLI after moving or deleting the repository; it records config/worker_config and exits zero before admitting a daemon run.
- W11: teardown retains path, label, hash and owned-closure checks. A failed removal permits cleanup only after a read-only query confirms absence of the exact owned service. A missing local definition after interrupted cleanup permits only inspection, never service removal. Present, unrelated, permission, transport, killed and unrecognized results preserve the saved record. Install, removal and query tests use fake executors; no actual service was installed, stopped or removed.
- W12: runner stdout is retained as bytes and decoded once after owned-child closure, with the existing combined stdout/stderr byte limit. Test stdin/stdout/stderr captures use streaming UTF-8 decoding. A real Node subprocess emits multibyte JSON one byte at a time; the decoded result is exact. Byte-limit tests confirm rejection and child closure.

All fixes were applied before the focused verification. Failure and successful paths were retraced through request/configure, all service-definition callers, teardown outcomes, runner doctor/execute and subprocess capture. The obsolete cwd parameter was removed at every caller.

## Verification

Dependencies were prepared in this pipeline worktree using the authorized existing-lockfile command:

`npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund`

Prisma Client 6.19.3 was generated with `node node_modules/prisma/build/index.js generate`. No dependency or lockfile changes were made.

- `node --test --test-concurrency=1 packages/cli/test/worker.test.mjs tests/security/managed-worker.test.cjs tests/security/bootstrap-recipe.test.cjs`: 89 tests passed, zero failures/skips (26.14 seconds).
- `node node_modules/typescript/bin/tsc --noEmit`: passed (59.46 seconds).
- Both checks ran once; no full test/lint suite, native rebuild or live model execution was performed. Prior callback timing failure and isolated success artifacts remain unchanged.

macOS absence classification was checked by a read-only `launchctl print` of one deliberately nonexistent service in the current user domain: exit 113 and the exact named-service/domain error, with no stdout. No existing service was queried or changed. Windows uses the documented exact-task query with HRESULT exit mode ([Microsoft schtasks query](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-query)); systemd requires a successful LoadState query returning not-found ([systemctl](https://www.freedesktop.org/software/systemd/man/251/systemctl.html)). Unrecognized platform outcomes fail closed.

No Instructor approval or runtime/pilot acceptance is claimed. Its receipt workflow remains outside the permitted write boundary. The outer executor owns all later phases, native publication, production migration, service installation and Sportsbook acceptance.
