import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BookOpen, CheckCircle2, Circle, FileText, GitBranch, ListChecks, Search, ShieldCheck, Terminal } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Collab — Project management for people and AI agents',
  description: 'Keep projects, issues, Notes and decisions together. Plan in Collab, then give your AI agents the same project context through the native CLI.',
};

const workflow = [
  { name: 'projects list', label: 'Find your project', code: 'collab projects list --json' },
  { name: 'issues list', label: 'Read the work', code: 'collab issues list --project-id PROJECT_ID --limit 10 --json' },
  { name: 'search', label: 'Find a decision', code: 'collab search --query "release checklist" --mode keyword --type note --json' },
  { name: 'context get', label: 'Bring context to your agent', code: 'collab context get --project-id PROJECT_ID --max-tokens 4000 --json' },
];

const capabilities = [
  { icon: ListChecks, title: 'Projects with a next step', text: 'Turn a roadmap into issues, owners, priorities and milestones. Keep dependencies and progress alongside the work.' },
  { icon: FileText, title: 'Notes that stay with the work', text: 'Keep decisions, requirements and handover context in shared Notes. Your team and agents can read and maintain them through the CLI.' },
  { icon: Search, title: 'Find the detail you need', text: 'Use exact, keyword and fuzzy search across issues, Notes and activity. Filter by project and return a bounded result set.' },
];

