# Version and release list access

The repository version and release list routes require a current actor and repository
workspace ownership or active membership. Missing actors receive 401; missing or
inaccessible repositories receive 404. Their final reads repeat repository access.
Versions must retain valid provenance and every linked issue must satisfy the shared
issue/project/status access predicate. Parent and child version projections apply the
same checks. Successful responses set `Cache-Control: no-store`. Integer limits are
bounded to 1–100; omitted or non-integer limits default to 50 versions or 20 releases.

The migration adds `Version.issueAccessInvalidated`. Existing versions start invalid;
new versions default valid. Six retained database triggers make invalidation sticky,
propagate it through inheritance, and invalidate affected versions when issue links,
issue tenant/status associations, projects or statuses are removed or changed. Applying
this migration can hide historical version/release records. Do not automatically clear
flags or infer safe historical provenance from the current absence of links.

For changelog generation access, see [Changelog generation access](github-changelog-access.md).
This slice does not qualify every repository route. Dashboard, activity,
version.json and other version projections still require separate current-source
reconciliation before gateway activation. The migration has not been executed against
the final integrated database; trigger behavior, populated restore and catalog equality
remain native acceptance requirements.

Focused check: `node --test tests/security/github-version-access.test.cjs`.
It executes real handlers/predicates with controlled database responses. It is not
proof of native database isolation, concurrent revocation or trigger semantics.

Repository detail embeds only versions satisfying the same predicate and counts only
those versions. Project summary release activity likewise requires an accessible,
non-invalidated linked version. Targeted checks run the existing handlers with modeled
rows: `node --test --test-name-pattern='summary release projection|GET preserves owner' tests/security/project-summary-access.test.cjs tests/security/github-lifecycle-access.test.cjs`.
The repository check verifies both list/count query scopes; the summary check evaluates
visible, invalidated and foreign-linked-issue versions. Neither executes PostgreSQL.
