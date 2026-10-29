import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BookOpen, Download, FileText, GitBranch, ListChecks, Terminal } from 'lucide-react';
import { CodeBlock } from '@/components/dev/docs/CodeBlock';
import { CommandReference } from './command-reference';
import { Installation } from './installation';
import cliPackage from '../../../packages/cli/package.json';

const cliRelease = `https://github.com/Art-of-Technology/collab/releases/download/cli-v${cliPackage.version}`;
const nativeDownloads = [
  { name: 'macOS', chip: 'Apple Silicon', platform: 'darwin-arm64' },
  { name: 'macOS', chip: 'Intel', platform: 'darwin-x64' },
  { name: 'Linux', chip: 'ARM64', platform: 'linux-arm64' },
  { name: 'Linux', chip: 'Intel / AMD x64', platform: 'linux-x64' },
  { name: 'Windows', chip: 'Intel / AMD x64 (64-bit)', platform: 'windows-x64' },
  { name: 'Windows', chip: 'x86 (32-bit)', platform: 'windows-x86' },
  { name: 'Windows', chip: 'ARM64', platform: 'windows-arm64' },
];

export const metadata: Metadata = {
  title: 'Collab Docs — CLI installation & command reference',
  description: 'Install the Collab CLI, connect your workspace, and manage projects, issues and shared Notes from your terminal or coding agent.',
};

const sections = [
  ['overview', 'Overview'],
  ['installation', 'Installation'],
  ['authentication', 'Authentication'],
  ['capabilities', 'Capabilities'],
  ['search', 'Search & project context'],
  ['workflow', 'Agent workflow'],
  ['agents', 'Agent collaboration'],
  ['commands', 'Command reference'],
  ['flags', 'Flags & inputs'],
  ['automation', 'Automation'],
  ['troubleshooting', 'Troubleshooting'],
];

const capabilities = [
  { icon: ListChecks, title: 'Plan and track work', text: 'Create projects and issues, assign owners, set priorities, and follow progress.', href: '#commands' },
  { icon: FileText, title: 'Find context quickly', text: 'Search issues, Notes and activity. Get project status, blockers and owners in one response.', href: '#search' },
  { icon: GitBranch, title: 'Keep work connected', text: 'Add comments, link dependencies, record time, and read workspace reports.', href: '#commands' },
];

