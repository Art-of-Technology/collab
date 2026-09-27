# Changelog generation access

Generation requires a current actor and repository workspace ownership or active
membership. Explicit release/version IDs are bound to that repository and the
shared [version provenance predicate](github-version-access.md); inaccessible explicit IDs return 404 without
falling back to a different release. Supplying conflicting release/version IDs
returns 400 after the release passes access checks. Empty request bodies retain
default selection; malformed JSON or invalid request fields return 400.

Commit and pull-request inputs repeat repository access. Access is checked again
once before the two model calls and in the final version update selector. There is
no intervening access check before the summary call. The provider may have
already received authorized-at-check context when later access is revoked; this is
not an atomic database/provider operation. The handler adds no retry loop and does
not override SDK retry defaults. Provider choice and prompt behavior are unchanged.
Successful responses set `Cache-Control: no-store`; error responses do not explicitly
set it. Failure logs do not include provider exception content.

`node --test tests/security/github-changelog-access.test.cjs` exercises actual
handler code with controlled database/session/provider dependencies. It checks
zero provider calls on denied targets and no stored write after a rejected final
selector. These are modeled checks, not live provider or concurrent database proof.
