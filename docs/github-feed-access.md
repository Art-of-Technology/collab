# Repository dashboard and activity access

Dashboard and activity endpoints require a current actor and repository workspace
ownership or active membership before content reads. Every subsequent query repeats
the repository predicate. Release/deployment results and version-related counts also
use the version provenance predicate described in [Version and release list access](github-version-access.md).
Missing actors receive 401; missing or inaccessible repositories receive 404.
Successful responses are no-store. Existing activity limit handling, response fields
and sorting are retained.

Run `node --test tests/security/github-feed-access.test.cjs` for controlled-database
handler checks. These cover owner/member success and absent, foreign and revoked
access without content queries. Scoped typing uses the candidate generated Prisma
client. Neither check establishes native database isolation or concurrent revocation.

The project version.json endpoint now requires current project access and checks
stored/fallback version provenance. Its previous public cache directives are removed;
unauthenticated callers receive 401 and inaccessible projects receive 404.

For changelog generation access, see [Changelog generation access](github-changelog-access.md).
Remaining repository projections require separate reconciliation; this is not
whole-repository authorization acceptance.