function TerminalBlock({ code }: { code: string }) {
  return <div className="my-5 min-w-0 [&_pre]:pt-12"><CodeBlock code={code} /></div>;
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-collab-950 text-foreground">
      <a href="#docs-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-background focus:p-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-collab-950/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/home" aria-label="Collab home">
              <Image unoptimized src="/logo-text.svg" width={100} height={26} alt="Collab" className="h-6 w-auto" />
            </Link>
            <span className="text-border" aria-hidden="true">/</span>
            <Link href="/docs" className="text-sm font-medium">Docs</Link>
          </div>
          <Link href="/" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted">
            Open Collab <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_190px]">
        <aside className="hidden border-r border-border lg:block">
          <nav aria-label="Documentation" className="sticky top-16 max-h-[calc(100dvh-4rem)] space-y-7 overflow-y-auto px-6 py-10">
            <div>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">Get started</p>
              <a href="#overview" className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-medium">
                <BookOpen className="h-4 w-4" aria-hidden="true" /> Collab CLI
              </a>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">CLI guides</p>
              {sections.slice(1).map(([id, title]) => (
                <a key={id} href={`#${id}`} className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{title}</a>
              ))}
            </div>
            <div className="border-t border-border pt-5">
              <p className="mb-3 text-xs font-semibold text-muted-foreground">Build integrations</p>
              <Link href="/dev/docs" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground">API reference <span className="text-xs">↗</span></Link>
              <p className="px-3 text-xs text-muted-foreground">Sign in to explore the API.</p>
            </div>
          </nav>
        </aside>

        <main id="docs-content" className="min-w-0 px-5 py-8 sm:px-10 lg:px-12 lg:py-12">
          <div className="mx-auto max-w-3xl">
            <details className="mb-8 rounded-lg border border-border p-4 lg:hidden">
              <summary className="cursor-pointer text-sm font-medium">On this page</summary>
              <nav aria-label="Mobile documentation" className="mt-3 grid grid-cols-2 gap-3">
                {sections.map(([id, title]) => <a key={id} href={`#${id}`} className="text-sm text-muted-foreground hover:text-foreground">{title}</a>)}
                <Link href="/dev/docs" className="text-sm text-muted-foreground hover:text-foreground">API reference</Link>
              </nav>
            </details>

            <section id="overview" className="scroll-mt-24">
              <p className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"><Terminal className="h-4 w-4" aria-hidden="true" /> Documentation / CLI</p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Collab, from your terminal.</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                Bring your projects, issues, and shared Notes into the tools you already use. One CLI for you and your coding agents.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border px-3 py-1">JSON output</span>
                <span className="rounded-full border border-border px-3 py-1">No separate runtime install</span>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-5 text-sm">
                <a href="#installation" className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2.5 font-medium text-background hover:opacity-90">Install the CLI <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
                <a href="#commands" className="text-muted-foreground hover:text-foreground">Explore commands →</a>
              </div>
            </section>

            <div className="mt-12 space-y-14 text-sm leading-7 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mb-2 [&_h3]:font-medium [&_section]:scroll-mt-24">
              <section id="installation" className="border-t border-border pt-10">
                <h2>Install the CLI</h2>
                <p className="text-muted-foreground">Paste one command into your terminal. The installer detects your machine, verifies the download, installs Collab CLI {cliPackage.version}, and sets up PATH. No Node.js, npm, Bun, or terminal restart needed.</p>
                <Installation version={cliPackage.version} />
                <details className="mt-6 rounded-lg border border-border p-4">
                  <summary className="cursor-pointer font-medium">Download archives and checksums manually</summary>
                <div className="my-5 grid gap-3 sm:grid-cols-2">
                  {nativeDownloads.map(({ name, chip, platform }) => (
                    <div key={platform} className="min-w-0 rounded-lg border border-border p-3">
                      <a href={`${cliRelease}/collab-${platform}.${platform.startsWith('windows-') ? 'zip' : 'tar.gz'}`} className="group flex items-center justify-between gap-4 font-medium hover:underline">
                        <span>{name}<span className="mt-1 block text-xs font-normal text-muted-foreground">{chip}</span></span>
                        <Download className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                      </a>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <code>{platform}</code>
                        <a href={`${cliRelease}/collab-${platform}.${platform.startsWith('windows-') ? 'zip' : 'tar.gz'}.sha256`} aria-label={`${name} ${chip} SHA-256 checksum`} className="underline underline-offset-4 hover:text-foreground">SHA-256 checksum</a>
                      </div>
                    </div>
                  ))}
                </div>
                </details>
                <p className="text-xs text-muted-foreground">These downloads do not carry a verified publisher signature. The macOS builds are not notarized. If macOS blocks the executable, follow <a href="https://support.apple.com/en-us/102445" className="underline underline-offset-4">Apple’s guidance for opening a trusted app</a> after verifying the download. <a href={`https://github.com/Art-of-Technology/collab/releases/tag/cli-v${cliPackage.version}`} className="underline underline-offset-4">Release notes and source</a> are on GitHub.</p>
                <details className="mt-6 rounded-lg border border-border p-4">
                  <summary className="cursor-pointer font-medium">Install from source with Node.js</summary>
                  <p className="mt-3 text-muted-foreground">You need Node.js 22 or later and npm. Install from a reviewed checkout; no npm registry release is required.</p>
                  <TerminalBlock code={'git clone https://github.com/Art-of-Technology/collab.git\ncd collab\nnpm install --global ./packages/cli\ncollab --help'} />
                </details>
                <details className="mt-4">
                  <summary className="cursor-pointer font-medium">Install from a package file</summary>
                  <TerminalBlock code={'# Package it from a reviewed repository checkout\nCLI_TARBALL=$(npm pack ./packages/cli --silent)\n# Install the .tgz file produced by npm pack\nnpm install --global "./$CLI_TARBALL"'} />
                </details>
              </section>

              <section id="authentication">
                <h2>Connect your workspace</h2>
                <p className="text-muted-foreground">Use your Collab server URL. Login prints a link: open it in your browser, sign in with your existing account, choose a workspace, and approve access.</p>
                <TerminalBlock code={'collab auth login --url https://collab.weez.boo\ncollab whoami\ncollab workspaces list\ncollab projects list\ncollab config set --workspace WORKSPACE_ID --project PROJECT_ID'} />
                <p className="text-muted-foreground">Replace WORKSPACE_ID and PROJECT_ID with the IDs returned by the list commands. Your selected workspace and project become the defaults for later commands.</p>
                <p className="mt-3 text-muted-foreground">For an agent that only needs to read, add <code>--read-only</code> to login. The CLI never asks for your Google or Maestro password. On a remote terminal, forward the printed loopback callback port to the machine running the CLI.</p>
                <details className="mt-5 rounded-lg border border-border p-4">
                  <summary className="cursor-pointer font-medium">Administrator setup: enable CLI login</summary>
                  <p className="mt-3 text-muted-foreground">The server needs the dedicated <code>collab-cli</code> OAuth client before anyone can log in. From the application checkout, inspect the setup first. An administrator can then apply it in the intended deployment’s existing database environment.</p>
                  <TerminalBlock code={'node scripts/setup-cli-oauth-client.mjs\n# Administrator only, after reviewing the preview\nnode scripts/setup-cli-oauth-client.mjs --apply'} />
                  <p className="text-muted-foreground">Setup creates only the dedicated app, public OAuth client, and scopes. Matching registrations are reused; conflicting registrations are refused. Users still approve their own access. Do not substitute another app’s client ID or token.</p>
                </details>
              </section>

              <section id="capabilities">
                <h2>What you can do</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {capabilities.map(({ icon: Icon, title, text, href }) => (
                    <a key={title} href={href} className="min-w-0 rounded-lg border border-border p-5 transition-colors hover:bg-muted/40">
                      <Icon className="mb-5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      <h3 className="leading-5">{title}</h3>
                      <p className="text-xs leading-6 text-muted-foreground">{text}</p>
                    </a>
                  ))}
                </div>
                <p className="mt-4 text-muted-foreground">Collab holds the plan, issue state, and project context. Keep code, pull requests, and CI in GitHub, and link them from your Collab issues. The CLI manages shared Notes; personal Notes and secrets are not exposed.</p>
              </section>

              <section id="search">
                <h2>Find what your agent needs</h2>
                <p className="text-muted-foreground">Search readable issues, shared Notes and project activity with one command. Exact issue keys take priority. Your selected workspace and project apply automatically.</p>
                <TerminalBlock code={'collab search --query "APP-123"\ncollab search --query "release pipeline" --mode keyword\ncollab search --query "authentcation" --mode fuzzy\ncollab search --query "what is blocking the release?" --mode hybrid\ncollab search --query "release" --type issue --status in_progress --limit 10 --max-tokens 8000'} />
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Search modes</caption>
                    <thead className="border-b border-border bg-muted/30"><tr><th scope="col" className="p-4">Mode</th><th scope="col" className="p-4">Use it for</th></tr></thead>
                    <tbody className="divide-y divide-border text-muted-foreground">
                      {[
                        ['exact', 'An ID, issue key, or literal phrase.'],
                        ['keyword', 'Full-text words, quoted phrases, or OR queries.'],
                        ['fuzzy', 'Misspelled words such as authentcation.'],
                        ['semantic', 'Meaning-based matches when embeddings are configured and verified.'],
                        ['hybrid (default)', 'Combined keyword and verified semantic results; explicit keyword fallback if semantic search is unavailable.'],
                      ].map(([mode, purpose]) => <tr key={mode}><th scope="row" className="p-4 font-mono font-normal text-foreground">{mode}</th><td className="p-4">{purpose}</td></tr>)}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-muted-foreground">Filter with <code>--project ID</code>, <code>--type issue|note|activity</code>, <code>--status</code>, <code>--assignee-id</code>, and ISO timestamps in <code>--after</code> / <code>--before</code>. Status and assignee filters apply to issues and their activity. Results include IDs, links, timestamps and match types.</p>
                <p className="mt-3 text-muted-foreground">Check <code>metadata.fallback</code> and <code>metadata.vectorCoverage</code>. Semantic search needs a configured embedding provider and a verified, current index; unavailable or stale coverage is reported. Hybrid can return keyword results without embeddings. Semantic-only requests fail explicitly when that capability is unavailable.</p>
                <h3 className="mt-6">A project overview in one request</h3>
                <TerminalBlock code={'collab context get --project PROJECT_ID --max-tokens 8000\ncollab context get --project PROJECT_ID --since 2026-10-01T00:00:00Z --limit 5'} />
                <p className="text-muted-foreground">Get status counts, assigned owners, blockers, dependencies, parent relationships, recent changes and relevant Notes together. Readable dependencies in other projects are included one level deep. Legacy statuses with no completion definition are labeled unknown. Personal Notes, secrets and revoked content are excluded.</p>
                <p className="mt-3 text-muted-foreground">Both commands bound the whole JSON response using a conservative UTF-8 byte estimate for <code>--max-tokens</code> (default 8,000). Search returns up to 20 results by default; context returns up to 10 per section, with a maximum of 50. Follow search’s <code>pagination.nextOffset</code>, or each context section’s own value, using <code>--offset</code>. Check truncation metadata; increase the budget if the minimum response cannot fit. Fetch a Note by ID for its complete text.</p>
                <p className="mt-3 text-muted-foreground">Without a selected project, <code>context get</code> returns bounded workspace prompts. Use <code>--include-pipeline false</code> or <code>--include-knowledge true</code> to request the previous prompt format for a project.</p>
              </section>

              <section id="workflow">
                <h2>A practical agent workflow</h2>
                <p className="text-muted-foreground">Read the project context and acceptance criteria first. Use the project’s actual status values, make the intended change, and leave a record of the result.</p>
                <TerminalBlock code={'collab context get --project PROJECT_ID\ncollab search --query "release blockers" --project PROJECT_ID\ncollab projects statuses PROJECT_ID\ncollab issues get APP-123\n\ncollab issues update APP-123 --status in_progress\ncollab comments add APP-123 --content-file progress.md\ncollab notes create --title "Reconnect decision" --type DECISION --content-file decision.md'} />
                <p className="text-muted-foreground">Create the referenced Markdown files before running commands that read them. Record tests, PR links, deployment status, and remaining work in a comment. Move an issue to done only after its acceptance criteria are met.</p>
                <p className="mt-3 text-muted-foreground">Notes created with a selected project use project scope. Updates do not move a Note to the default project; pass <code>--project-id</code> only for an intentional move. Note reads return plain text, so reading and writing back is not a rich-text round trip.</p>
              </section>

              <section id="agents">
                <h2>Agent collaboration</h2>
                <p className="text-muted-foreground">CLI {cliPackage.version} lets running agents send handoffs, watch their inbox, claim work and record progress. All matching recipients can read a handoff; only one can claim it. Use a unique name for each agent.</p>
                <p className="mt-3 text-muted-foreground">Load the <a href={`https://raw.githubusercontent.com/Art-of-Technology/collab/cli-v${cliPackage.version}/packages/cli/skills/collab-agents/SKILL.md`} className="underline underline-offset-4">generic Collab agent skill</a> through your agent’s supported skill mechanism. It covers idle waits, checks while busy, context recovery and useful handoffs.</p>
                <TerminalBlock code={'collab agents register --name builder-a --workspace WORKSPACE_ID\ncollab agents register --name reviewer-b --workspace WORKSPACE_ID\ncollab handoffs send --agent builder-a --issue APP-123 --to-agents \'["reviewer-b"]\' --content-file handoff.md --workspace WORKSPACE_ID\ncollab inbox wait --agent reviewer-b --wait-seconds 30 --workspace WORKSPACE_ID\ncollab handoffs get HANDOFF_ID --agent reviewer-b --workspace WORKSPACE_ID\ncollab handoffs claim HANDOFF_ID --agent reviewer-b --workspace WORKSPACE_ID'} />
                <p className="text-muted-foreground">Replace HANDOFF_ID with the returned ID. Write the objective, completed work, evidence links, constraints and next steps in <code>handoff.md</code>. For role subscriptions, resolve IDs with <code>collab labels list</code>, register with <code>--label-ids</code>, and send with <code>--to-labels</code>. Both flags accept a JSON array of label IDs.</p>
                <TerminalBlock code={'collab handoffs progress HANDOFF_ID --agent reviewer-b --content "Review started" --workspace WORKSPACE_ID\ncollab handoffs complete HANDOFF_ID --agent reviewer-b --content-file result.md --workspace WORKSPACE_ID\ncollab handoffs seen HANDOFF_ID --agent reviewer-b --workspace WORKSPACE_ID\ncollab issues activity APP-123 --workspace WORKSPACE_ID'} />
                <p className="text-muted-foreground">Use <code>handoffs send --after-id HANDOFF_ID</code> to finish your current handoff and pass work onward atomically. Completion closes the handoff, not the issue. ACK is optional and does not claim work. Recover unfinished ownership with <code>inbox list --state claimed</code>.</p>
                <p className="mt-3 text-muted-foreground">The issue timeline shows who picked up, progressed, passed and completed work. For workspace Agent inbox behavior and access rules, see the <a href="https://github.com/Art-of-Technology/collab/blob/main/docs/agent-handoffs.md#web-inbox" className="underline underline-offset-4">web inbox guide</a>. For automatic label handoffs and other supported delivery triggers, see <a href={`https://github.com/Art-of-Technology/collab/blob/cli-v${cliPackage.version}/packages/cli/README.md#agent-coordination`} className="underline underline-offset-4">Agent coordination</a>. It requires the matching server release and agent-handoff migration.</p>
                <h3 className="mt-6">Dedicated background workers</h3>
                <p className="text-muted-foreground">Use a dedicated worker when you want Collab to pick up handoffs automatically. It runs its own Claude Code process, leaving your interactive terminals alone. Install Claude Code and use its supported login first, then configure a new worker name with your existing Collab login.</p>
                <TerminalBlock code={'collab worker setup --agent sportsbook-worker --workspace WORKSPACE_ID --host laptop-a --cwd /absolute/repository --claude /absolute/claude\ncollab worker doctor --agent sportsbook-worker --workspace WORKSPACE_ID\ncollab worker run --agent sportsbook-worker --workspace WORKSPACE_ID'} />
                <p className="text-muted-foreground">Setup does not start work. The foreground worker claims before executing, reports evidence, and pauses on uncertain results. Defaults: one task at a time, read-only file tools, $0.50 estimated per attempt, $2 per UTC day, 15 minutes per attempt, and at most three restarts per hour. Provider cost estimates can overshoot; these are not invoice caps. Idle polling does not invoke a model.</p>
                <TerminalBlock code={'collab worker status --agent sportsbook-worker --workspace WORKSPACE_ID\ncollab worker stop --agent sportsbook-worker --workspace WORKSPACE_ID\ncollab worker setup --agent sportsbook-worker --workspace WORKSPACE_ID\ncollab worker install --agent sportsbook-worker --workspace WORKSPACE_ID --dry-run\ncollab worker install --agent sportsbook-worker --workspace WORKSPACE_ID'} />
                <p className="text-muted-foreground">Stop the foreground worker before installing its per-user startup service, then run setup to clear the explicit stop. If a service is already installed, uninstall it before setup and reinstall it afterward. Install starts it and uses launchd on macOS, systemd user services on Linux, or a user Scheduled Task on Windows. Claude Code must support the machine; a 32-bit Collab CLI alone does not establish runner support. The Agent inbox and floor distinguish an idle daemon from a working model and show usage-limit or recovery states.</p>
                <p className="mt-3 text-muted-foreground">Workers require the matching server and managed-worker migration. See the <a href={`https://github.com/Art-of-Technology/collab/blob/cli-v${cliPackage.version}/packages/cli/README.md#dedicated-managed-workers-cli-070`} className="underline underline-offset-4">worker guide</a> for budget flags, review handoffs, service removal, and recovery limits. Existing manual agents keep their current workflow.</p>
                <p className="mt-3 text-muted-foreground">For project-wide stalled-work monitoring, use the <a href={`https://github.com/Art-of-Technology/collab/blob/cli-v${cliPackage.version}/packages/cli/README.md#project-coordinator-cli-080`} className="underline underline-offset-4">project coordinator guide</a>. Explicit local setup is required; run it in the foreground or install a service. The coordinator dispatches only to configured dedicated workers, reports missing execution routes and pauses on conflicts or uncertain outcomes. An interactive agent registration alone cannot be woken automatically.</p>
                <h3 className="mt-6">Callbacks for an existing agent session</h3>
                <p className="text-muted-foreground">Keep one stable name per agent across tasks and restarts. Bind it to the current host and session; stop its old watcher before rebinding. Registration replaces role-label subscriptions, so include the full list if used.</p>
                <TerminalBlock code={'collab agents register --name builder-a --host laptop-a --session-id SESSION_ID --workspace WORKSPACE_ID\ncollab agents list --workspace WORKSPACE_ID\ncollab handoffs supersede OLD_HANDOFF_ID --agent builder-a --replacement-id CURRENT_HANDOFF_ID --content "Rerouted to the current reviewer" --workspace WORKSPACE_ID'} />
                <p className="text-muted-foreground">Supersession closes obsolete work and links its open, claimed or completed replacement on the same issue. Only the sender of open work or its current claimant may do this; another agent’s claim is protected. The old record stays in history.</p>
                <p className="text-muted-foreground">Automatic notifications need a host-supplied adapter that delivers messages into the running agent’s session. Follow the <a href={`https://github.com/Art-of-Technology/collab/blob/cli-v${cliPackage.version}/packages/cli/README.md#wake-a-running-agent-through-its-host`} className="underline underline-offset-4">host callback setup</a> to run <code>collab inbox watch</code> under the host’s supervisor and verify delivery and a model response.</p>
                <p className="mt-3 text-muted-foreground">Pass the registered <code>--host</code> and <code>--session-id</code> to the watcher to report health. The web Agent inbox and <code>agents list</code> show current host/session, watcher state, last poll and last successful callback. Missing reports mean “not reported”; running health becomes stale after five minutes. Callback success means host acceptance, not model execution. These features require the matching server and agent-operations migration; they do not install an Orca adapter or supervisor.</p>
              </section>

              <section id="commands">
                <h2>Command reference</h2>
                <p className="mb-5 text-muted-foreground">Browse the API commands below, or run <code>collab schema</code> for the full machine-readable inventory. Boolean field values are <code>true</code> or <code>false</code>; arrays use JSON.</p>
                <div className="mb-6 rounded-lg border border-border p-5">
                  <h3>Local commands</h3>
                  <dl className="space-y-3 text-muted-foreground">
                    <div><dt className="font-mono text-foreground">collab auth login / status / refresh / logout</dt><dd>Connect, inspect local login state, refresh credentials, or remove them locally.</dd></div>
                    <div><dt className="font-mono text-foreground">collab config show</dt><dd>Show the saved origin and context without displaying tokens.</dd></div>
                    <div><dt className="break-words font-mono text-foreground">collab config set --workspace ID --project ID</dt><dd>Save a verified context. Changing workspace clears the old project unless you supply a new one.</dd></div>
                    <div><dt className="font-mono text-foreground">collab schema / collab --help</dt><dd>Print commands, fields, query parameters, and scopes as JSON.</dd></div>
                    <div><dt className="font-mono text-foreground">collab worker setup / doctor / run / status / stop / install / uninstall</dt><dd>Configure and supervise a dedicated local agent, inspect usage, and manage its per-user startup service.</dd></div>
                  </dl>
                </div>
                <CommandReference />
              </section>

              <section id="flags">
                <h2>Flags and inputs</h2>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Common CLI request flags</caption>
                    <thead className="border-b border-border bg-muted/30"><tr><th scope="col" className="p-4">Flag</th><th scope="col" className="p-4">Use</th></tr></thead>
                    <tbody className="divide-y divide-border text-muted-foreground">
                      {[
                        ['--workspace ID / --project ID', 'Override the saved context for one API command.'],
                        ['--profile NAME', 'Use a separate local profile (default: default).'],
                        ['--url URL', 'Choose a server for login or a token supplied through the environment. Stored tokens stay bound to their original server.'],
                        ['--input FILE / --input -', 'Read a JSON body from a file or stdin. Use API field names such as assigneeId.'],
                        ['--content-file / --description-file', 'Read text from a file or stdin (-). Maximum input: 1 MiB, within 30 seconds.'],
                        ['--yes', 'Required for deletion. Issue deletion --dry-run reads the exact preview without --yes.'],
                        ['--all', 'Fetch every page of issues, Notes, or work logs, up to 100 pages / 10,000 items.'],
                        ['--timeout SECONDS', 'Set an API request timeout from 1 to 120 seconds (default: 30).'],
                        ['--json', 'Accepted for convenience. All output is already JSON.'],
                      ].map(([flag, description]) => <tr key={flag}><th scope="row" className="p-4 align-top font-mono text-xs font-normal text-foreground">{flag}</th><td className="p-4 align-top">{description}</td></tr>)}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-muted-foreground">For <code>--dry-run</code> behavior and privacy limits, see <a href="https://github.com/Art-of-Technology/collab/blob/main/packages/cli/README.md#commands-and-inputs" className="underline underline-offset-4">Commands and inputs</a> in the CLI package guide.</p>
                <TerminalBlock code={'collab issues create --title "Handle reconnects" --type TASK --description-file acceptance.md\ncollab projects create --name Platform --slug platform --issue-prefix PLAT --dry-run\nprintf \'%s\' \'{"assigneeId":null}\' | collab issues update APP-123 --input -\ncollab issues delete APP-123 --project PROJECT_ID --dry-run\ncollab issues delete APP-123 --project PROJECT_ID --yes\ncollab issues restore APP-123 --project PROJECT_ID'} />
                <p className="text-muted-foreground">Named flags use kebab-case (<code>--due-date</code>); JSON bodies use API field names (<code>dueDate</code>). Unknown fields, flags, and duplicate assignments are refused. Null can clear a field only where the server allows it. A required project ID for issue creation, deletion, trash listing or restoration can come from your saved context or <code>--project</code>.</p>
              </section>

              <section id="automation">
                <h2>Use it in scripts and agents</h2>
                <p className="text-muted-foreground">Successful responses are JSON on stdout. Errors are a single JSON object on stderr, with an exit code. For headless use, inject an existing Collab OAuth bearer token as <code>COLLAB_TOKEN</code> through your credential manager and set <code>COLLAB_URL</code> explicitly.</p>
                <TerminalBlock code={'# COLLAB_TOKEN is supplied by your credential manager\nexport COLLAB_URL=https://collab.weez.boo\nexport COLLAB_WORKSPACE=WORKSPACE_ID\nexport COLLAB_PROJECT=PROJECT_ID\ncollab issues list --all'} />
                <p className="text-muted-foreground">Use environment variables or per-command flags for headless context; <code>config set</code> refuses while COLLAB_TOKEN is set. Maestro tokens are not Collab API tokens. Never put tokens in command arguments, repository files, Notes, or comments.</p>
                <h3 className="mt-6">Profiles and token lifetime</h3>
                <p className="text-muted-foreground">Profiles live at <code className="break-all">~/.config/collab/PROFILE.json</code>; see the <a href="https://github.com/Art-of-Technology/collab/blob/main/packages/cli/README.md#authentication-and-automation" className="underline underline-offset-4">credential protection requirements</a>. <code>COLLAB_CONFIG_DIR</code> overrides that directory. Refresh explicitly with <code>collab auth refresh</code>; coordinate refreshes when processes share a profile.</p>
                <p className="mt-3 text-muted-foreground"><strong className="font-medium text-foreground">Logout removes local credentials only.</strong> Ask your administrator to revoke a token that must stop working elsewhere. Each new CLI login has an independent grant: signing in on another machine does not replace your existing login. Give each running agent a unique registered name. Local auth status does not prove the server accepts the token; verify with <code>collab whoami</code>.</p>
              </section>

              <section id="troubleshooting">
                <h2>Troubleshooting</h2>
                <dl className="space-y-5 text-muted-foreground">
                  <div><dt className="font-medium text-foreground">Login is unavailable</dt><dd>Check the server URL and ask your administrator to provision the dedicated CLI client. Use <code>collab auth status</code> to inspect local state and log in again if refresh requests a new login.</dd></div>
                  <div><dt className="font-medium text-foreground">A write is refused</dt><dd>Check workspace membership and whether you logged in with read-only access. Forge-backed projects retain their write restrictions; the CLI does not bypass them.</dd></div>
                  <div><dt className="font-medium text-foreground">A request times out</dt><dd>Requests are not retried automatically. After <code>outcome_unknown</code>, read the affected item or list newly created items before retrying. A timeout does not prove that a write failed. Coordinate concurrent edits; the APIs do not offer idempotency keys or compare-and-swap updates.</dd></div>
                </dl>
                <div className="mt-6 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">CLI exit codes</caption>
                    <thead className="border-b border-border bg-muted/30"><tr><th scope="col" className="px-4 py-3">Exit code</th><th scope="col" className="px-4 py-3">Meaning</th></tr></thead>
                    <tbody className="divide-y divide-border text-muted-foreground">
                      {['Success', 'Local failure; details redacted', 'Invalid command, input, or configuration', 'Authentication required or login declined', 'Server authorization refused', 'API, transport, pagination, or uncertain-write failure'].map((meaning, code) => <tr key={code}><th scope="row" className="px-4 py-3 font-mono font-normal text-foreground">{code}</th><td className="px-4 py-3">{meaning}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border py-8 text-xs text-muted-foreground">
              <span>Collab CLI documentation</span>
              <Link href="/dev/docs" className="inline-flex items-center gap-2 hover:text-foreground">Explore the API reference <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </footer>
          </div>
        </main>

        <aside className="hidden xl:block">
          <nav aria-label="On this page" className="sticky top-16 space-y-3 px-5 py-12">
            <p className="mb-4 text-xs font-medium">On this page</p>
            {sections.map(([id, title]) => <a key={id} href={`#${id}`} className="block text-xs leading-5 text-muted-foreground hover:text-foreground">{title}</a>)}
          </nav>
        </aside>
      </div>
    </div>
  );
}
