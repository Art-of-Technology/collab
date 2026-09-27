# Repository dashboard and activity access

Dashboard and activity endpoints require a current actor and repository workspace
ownership or active membership before content reads. Every subsequent query repeats
the repository predicate. Release/deployment results and version-related counts also
use the version provenance predicate. Responses are no-store; activity limits are
bounded to 1–100. Existing response fields and sorting are retained.

Run `node --test tests/security/github-feed-access.test.cjs` for controlled-database
handler checks. These cover owner/member success and absent, foreign and revoked
access without content queries. Scoped typing uses the candidate generated Prisma
client. Neither check establishes native database isolation or concurrent revocation.

Changelog generation, version.json and remaining repository projections require
separate reconciliation; this is not whole-repository authorization acceptance.
