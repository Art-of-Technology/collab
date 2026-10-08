import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BookOpen, Download, FileText, GitBranch, ListChecks, Terminal } from 'lucide-react';
import { CodeBlock } from '@/components/dev/docs/CodeBlock';
import { CommandReference } from './command-reference';
import cliPackage from '../../../packages/cli/package.json';

const cliRelease = `https://github.com/Art-of-Technology/collab/releases/download/cli-v${cliPackage.version}`;
const nativeDownloads = [
  { name: 'macOS', chip: 'Apple Silicon', platform: 'darwin-arm64' },
  { name: 'macOS', chip: 'Intel', platform: 'darwin-x64' },
  { name: 'Linux', chip: 'ARM64', platform: 'linux-arm64' },
  { name: 'Linux', chip: 'Intel / AMD x64', platform: 'linux-x64' },
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
  ['workflow', 'Agent workflow'],
  ['commands', 'Command reference'],
  ['flags', 'Flags & inputs'],
  ['automation', 'Automation'],
  ['troubleshooting', 'Troubleshooting'],
];

const capabilities = [
  { icon: ListChecks, title: 'Plan and track work', text: 'Create projects and issues, assign owners, set priorities, and follow progress.', href: '#commands' },
  { icon: FileText, title: 'Give agents context', text: 'Read shared Notes and knowledge. Keep decisions and runbooks alongside the work.', href: '#workflow' },
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
                <span className="rounded-full border border-border px-3 py-1">Node.js 22+</span>
                <span className="rounded-full border border-border px-3 py-1">JSON output</span>
                <span className="rounded-full border border-border px-3 py-1">No runtime dependencies</span>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-5 text-sm">
                <a href="#installation" className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2.5 font-medium text-background hover:opacity-90">Install the CLI <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
                <a href="#commands" className="text-muted-foreground hover:text-foreground">Explore commands →</a>
              </div>
            </section>

            <div className="mt-12 space-y-14 text-sm leading-7 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mb-2 [&_h3]:font-medium [&_section]:scroll-mt-24">
              <section id="installation" className="border-t border-border pt-10">
                <h2>Install the CLI</h2>
                <p className="text-muted-foreground">Download Collab CLI {cliPackage.version} for your machine. The native executable includes its runtime, so you do not need to install Node.js, npm, or Bun.</p>
                <div className="my-5 grid gap-3 sm:grid-cols-2">
                  {nativeDownloads.map(({ name, chip, platform }) => (
                    <div key={platform} className="min-w-0 rounded-lg border border-border p-5">
                      <a href={`${cliRelease}/collab-${platform}.tar.gz`} className="group flex items-center justify-between gap-4 font-medium hover:underline">
                        <span>{name}<span className="mt-1 block text-xs font-normal text-muted-foreground">{chip}</span></span>
                        <Download className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                      </a>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <code>{platform}</code>
                        <a href={`${cliRelease}/collab-${platform}.tar.gz.sha256`} aria-label={`${name} ${chip} SHA-256 checksum`} className="underline underline-offset-4 hover:text-foreground">SHA-256 checksum</a>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground">macOS 13 or later; Linux with glibc. On Windows, use a Linux download inside WSL. Run <code>uname -m</code> to check your architecture: <code>arm64</code>/<code>aarch64</code> means ARM, and <code>x86_64</code> means Intel/AMD.</p>
                <h3 className="mt-6">Verify and install</h3>
                <p className="text-muted-foreground">Download the archive and its checksum above into the same folder. Set <code>CLI_PLATFORM</code> to the label on your download card. On Linux, replace <code>shasum -a 256</code> with <code>sha256sum</code>.</p>
                <TerminalBlock code={'cd ~/Downloads\nCLI_PLATFORM=darwin-arm64\nshasum -a 256 -c "collab-$CLI_PLATFORM.tar.gz.sha256" &&\n  tar -xzf "collab-$CLI_PLATFORM.tar.gz" &&\n  mkdir -p "$HOME/.local/bin" &&\n  install -m 755 "collab-$CLI_PLATFORM/collab" "$HOME/.local/bin/collab"'} />
                <p className="text-muted-foreground">After the checksum reports OK and installation succeeds, add the command to your shell’s PATH. Add the export line to your shell profile to keep it in new terminals.</p>
                <TerminalBlock code={'export PATH="$HOME/.local/bin:$PATH"\ncollab --help'} />
                <p className="text-xs text-muted-foreground">The macOS builds are not notarized. If macOS blocks the executable, follow <a href="https://support.apple.com/en-us/102445" className="underline underline-offset-4">Apple’s guidance for opening a trusted app</a> after verifying the download. <a href={`https://github.com/Art-of-Technology/collab/releases/tag/cli-v${cliPackage.version}`} className="underline underline-offset-4">Release notes and source</a> are on GitHub.</p>
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

              <section id="workflow">
                <h2>A practical agent workflow</h2>
                <p className="text-muted-foreground">Read the project context and acceptance criteria first. Use the project’s actual status values, make the intended change, and leave a record of the result.</p>
                <TerminalBlock code={'collab context get --include-knowledge true\ncollab notes list --all\ncollab projects statuses PROJECT_ID\ncollab issues list --status todo --all\ncollab issues get APP-123\n\ncollab issues update APP-123 --status in_progress\ncollab comments add APP-123 --content-file progress.md\ncollab notes create --title "Reconnect decision" --type DECISION --content-file decision.md'} />
                <p className="text-muted-foreground">Create the referenced Markdown files before running commands that read them. Record tests, PR links, deployment status, and remaining work in a comment. Move an issue to done only after its acceptance criteria are met.</p>
                <p className="mt-3 text-muted-foreground">Notes created with a selected project use project scope. Updates do not move a Note to the default project; pass <code>--project-id</code> only for an intentional move. Note reads return plain text, so reading and writing back is not a rich-text round trip.</p>
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
                        ['--dry-run', 'Preview the method, URL, and body without sending the API request. The output may contain private content.'],
                        ['--yes', 'Required for deletion, including deletion previews.'],
                        ['--all', 'Fetch every page of issues, Notes, or work logs, up to 100 pages / 10,000 items.'],
                        ['--timeout SECONDS', 'Set an API request timeout from 1 to 120 seconds (default: 30).'],
                        ['--json', 'Accepted for convenience. All output is already JSON.'],
                      ].map(([flag, description]) => <tr key={flag}><th scope="row" className="p-4 align-top font-mono text-xs font-normal text-foreground">{flag}</th><td className="p-4 align-top">{description}</td></tr>)}
                    </tbody>
                  </table>
                </div>
                <TerminalBlock code={'collab issues create --title "Handle reconnects" --type TASK --description-file acceptance.md\ncollab projects create --name Platform --slug platform --issue-prefix PLAT --dry-run\nprintf \'%s\' \'{"assigneeId":null}\' | collab issues update APP-123 --input -\ncollab issues delete APP-123 --yes'} />
                <p className="text-muted-foreground">Named flags use kebab-case (<code>--due-date</code>); JSON bodies use API field names (<code>dueDate</code>). Unknown fields, flags, and duplicate assignments are refused. Null can clear a field only where the server allows it. A required project ID for issue creation can come from your saved context or <code>--project</code>.</p>
              </section>

              <section id="automation">
                <h2>Use it in scripts and agents</h2>
                <p className="text-muted-foreground">Successful responses are JSON on stdout. Errors are a single JSON object on stderr, with an exit code. For headless use, inject an existing Collab OAuth bearer token as <code>COLLAB_TOKEN</code> through your credential manager and set <code>COLLAB_URL</code> explicitly.</p>
                <TerminalBlock code={'# COLLAB_TOKEN is supplied by your credential manager\nexport COLLAB_URL=https://collab.weez.boo\nexport COLLAB_WORKSPACE=WORKSPACE_ID\nexport COLLAB_PROJECT=PROJECT_ID\ncollab issues list --all'} />
                <p className="text-muted-foreground">Use environment variables or per-command flags for headless context; <code>config set</code> refuses while COLLAB_TOKEN is set. Maestro tokens are not Collab API tokens. Never put tokens in command arguments, repository files, Notes, or comments.</p>
                <h3 className="mt-6">Profiles and token lifetime</h3>
                <p className="text-muted-foreground">Profiles live at <code className="break-all">~/.config/collab/PROFILE.json</code>, in a private directory (0700) with private files (0600). <code>COLLAB_CONFIG_DIR</code> overrides that directory. Refresh explicitly with <code>collab auth refresh</code>; coordinate refreshes when processes share a profile.</p>
                <p className="mt-3 text-muted-foreground"><strong className="font-medium text-foreground">Logout removes local credentials only.</strong> Ask your administrator to revoke a token that must stop working elsewhere. A new login for the same app, user, and workspace replaces that user’s previous CLI token. Use a separate authorized account for an independently managed agent.</p>
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
