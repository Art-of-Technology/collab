# Changelog generation access

Generation requires a current actor and repository workspace ownership or active
membership. Explicit release/version IDs are bound to that repository and the
shared version provenance predicate; inaccessible explicit IDs return 404 without
falling back to a different release. Supplying conflicting release/version IDs
returns 400. Empty request bodies retain default selection; malformed inputs fail.

Commit and pull-request inputs repeat repository access. Access is checked again
before model calls and in the final version update selector. The provider may have
already received authorized-at-check context when later access is revoked; this is
not an atomic database/provider operation. No provider call is retried. Provider
choice and prompt behavior are unchanged. Responses are no-store and failure logs
do not include provider exception content.

`node --test tests/security/github-changelog-access.test.cjs` exercises actual
handler code with controlled database/session/provider dependencies. It checks
zero provider calls on denied targets and no stored write after a rejected final
selector. These are modeled checks, not live provider or concurrent database proof.
