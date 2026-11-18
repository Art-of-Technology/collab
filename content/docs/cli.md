# Collab CLI

Install the Collab CLI, connect your workspace, and manage projects, issues and shared Notes from your terminal or coding agent.

## Overview {#overview}

Bring your projects, issues, and shared Notes into the tools you already use. One CLI for you and your coding agents.

- All output is JSON.
- No separate runtime to install.
- Start with [Install the CLI](#installation), or go straight to the [command reference](#commands).

## Install the CLI {#installation}

Paste one command into your terminal. The installer detects your machine, verifies the download, installs Collab CLI 0.14.3, and sets up PATH. No Node.js, npm, Bun, or terminal restart needed.

1. Run the command for your operating system.

   Windows, in PowerShell. Windows 10+ (x64 / x86), Windows 11+ (ARM64), PowerShell 5.1+. Installs to `%LOCALAPPDATA%\Collab\bin`.

   ```powershell
   irm https://collab.weez.boo/install.ps1 | iex
   ```

   macOS and Linux, in Bash or Zsh. macOS 13 or later on Apple Silicon or Intel; Linux with glibc on ARM64 or x64. Installs to `~/.local/bin`.

   ```sh
   ZDOTDIR="${ZDOTDIR:-$HOME}" bash -o pipefail -c 'curl -fsSL https://collab.weez.boo/install.sh | sh' && . "$HOME/.local/share/collab/env"
   ```

   Your current terminal is ready immediately; future terminals keep the command too.

2. Verify the install.

   ```sh
   collab --help
   ```

   Seeing the command list? You're ready to log in.

3. [Connect your workspace](#authentication).

**Already installed?** Run the same install command to update. Your saved login is preserved. No administrator access or terminal restart needed.

### Download archives and checksums manually

| Platform | Archive | Checksum |
| --- | --- | --- |
| macOS, Apple Silicon | [darwin-arm64](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-darwin-arm64.tar.gz) | [SHA-256](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-darwin-arm64.tar.gz.sha256) |
| macOS, Intel | [darwin-x64](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-darwin-x64.tar.gz) | [SHA-256](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-darwin-x64.tar.gz.sha256) |
| Linux, ARM64 | [linux-arm64](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-linux-arm64.tar.gz) | [SHA-256](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-linux-arm64.tar.gz.sha256) |
| Linux, Intel / AMD x64 | [linux-x64](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-linux-x64.tar.gz) | [SHA-256](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-linux-x64.tar.gz.sha256) |
| Windows, Intel / AMD x64 (64-bit) | [windows-x64](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-windows-x64.zip) | [SHA-256](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-windows-x64.zip.sha256) |
| Windows, x86 (32-bit) | [windows-x86](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-windows-x86.zip) | [SHA-256](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-windows-x86.zip.sha256) |
| Windows, ARM64 | [windows-arm64](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-windows-arm64.zip) | [SHA-256](https://github.com/Art-of-Technology/collab/releases/download/cli-v0.14.3/collab-windows-arm64.zip.sha256) |

These downloads do not carry a verified publisher signature. The macOS builds are not notarized. If macOS blocks the executable, follow [Apple's guidance for opening a trusted app](https://support.apple.com/en-us/102445) after verifying the download. [Release notes and source](https://github.com/Art-of-Technology/collab/releases/tag/cli-v0.14.3) are on GitHub.

### Which Windows download do I need?

The installer chooses automatically. For manual downloads, open Settings → System → About → System type. Choose x86 for a 32-bit operating system and x64 for a 64-bit Intel/AMD operating system. Choose ARM64 for an ARM-based processor on Windows 11 or later. A 32-bit PowerShell window on 64-bit Windows still installs the matching x64 or ARM64 executable.

### Install from source with Node.js

You need Node.js 22 or later and npm. Install from a reviewed checkout; no npm registry release is required.

```sh
git clone https://github.com/Art-of-Technology/collab.git
cd collab
npm install --global ./packages/cli
collab --help
```

### Install from a package file

```sh
# Package it from a reviewed repository checkout
CLI_TARBALL=$(npm pack ./packages/cli --silent)
# Install the .tgz file produced by npm pack
npm install --global "./$CLI_TARBALL"
```

## Connect your workspace {#authentication}

Use your Collab server URL. Login prints a link: open it in your browser, sign in with your existing account, choose a workspace, and approve access.

```sh
collab auth login --url https://collab.weez.boo
collab whoami
collab workspaces list
collab projects list
collab config set --workspace WORKSPACE_ID --project PROJECT_ID
```

Replace WORKSPACE_ID and PROJECT_ID with the IDs returned by the list commands. Your selected workspace and project become the defaults for later commands.

For an agent that only needs to read, add `--read-only` to login. The CLI never asks for your Google or Maestro password. On a remote terminal, forward the printed loopback callback port to the machine running the CLI.

### Administrator setup: enable CLI login

The server needs the dedicated `collab-cli` OAuth client before anyone can log in. From the application checkout, inspect the setup first. An administrator can then apply it in the intended deployment's existing database environment.

```sh
node scripts/setup-cli-oauth-client.mjs
# Administrator only, after reviewing the preview
node scripts/setup-cli-oauth-client.mjs --apply
```

Setup creates only the dedicated app, public OAuth client, and scopes. Matching registrations are reused; conflicting registrations are refused. Users still approve their own access. Do not substitute another app's client ID or token.

## What you can do {#capabilities}

- **Plan and track work.** Create projects and issues, assign owners, set priorities, and follow progress. See the [command reference](#commands).
- **Find context quickly.** Search issues, Notes and activity. Get project status, blockers and owners in one response. See [search and project context](#search).
- **Keep work connected.** Add comments, link dependencies, record time, and read workspace reports. See the [command reference](#commands).

Collab holds the plan, issue state, and project context. Keep code, pull requests, and CI in GitHub, and link them from your Collab issues. The CLI manages shared Notes; personal Notes and secrets are not exposed.

## Find what your agent needs {#search}

Search readable issues, shared Notes and project activity with one command. Exact issue keys take priority. Your selected workspace and project apply automatically.

```sh
collab search --query "APP-123"
collab search --query "release pipeline" --mode keyword
collab search --query "authentcation" --mode fuzzy
collab search --query "what is blocking the release?" --mode hybrid
collab search --query "release" --type issue --status in_progress --limit 10 --max-tokens 8000
```

| Mode | Use it for |
| --- | --- |
| `exact` | An ID, issue key, or literal phrase. |
| `keyword` | Full-text words, quoted phrases, or OR queries. |
| `fuzzy` | Misspelled words such as authentcation. |
| `semantic` | Meaning-based matches when embeddings are configured and verified. |
| `hybrid` (default) | Combined keyword and verified semantic results; explicit keyword fallback if semantic search is unavailable. |

Filter with `--project ID`, `--type issue|note|activity`, `--status`, `--assignee-id`, and ISO timestamps in `--after` / `--before`. Status and assignee filters apply to issues and their activity. Results include IDs, links, timestamps and match types.

Check `metadata.fallback` and `metadata.vectorCoverage`. Semantic search needs a configured embedding provider and a verified, current index; unavailable or stale coverage is reported. Hybrid can return keyword results without embeddings. Semantic-only requests fail explicitly when that capability is unavailable.

### A project overview in one request

```sh
collab context get --project PROJECT_ID --max-tokens 8000
collab context get --project PROJECT_ID --since 2026-10-01T00:00:00Z --limit 5
```

Get status counts, assigned owners, blockers, dependencies, parent relationships, recent changes and relevant Notes together. Readable dependencies in other projects are included one level deep. Legacy statuses with no completion definition are labeled unknown. Personal Notes, secrets and revoked content are excluded.

Both commands bound the whole JSON response using a conservative UTF-8 byte estimate for `--max-tokens` (default 8,000). Search returns up to 20 results by default; context returns up to 10 per section, with a maximum of 50. Follow search's `pagination.nextOffset`, or each context section's own value, using `--offset`. Check truncation metadata; increase the budget if the minimum response cannot fit. Fetch a Note by ID for its complete text.

Without a selected project, `context get` returns bounded workspace prompts. Use `--include-pipeline false` or `--include-knowledge true` to request the previous prompt format for a project.

## A practical agent workflow {#workflow}

Read the project context and acceptance criteria first. Use the project's actual status values, make the intended change, and leave a record of the result.

```sh
collab context get --project PROJECT_ID
collab search --query "release blockers" --project PROJECT_ID
collab projects statuses PROJECT_ID
collab issues get APP-123

collab issues update APP-123 --status in_progress
collab comments add APP-123 --content-file progress.md
collab notes create --title "Reconnect decision" --type DECISION --content-file decision.md
```

Create the referenced Markdown files before running commands that read them. Record tests, PR links, deployment status, and remaining work in a comment. Move an issue to done only after its acceptance criteria are met.

Notes created with a selected project use project scope. Updates do not move a Note to the default project; pass `--project-id` only for an intentional move. Note reads return plain text, so reading and writing back is not a rich-text round trip.

## Agent collaboration {#agents}

CLI 0.14.3 lets running agents send handoffs, watch their inbox, claim work and record progress. All matching recipients can read a handoff; only one can claim it. Use a unique name for each agent.

Load the [generic Collab agent skill](https://raw.githubusercontent.com/Art-of-Technology/collab/cli-v0.14.3/packages/cli/skills/collab-agents/SKILL.md) through your agent's supported skill mechanism. It covers idle waits, checks while busy, context recovery and useful handoffs.

```sh
collab agents register --name builder-a --workspace WORKSPACE_ID
collab agents register --name reviewer-b --workspace WORKSPACE_ID
collab handoffs send --agent builder-a --issue APP-123 --to-agents '["reviewer-b"]' --content-file handoff.md --workspace WORKSPACE_ID
collab inbox wait --agent reviewer-b --wait-seconds 30 --workspace WORKSPACE_ID
collab handoffs get HANDOFF_ID --agent reviewer-b --workspace WORKSPACE_ID
collab handoffs claim HANDOFF_ID --agent reviewer-b --workspace WORKSPACE_ID
```

For `handoffs send`, `--agent` is the sender's registered name; `--to-agents` names the recipients. Provide at least one recipient or role label. Both `--to-agents` and `--to-labels` take JSON arrays. Sending queues a handoff; it does not wake the recipient or claim work.

Replace HANDOFF_ID with the returned ID. Write the objective, completed work, evidence links, constraints and next steps in `handoff.md`. For role subscriptions, resolve IDs with `collab labels list`, register with `--label-ids`, and send with `--to-labels`. Both flags accept a JSON array of label IDs.

```sh
collab handoffs progress HANDOFF_ID --agent reviewer-b --content "Review started" --workspace WORKSPACE_ID
collab handoffs complete HANDOFF_ID --agent reviewer-b --content-file result.md --workspace WORKSPACE_ID
collab handoffs seen HANDOFF_ID --agent reviewer-b --workspace WORKSPACE_ID
collab issues activity APP-123 --workspace WORKSPACE_ID
```

Use `handoffs send --after-id HANDOFF_ID` to finish your current handoff and pass work onward atomically. Completion closes the handoff, not the issue. ACK is optional and does not claim work. Recover unfinished ownership with `inbox list --state claimed`.

The issue timeline shows who picked up, progressed, passed and completed work. The app shows handoffs under **Agents** in the left menu, on the tab **Handoffs (old)**, while a project in the workspace still uses them. For its behavior and access rules, see the [web inbox guide](https://github.com/Art-of-Technology/collab/blob/main/docs/agent-handoffs.md#web-inbox). For automatic label handoffs and other supported delivery triggers, see [Agent coordination](https://github.com/Art-of-Technology/collab/blob/cli-v0.14.3/packages/cli/README.md#agent-coordination). It requires the matching server release and agent-handoff migration.

### Dedicated background workers

Use a dedicated worker when you want Collab to pick up handoffs automatically. It runs its own Claude Code process, leaving your interactive terminals alone. Install Claude Code and use its supported login first, then configure a new worker name with your existing Collab login.

```sh
collab worker setup --agent sportsbook-worker --workspace WORKSPACE_ID --host laptop-a --cwd /absolute/repository --claude /absolute/claude
collab worker doctor --agent sportsbook-worker --workspace WORKSPACE_ID
collab worker run --agent sportsbook-worker --workspace WORKSPACE_ID
```

Setup does not start work. The foreground worker claims before executing, reports evidence, and pauses on uncertain results. Defaults: one task at a time, read-only file tools, $0.50 estimated per attempt, $2 per UTC day, 15 minutes per attempt, and at most three restarts per hour. Provider cost estimates can overshoot; these are not invoice caps. Idle polling does not invoke a model.

```sh
collab worker status --agent sportsbook-worker --workspace WORKSPACE_ID
collab worker stop --agent sportsbook-worker --workspace WORKSPACE_ID
collab worker setup --agent sportsbook-worker --workspace WORKSPACE_ID
collab worker install --agent sportsbook-worker --workspace WORKSPACE_ID --dry-run
collab worker install --agent sportsbook-worker --workspace WORKSPACE_ID
```

Stop the foreground worker before installing its per-user startup service, then run setup to clear the explicit stop. If a service is already installed, uninstall it before setup and reinstall it afterward. Install starts it and uses launchd on macOS, systemd user services on Linux, or a user Scheduled Task on Windows. Claude Code must support the machine; a 32-bit Collab CLI alone does not establish runner support. The Agent inbox and floor distinguish an idle daemon from a working model and show usage-limit or recovery states.

Workers require the matching server and managed-worker migration. See the [worker guide](https://github.com/Art-of-Technology/collab/blob/cli-v0.14.3/packages/cli/README.md#dedicated-managed-workers-cli-070) for budget flags, review handoffs, service removal, and recovery limits. Existing manual agents keep their current workflow.

For project-wide stalled-work monitoring, use the [project coordinator guide](https://github.com/Art-of-Technology/collab/blob/cli-v0.14.3/packages/cli/README.md#project-coordinator-cli-080). Explicit local setup is required; run it in the foreground or install a service. The coordinator dispatches only to configured dedicated workers, reports missing execution routes and pauses on conflicts or uncertain outcomes. An interactive agent registration alone cannot be woken automatically.

### Callbacks for an existing agent session

Keep one stable name per agent across tasks and restarts. Bind it to the current host and session; stop its old watcher before rebinding. Registration replaces role-label subscriptions, so include the full list if used.

```sh
collab agents register --name builder-a --host laptop-a --session-id SESSION_ID --workspace WORKSPACE_ID
collab agents list --workspace WORKSPACE_ID
collab handoffs supersede OLD_HANDOFF_ID --agent builder-a --replacement-id CURRENT_HANDOFF_ID --content "Rerouted to the current reviewer" --workspace WORKSPACE_ID
```

Supersession closes obsolete work and links its open, claimed or completed replacement on the same issue. Only the sender of open work or its current claimant may do this; another agent's claim is protected. The old record stays in history.

Automatic notifications need a host-supplied adapter that delivers messages into the running agent's session. Follow the [host callback setup](https://github.com/Art-of-Technology/collab/blob/cli-v0.14.3/packages/cli/README.md#wake-a-running-agent-through-its-host) to run `collab inbox watch` under the host's supervisor and verify delivery and a model response.

Pass the registered `--host` and `--session-id` to the watcher to report health. The **Handoffs (old)** tab of the app's **Agents** page and `agents list` show current host/session, watcher state, last poll and last successful callback. Missing reports mean "not reported"; running health becomes stale after five minutes. Callback success means host acceptance, not model execution. These features require the matching server and agent-operations migration; they do not install an Orca adapter or supervisor.

## Flags and inputs {#flags}

| Flag | Use |
| --- | --- |
| `--workspace ID` / `--project ID` | Override the saved context for one API command. |
| `--profile NAME` | Use a separate local profile (default: default). |
| `--url URL` | Choose a server for login or a token supplied through the environment. Stored tokens stay bound to their original server. |
| `--input FILE` / `--input -` | Read a JSON body from a file or stdin. Use API field names such as assigneeId. |
| `--content-file` / `--description-file` | Read text from a file or stdin (-). Maximum input: 1 MiB, within 30 seconds. |
| `--yes` | Required for deletion. Issue deletion `--dry-run` reads the exact preview without `--yes`. |
| `--all` | Fetch every page of issues, Notes, or work logs, up to 100 pages / 10,000 items. |
| `--timeout SECONDS` | Set an API request timeout from 1 to 120 seconds (default: 30). |
| `--json` | Accepted for convenience. All output is already JSON. |

For `--dry-run` behavior and privacy limits, see [Commands and inputs](https://github.com/Art-of-Technology/collab/blob/main/packages/cli/README.md#commands-and-inputs) in the CLI package guide.

```sh
collab issues create --title "Handle reconnects" --type TASK --description-file acceptance.md
collab projects create --name Platform --slug platform --issue-prefix PLAT --dry-run
printf '%s' '{"assigneeId":null}' | collab issues update APP-123 --input -
collab issues delete APP-123 --project PROJECT_ID --dry-run
collab issues delete APP-123 --project PROJECT_ID --yes
collab issues restore APP-123 --project PROJECT_ID
```

Named flags use kebab-case (`--due-date`); JSON bodies use API field names (`dueDate`). Unknown fields, flags, and duplicate assignments are refused. Null can clear a field only where the server allows it. A required project ID for issue creation, deletion, trash listing or restoration can come from your saved context or `--project`.

## Use it in scripts and agents {#automation}

Successful responses are JSON on stdout. Errors are a single JSON object on stderr, with an exit code. For headless use, inject an existing Collab OAuth bearer token as `COLLAB_TOKEN` through your credential manager and set `COLLAB_URL` explicitly.

```sh
# COLLAB_TOKEN is supplied by your credential manager
export COLLAB_URL=https://collab.weez.boo
export COLLAB_WORKSPACE=WORKSPACE_ID
export COLLAB_PROJECT=PROJECT_ID
collab issues list --all
```

Use environment variables or per-command flags for headless context; `config set` refuses while COLLAB_TOKEN is set. Maestro tokens are not Collab API tokens. Never put tokens in command arguments, repository files, Notes, or comments.

### Profiles and token lifetime

Profiles live at `~/.config/collab/PROFILE.json`; see the [credential protection requirements](https://github.com/Art-of-Technology/collab/blob/main/packages/cli/README.md#authentication-and-automation). `COLLAB_CONFIG_DIR` overrides that directory. Refresh explicitly with `collab auth refresh`; coordinate refreshes when processes share a profile.

**Logout removes local credentials only.** Ask your administrator to revoke a token that must stop working elsewhere. Each new CLI login has an independent grant: signing in on another machine does not replace your existing login. Give each running agent a unique registered name. Local auth status does not prove the server accepts the token; verify with `collab whoami`.

## Troubleshooting

### Login is unavailable

Check the server URL and ask your administrator to provision the dedicated CLI client. Use `collab auth status` to inspect local state and log in again if refresh requests a new login.

### A write is refused

Check workspace membership and whether you logged in with read-only access. Forge-backed projects retain their write restrictions; the CLI does not bypass them.

### A request times out

Requests are not retried automatically. After `outcome_unknown`, read the affected item or list newly created items before retrying. A timeout does not prove that a write failed. Coordinate concurrent edits; the APIs do not offer idempotency keys or compare-and-swap updates.

### Exit codes

| Exit code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Local failure; details redacted |
| 2 | Invalid command, input, or configuration |
| 3 | Authentication required or login declined |
| 4 | Server authorization refused |
| 5 | API, transport, pagination, or uncertain-write failure |

## Command reference {#commands}

Every API command, with its arguments and flags, is in the [CLI command reference](/docs/reference/cli-commands). Run `collab schema` for the same inventory as JSON. Boolean field values are `true` or `false`; arrays use JSON.

| Local command | What it does |
| --- | --- |
| `collab auth login / status / refresh / logout` | Connect, inspect local login state, refresh credentials, or remove them locally. |
| `collab config show` | Show the saved origin and context without displaying tokens. |
| `collab config set --workspace ID --project ID` | Save a verified context. Changing workspace clears the old project unless you supply a new one. |
| `collab schema` / `collab --help` | Print commands, fields, query parameters, and scopes as JSON. |
| `collab worker setup / doctor / run / status / stop / install / uninstall` | Configure and supervise a dedicated local agent, inspect usage, and manage its per-user startup service. |
