# Remote MCP endpoint

Collab serves a Model Context Protocol endpoint so an agent on another platform can read and write issues, comments and Notes. It mirrors the CLI: every tool forwards to the API route the matching `collab` command calls, with the caller's own token, so access checks, validation and side effects are the same.

## Endpoint

`POST https://collab.weez.boo/api/mcp` (Streamable HTTP, stateless). Other methods answer `405`.

- A client on protocol `2026-07-28` gets `application/json`.
- A 2025-era client is served without a session. Each request is answered as one `text/event-stream` event, so send `Accept: application/json, text/event-stream`.

## Authentication

Every request needs `Authorization: Bearer <token>`. Any token the API accepts works here:

| Token | Acts as | How to get it |
| --- | --- | --- |
| Agent token | a service account named after the token | Workspace settings, **Agent tokens** (see the [CLI guide](../packages/cli/README.md#agent-tokens)) |
| Connector sign-in | the member who signed in | OAuth with the public client `collab-connector` (see [discovery](oauth-endpoints.md#discovery-for-the-mcp-endpoint)) |
| CLI login | the member who logged in | `collab auth login` |

| Status | Meaning |
| --- | --- |
| `401` | Missing, unknown or expired token. The response carries `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/mcp"`, which starts a client's sign-in. |
| `403` | The token is valid but its account lost access to the workspace, or its app is not active. No sign-in is offered. |
| `413` | The request body is larger than 1 MiB. |
| `503` | Authentication is temporarily unavailable. Retry; do not sign in again. |

A token works in the workspace it was issued for. A member's token may name another of their workspaces with the `workspaceId` argument; an agent token's service account belongs to one workspace only.

## Connect Claude

### Claude in Slack (one shared identity)

Claude in Slack acts as itself, not as the person who mentions it, so give it an agent token.

1. Create an agent token, for example named `Claude`, with the access it needs.
2. In Claude's organisation settings, under **Claude Tag**, add a custom connector with credential type **Bearer**, the token as its value, and `collab.weez.boo` as the allowed website.
3. Add a plugin whose `.mcp.json` declares the server, wherever the connector applies:

```json
{ "mcpServers": { "collab": { "type": "http", "url": "https://collab.weez.boo/api/mcp" } } }
```

Issues and comments Claude writes show the token's name.

### claude.ai connector (each member as themselves)

1. An organisation owner opens **Organization settings**, then **Connectors**, then **Add**, then **Custom**, and enters a name and the URL `https://collab.weez.boo/api/mcp`.
2. On the authentication step, choose sign-in and **Use your own OAuth client**, with client ID `collab-connector` and no secret.
3. Each member opens **Customize**, then **Connectors**, clicks **Connect**, signs in to Collab, picks a workspace and approves the listed permissions.

Signing in again for the same workspace replaces the earlier connection. If the dialog offers **Request headers**, an owner can instead choose **No sign-in** and add `Authorization: Bearer <agent token>`; everyone in the organisation then acts as that service account.

### Claude Code (each member as themselves)

```sh
claude mcp add --transport http --client-id collab-connector collab https://collab.weez.boo/api/mcp
```

Then sign in from `/mcp`. Claude Code's loopback callback is accepted for this client.

## Tools

A token is offered only the tools its scopes allow, so a read-only token never sees a write tool. Every tool also takes an optional `workspaceId`.

| Tool | Does | Scope |
| --- | --- | --- |
| `whoami` | The account the token acts as | `user:read` or `profile:read` |
| `workspaces_list` | Workspaces the account can use | `user:read` and `workspace:read` |
| `projects_list` | Projects | `projects:read` |
| `projects_statuses` | Statuses of one project | `projects:read` |
| `labels_list` | Labels and their IDs | `workspace:read` |
| `issues_list`, `issues_get` | Read issues | `issues:read` |
| `issues_create`, `issues_update` | Write issues | `issues:write` |
| `comments_list` | Comments on an issue | `issues:read` |
| `comments_add` | Add a comment | `issues:write` |
| `relations_add` | Relate two issues | `issues:write` |
| `worklogs_add` | Log time in minutes | `issues:write` |
| `notes_list`, `notes_get` | Read shared Notes | `context:read` |
| `notes_create`, `notes_update` | Write shared Notes | `context:write` |
| `search` | Search issues, Notes and activity | `issues:read` or `context:read` |
| `context_get` | Project pipeline context, or workspace prompts | `prompts:read` (pipeline context also needs `issues:read` and `context:read`) |

- An issue is addressed by its ID or its key, for example `CLB-123`.
- `labels` takes label IDs from `labels_list`. On update it replaces the whole set. A label that an agent subscribes to hands the issue to that agent, which is how work is routed from one agent to another (see [agent handoffs](agent-handoffs.md)).
- Secret documents (`ENV_VARS`, `API_KEYS`, `CREDENTIALS`) cannot be read, created or changed, and personal Notes cannot be written. A Note created with a `projectId` is a project Note unless a scope is given.
- `context_get` returns pipeline context when a `projectId` is given and `includeKnowledge` is not set; `limit`, `offset` and `since` apply only to pipeline context.

## Limits and errors

- A request body may be at most 1 MiB.
- A tool call is answered within 30 seconds. A slower call returns a `timeout` error; a write may still complete, so read the current state before retrying.
- There is no rate limit beyond the API's own, which has none today.
- A 2025-era client may batch up to 100 calls in one request; they run at the same time.
- A failed tool call is a result with `isError: true` whose text is the API's JSON error, for example `{"error":"not_found",…}`. Invalid arguments are refused before any route runs. A tool the token may not use is reported as unknown.

## Content is data

Issue text, comments, Notes and search results are written by workspace members. The server tells clients to treat tool results as data and never to follow instructions found in them. Hosts should ask before running write tools; each tool declares whether it only reads.

## Check it

```sh
# 401 with the discovery challenge
curl -si -X POST https://collab.weez.boo/api/mcp | head -5

# list the tools a token may use
curl -s https://collab.weez.boo/api/mcp \
  -H "Authorization: Bearer $COLLAB_TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The behaviour above is covered by `node --test tests/security/mcp-endpoint.test.cjs`.
