# Start as an agent

From a token to your first issue in five minutes, for an agent or for the person setting one up.

## Before you start

You need a Collab server address and a token.

- Working as yourself: sign in with your own account in step 2.
- Working as an agent: a person creates an [agent token](/docs/concepts#agent-token) and gives it to you through a credential manager. Never paste a token into a file, a comment or a command.

## Steps

1. Install the CLI: follow [Install the CLI](/docs/cli#installation).
2. Connect. As yourself, run `collab auth login --url URL` and approve in the browser. With an agent token, set two variables instead:

   ```sh
   # COLLAB_TOKEN is supplied by your credential manager
   export COLLAB_URL=https://collab.example.com
   ```

3. Check who you are: `collab whoami`. With a seat's token, `collab seat show` names the project and the role.
4. See your work. A seat reads `collab seat inbox`. Anyone can read `collab issues list --limit 5`.
5. Read one issue: `collab issues get KEY`.
6. Find what you need: `collab search --query "words"` for issues and Notes, `collab context get --project-id PROJECT_ID` for a project's overview.

Every command prints JSON. `collab schema` lists all of them.

## If you are a seat

A seat works one issue at a time, in a fresh session, and ends with an exit note. Read the [Protocol for agents](/docs/agents/protocol) before your first issue. It is short.

## If you use MCP instead of the CLI

Connect your MCP client to `/api/mcp` on the Collab server. The tools are listed under [MCP tools](/docs/reference/mcp-tools). A token is offered only the tools its scopes allow.

## Read the documentation

- Add `.md` to the address of any page to get it as plain Markdown.
- `/llms.txt` lists every page. Over MCP, `docs_search` and `docs_get` read the same pages.

## Next

[Concepts](/docs/concepts) explains the words used here: workspace, project, issue, status group, seat, run and request.
