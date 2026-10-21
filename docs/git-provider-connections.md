# Git provider connections

Project Settings contains repository connections for GitHub (including Enterprise
Server), Forgejo, GitLab and Bitbucket. These connections read recent commits and
pull/merge requests. Refresh is explicit: connect initially loads activity and
Refresh fetches it again. Saved activity remains when disconnected. Existing
GitHub OAuth, webhook, versioning and release connections are unchanged.

## Instances

GitHub.com, Codeberg (hosted Forgejo), GitLab.com and Bitbucket Cloud are built in. An operator registers
other hosted or self-managed instances with `GIT_PROVIDER_INSTANCES`, a JSON array:

```json
[
  {"provider":"github","baseUrl":"https://github.example.com","label":"GitHub Enterprise"},
  {"provider":"forgejo","baseUrl":"https://forgejo.example.com","label":"Forgejo"},
  {"provider":"gitlab","baseUrl":"https://gitlab.example.com","label":"GitLab"},
  {"provider":"bitbucket-dc","baseUrl":"https://bitbucket.example.com/bitbucket","label":"Bitbucket Data Center"}
]
```

Use an HTTPS web base URL, including a deployment subpath where required, without
query strings or credentials. URLs are operator-controlled, not accepted from an
arbitrary user input. Registering a private host explicitly authorizes the
application to reach that instance; have the infrastructure owner approve its
network reachability before configuration. TLS verification remains enabled;
redirects are rejected and credentials are never forwarded to another host.
Changing instance configuration does not remove saved connections or history;
refresh is denied until that exact provider/base URL is registered again.

## Credentials and access

Use a read-only token that can read repository metadata, commits and pull/merge
requests. GitHub Enterprise tokens use that instance's REST API. Forgejo uses a
scoped token. GitLab supports personal, project or group tokens with API read
access. Bitbucket Cloud accepts either a repository/workspace access token or an
API token with the Atlassian email entered in the form. Bitbucket Data Center uses
an HTTP access token. Cloud and Data Center have separate adapters.

Credentials are encrypted at rest with the application's existing encryption
service, never included in API responses, and removed on disconnect. Only the
connection's creator or the workspace owner can refresh, disconnect or replace
its token. Project members can view retained activity; connecting a private
repository intentionally shares that activity with the project. Removing access
to the Collab workspace denies these reads as well. A provider token's revocation
prevents refresh; it does not erase previously saved activity.

Browse repositories, or enter the path directly for a narrowly scoped token.
GitLab paths can include nested groups. Bitbucket Cloud browsing requires the
workspace slug. Data Center paths use `PROJECT/repository`. Reconnecting the same
provider, instance and repository identity updates its credentials and preserves
history. A refresh refuses a different repository at a reused path.

## Database and deployment

Migration `20261021223000_git_provider_connections` adds `GitConnection` and
`GitConnectionActivity` tables. It does not change or delete existing repository,
commit or pull request rows. Production has no Prisma migration ledger; do not
blindly run `prisma migrate deploy`. Through the existing application release
path, freshly verify the target database identity and schema, take a backup,
then apply only the exact additive SQL in this migration before deploying the
new UI/API. An application rollback may leave these additive tables in place. Do not
drop them if connections have been created, because that would delete history.

## Limits and acceptance

Each refresh fetches up to 20 recent commits and 20 pull/merge requests. Previously
seen activity is retained; this is not a full historical import. The UI displays
the latest 40 retained entries and the last successful refresh time. Provider
writes, bidirectional issue sync and automated webhooks are outside this first
connection/activity slice.

Deterministic fixtures exercise GitHub.com/Enterprise, Forgejo, GitLab.com/self-
managed and Bitbucket Cloud/Data Center contracts. They do not prove real-provider
acceptance. Record a tested instance version and the allowed/denied connect,
activity, refresh, reconnect and disconnect results for each hosting variant
before claiming that variant has passed live acceptance. Never put credentials
in this document or acceptance logs.

The approved sandbox Forgejo adapter read passed. Deployment evidence reports
HTTP 403 from the application container to the Forgejo public version endpoint;
Network Doctor consultation is pending. This does not establish production
provider acceptance. Keep credentials private and resolve reachability through
the existing infrastructure owner before claiming runtime acceptance.

Primary API references:

- [GitHub Enterprise REST authentication](https://docs.github.com/en/enterprise-server@3.22/rest/authentication/authenticating-to-the-rest-api)
- [Codeberg and Forgejo](https://docs.codeberg.org/getting-started/what-is-codeberg/)
- [Forgejo API usage](https://forgejo.org/docs/latest/user/api/usage/)
- [GitLab REST authentication](https://docs.gitlab.com/api/rest/authentication/)
- [GitLab commits](https://docs.gitlab.com/api/commits/) and [merge requests](https://docs.gitlab.com/api/merge_requests/)
- [Bitbucket Cloud REST API](https://developer.atlassian.com/cloud/bitbucket/rest/)
- [Bitbucket Data Center REST API](https://developer.atlassian.com/server/bitbucket/rest/v1005/)