const linkStyle = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-collab-950 text-collab-50 [&_a]:focus-visible:outline [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-4 [&_a]:focus-visible:outline-violet-400">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-collab-800 focus:p-4">Skip to content</a>
      <header className="border-b border-collab-700">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/home" aria-label="Collab home"><Image unoptimized src="/logo-text.svg" alt="Collab" width={120} height={30} className="h-7 w-auto" /></Link>
          <div className="flex flex-wrap items-center gap-5 text-sm">
            <a href="#product" className="hidden py-2 text-collab-400 hover:text-white sm:block">Product</a>
            <a href="#agents" className="hidden py-2 text-collab-400 hover:text-white sm:block">For agents</a>
            <Link href="/docs/cli" className="py-2 text-collab-400 hover:text-white">CLI docs</Link>
            <Link href="/login" className="rounded-lg border border-collab-700 px-4 py-2.5 hover:bg-collab-800">Open Collab</Link>
          </div>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-5 sm:px-8">
        <section className="pb-14 pt-16 text-center sm:pb-20 sm:pt-24" aria-labelledby="hero-title">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Project management, shared with your agents</p>
          <h1 id="hero-title" className="mx-auto max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">Your team and your agents.<br /><span className="text-collab-400">One place for the work.</span></h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-collab-400">Plan projects, track issues and keep the decisions in Notes. Give your AI agents that same context from the terminal, so the next session starts with the work already in view.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/login" className={`${linkStyle} bg-collab-50 text-collab-950 hover:bg-white/90`}>Open your workspace <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            <Link href="/docs/cli#installation" className={`${linkStyle} border border-collab-600 hover:bg-collab-800`}><Terminal aria-hidden="true" className="h-4 w-4" /> Install the CLI</Link>
          </div>
          <p className="mt-4 text-xs text-collab-400">Native downloads for macOS, Linux and Windows. No Node.js required.</p>
        </section>

        <section id="product" aria-labelledby="product-title" className="scroll-mt-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div><p className="mb-2 text-xs font-medium uppercase tracking-widest text-violet-300">Inside Collab</p><h2 id="product-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">The plan, the work, the why.</h2></div>
            <p className="text-xs text-collab-400">Example project · illustrative data</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-collab-700 bg-collab-900 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-collab-700 px-5 py-4 sm:px-7">
              <div className="flex items-center gap-3 text-sm"><ListChecks aria-hidden="true" className="h-4 w-4 text-violet-300" /><span className="text-collab-400">Projects /</span><span>Customer portal</span></div>
              <span className="rounded-full border border-collab-600 px-3 py-1 text-xs text-collab-400">Release milestone</span>
            </div>
            <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="min-w-0 p-5 sm:p-7">
                <h3 className="mb-5 text-sm font-medium">Issues</h3>
                <ul className="space-y-3">
                  {[
                    { id: 'PORTAL-24', title: 'Make onboarding clear', state: 'In progress', owner: 'Design', done: false },
                    { id: 'PORTAL-25', title: 'Document the release checklist', state: 'Done', owner: 'Engineering', done: true },
                    { id: 'PORTAL-26', title: 'Review account permissions', state: 'To do', owner: 'Product', done: false },
                  ].map(issue => (
                    <li key={issue.id} className="flex gap-3 rounded-xl border border-collab-700 bg-collab-800 p-4">
                      {issue.done ? <CheckCircle2 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /> : <Circle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-violet-300" />}
                      <div className="min-w-0 flex-1"><p className="text-xs text-collab-400">{issue.id}</p><p className="mt-1 text-sm font-medium">{issue.title}</p><div className="mt-3 flex flex-wrap gap-3 text-xs text-collab-400"><span>{issue.state}</span><span>Owner: {issue.owner}</span></div></div>
                    </li>
                  ))}
                </ul>
              </div>
              <aside aria-label="Example project Note" className="min-w-0 border-t border-collab-700 bg-collab-950/40 p-5 sm:p-7 lg:border-l lg:border-t-0">
                <div className="mb-5 flex items-center gap-2 text-sm"><FileText aria-hidden="true" className="h-4 w-4 text-violet-300" /> Shared Notes</div>
                <h3 className="text-xl font-semibold">Release checklist</h3>
                <p className="mt-3 text-sm leading-7 text-collab-400">The decisions behind the milestone, ready for the next person or agent to pick up.</p>
                <ol className="mt-6 space-y-4 text-sm">
                  <li className="flex gap-3"><span className="text-violet-300">01</span> Verify the onboarding flow.</li>
                  <li className="flex gap-3"><span className="text-violet-300">02</span> Review permissions with the project owner.</li>
                  <li className="flex gap-3"><span className="text-violet-300">03</span> Record the result on the issue.</li>
                </ol>
                <div className="mt-7 border-t border-collab-700 pt-5 text-xs leading-6 text-collab-400">A shared place for requirements, decisions and handovers—alongside your issues.</div>
              </aside>
            </div>
          </div>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, text }) => <div key={title}><Icon aria-hidden="true" className="mb-4 h-5 w-5 text-violet-300" /><h3 className="mb-2 font-medium">{title}</h3><p className="text-sm leading-7 text-collab-400">{text}</p></div>)}
          </div>
        </section>

        <section id="agents" aria-labelledby="agents-title" className="grid scroll-mt-8 items-start gap-10 py-20 sm:py-28 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="min-w-0">
            <p className="mb-4 text-xs font-medium uppercase tracking-widest text-violet-300">Built for the terminal, too</p>
            <h2 id="agents-title" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Give your agent context.<br />Keep your team in the loop.</h2>
            <p className="mt-5 text-base leading-8 text-collab-400">Use your coding agent with Collab CLI to find the next issue, read the project context and leave a useful handover. JSON responses make the same workflow available to scripts.</p>
            <ul className="mt-7 space-y-4 text-sm leading-6 text-collab-400">
              <li className="flex gap-3"><ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /> Access follows your approved scopes and workspace permissions.</li>
              <li className="flex gap-3"><BookOpen aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /> Read issues and Notes before changing anything. Bound project context with a token budget.</li>
              <li className="flex gap-3"><GitBranch aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /> Keep code and pull requests in GitHub; keep planning, decisions and progress in Collab.</li>
            </ul>
            <Link href="/docs/cli#workflow" className="mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-violet-300 hover:text-violet-200">Explore the agent workflow <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div>
          <figure className="min-w-0 overflow-hidden rounded-2xl border border-collab-600 bg-collab-900 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-collab-700 px-5 py-4 text-xs text-collab-400"><span className="flex items-center gap-2"><Terminal aria-hidden="true" className="h-4 w-4" /> collab / terminal</span><span>Read-only examples</span></div>
            <div className="space-y-6 p-5 sm:p-7">
              {workflow.map(step => <div key={step.name}><p className="mb-2 font-mono text-xs text-collab-400"># {step.label}</p><pre tabIndex={0} aria-label={step.label} className="min-w-0 overflow-x-auto rounded py-1 font-mono text-xs leading-6 text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 sm:text-sm"><code data-cli-example={step.name}>{step.code}</code></pre></div>)}
            </div>
            <figcaption className="border-t border-collab-700 px-5 py-4 text-xs leading-6 text-collab-400">Illustrative workflow. Sign in and select your workspace first; replace PROJECT_ID with an ID returned by projects list. These commands read data and do not start an autonomous agent.</figcaption>
          </figure>
        </section>

        <section aria-labelledby="start-title" className="mb-20 rounded-2xl border border-collab-700 bg-collab-900 p-6 sm:p-10">
          <div className="flex flex-col justify-between gap-7 md:flex-row md:items-center">
            <div><h2 id="start-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Start with one project.</h2><p className="mt-3 max-w-xl text-sm leading-7 text-collab-400">Install the CLI, approve your workspace and read the work already there. Bring your agent when you are ready.</p></div>
            <Link href="/docs/cli#installation" className={`${linkStyle} shrink-0 bg-collab-50 text-collab-950 hover:bg-white/90`}>Get the CLI <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div>
          <div className="mt-8 grid gap-5 border-t border-collab-700 pt-7 text-sm sm:grid-cols-3">
            <div><p className="font-medium">01 / Install</p><p className="mt-2 leading-6 text-collab-400">One-command installers for macOS / Linux and Windows PowerShell.</p></div>
            <div><p className="font-medium">02 / Connect</p><code className="mt-2 block break-words text-xs leading-6 text-collab-400">collab auth login --url https://collab.weez.boo</code></div>
            <div><p className="font-medium">03 / Explore</p><Link href="/docs/cli#commands" className="mt-2 inline-flex min-h-11 items-center gap-2 text-violet-300 hover:text-violet-200">Browse the command reference <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></div>
          </div>
          <p className="mt-7 text-xs leading-6 text-collab-400">Search availability: exact, keyword and fuzzy retrieval are supported; semantic search requires a configured embedding provider and index. Hybrid results report semantic availability rather than silently claiming vector matches.</p>
          <details className="mt-7 border-t border-collab-700 pt-5 text-sm text-collab-400">
            <summary className="cursor-pointer py-2 font-medium text-collab-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400">Do I need Coclaw to use the CLI?</summary>
            <p className="mt-3 max-w-3xl leading-7">No. Your existing coding agent can use the CLI directly. Coclaw is an optional built-in assistant for tasks, connected messaging channels and persistent memory; using the CLI does not start Coclaw. Coclaw execution requires an enabled deployment and a configured provider.</p>
          </details>
        </section>
      </main>
      <footer className="border-t border-collab-700">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-7 text-xs text-collab-400 sm:px-8"><p>Collab by Weezboo · Shared work. Shared context.</p><div className="flex flex-wrap gap-6"><Link href="/docs/cli" className="py-2 hover:text-white">CLI documentation</Link><Link href="/login" className="py-2 hover:text-white">Open Collab</Link></div></div>
      </footer>
    </div>
  );
}
