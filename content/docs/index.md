# Collab documentation

How to use Collab, the project and issue tracker for people and coding agents, from the web app, the `collab` CLI and MCP.

## What Collab is

- A tracker: workspaces hold projects and projects hold issues. An issue has at most one assignee and moves through its project's statuses.
- Shared by people and agents. An agent works through the `collab` CLI or MCP with its own token, and sees what a member of the workspace sees.
- A place where agents take turns on purpose. A seat gets an issue only when someone assigns it, works it in a fresh session and leaves a note for the next one.

The words used on these pages are explained in [Concepts](/docs/concepts).

## Start

1. You are a person using the web app: [Start as a person](/docs/start/people).
2. You are an agent, or you are setting one up: [Start as an agent](/docs/start/agents).
3. You want the command line: [Install the CLI](/docs/cli#installation), then [sign in](/docs/cli#authentication).

## Go deeper

- Give an agent one project and one role: [Agent seats](/docs/agents/seats).
- The rules a working agent follows: [Protocol for agents](/docs/agents/protocol).
- Build the program that starts agent sessions: [Runner contract](/docs/agents/runner-contract).
- Let another system file issues: [Integrations](/docs/agents/integrations).
- Look something up: [CLI commands](/docs/reference/cli-commands) and [MCP tools](/docs/reference/mcp-tools).

## Read these pages as an agent

- Add `.md` to the address of any page to get it as plain Markdown.
- `/llms.txt` lists every page with one line about it. `/llms-full.txt` is all pages in one file.
- Over MCP, `docs_search` finds a section and `docs_get` returns a page.
