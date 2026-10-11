import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import AgentHero from './AgentHero';
import { Button } from '@/components/ui/button';
import styles from './agent-hero.module.css';
import { ArrowRight, CheckCircle2, Circle, FileText, ListChecks, Search } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Collab — Project management for people and AI agents',
  description: 'Keep projects, issues, Notes and decisions together. Plan in Collab, then give your AI agents the same project context through the native CLI.',
};

const capabilities = [
  { icon: ListChecks, title: 'Projects with a next step', text: 'Turn a roadmap into issues, owners, priorities and milestones. Keep dependencies and progress alongside the work.' },
  { icon: FileText, title: 'Notes that stay with the work', text: 'Keep decisions, requirements and handover context in shared Notes. Your team and agents can read and maintain them through the CLI.' },
  { icon: Search, title: 'Find the detail you need', text: 'Use exact, keyword and fuzzy search across issues, Notes and activity. Filter by project and return a bounded result set.' },
];

export default function LandingPage() {
  return (
    <div className={`${styles.page} min-h-screen bg-collab-950 text-collab-50`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-collab-800 focus:p-4">Skip to content</a>
      <header className="border-b border-collab-700">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/home" aria-label="Collab home"><Image unoptimized src="/logo-text.svg" alt="Collab" width={120} height={30} className="h-7 w-auto" /></Link>
          <div className="flex flex-wrap items-center gap-5 text-sm">
            <a href="#product" className="hidden py-2 text-collab-400 hover:text-white sm:block">Product</a>
            <a href="#agents" className="hidden py-2 text-collab-400 hover:text-white sm:block">For agents</a>
            <Link href="/docs/cli" className="py-2 text-collab-400 hover:text-white">CLI docs</Link>
            <Button asChild variant="outline" className="h-10"><Link href="/login">Open Collab</Link></Button>
          </div>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-5 sm:px-8">
        <AgentHero />

        <section id="product" aria-labelledby="product-title" className="scroll-mt-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div><p className="mb-2 text-xs font-medium uppercase tracking-widest text-collab-400">Inside Collab</p><h2 id="product-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Issues, owners and decisions in one place.</h2></div>
            <p className="text-xs text-collab-400">Example project · illustrative data</p>
          </div>
          <div className="overflow-hidden rounded-lg border border-collab-700 bg-collab-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-collab-700 px-5 py-4 sm:px-7">
              <div className="flex items-center gap-3 text-sm"><ListChecks aria-hidden="true" className="h-4 w-4 text-collab-400" /><span className="text-collab-400">Projects /</span><span>Customer portal</span></div>
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
                    <li key={issue.id} className="flex gap-3 rounded-md border border-collab-700 bg-collab-800 p-4">
                      {issue.done ? <CheckCircle2 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /> : <Circle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-collab-400" />}
                      <div className="min-w-0 flex-1"><p className="text-xs text-collab-400">{issue.id}</p><p className="mt-1 text-sm font-medium">{issue.title}</p><div className="mt-3 flex flex-wrap gap-3 text-xs text-collab-400"><span>{issue.state}</span><span>Owner: {issue.owner}</span></div></div>
                    </li>
                  ))}
                </ul>
              </div>
              <aside aria-label="Example project Note" className="min-w-0 border-t border-collab-700 bg-collab-950/40 p-5 sm:p-7 lg:border-l lg:border-t-0">
                <div className="mb-5 flex items-center gap-2 text-sm"><FileText aria-hidden="true" className="h-4 w-4 text-collab-400" /> Shared Notes</div>
                <h3 className="text-xl font-semibold">Release checklist</h3>
                <p className="mt-3 text-sm leading-7 text-collab-400">The decisions behind the milestone, ready for the next person or agent to pick up.</p>
                <ol className="mt-6 space-y-4 text-sm">
                  <li className="flex gap-3"><span className="text-collab-400">01</span> Verify the onboarding flow.</li>
                  <li className="flex gap-3"><span className="text-collab-400">02</span> Review permissions with the project owner.</li>
                  <li className="flex gap-3"><span className="text-collab-400">03</span> Record the result on the issue.</li>
                </ol>
                <div className="mt-7 border-t border-collab-700 pt-5 text-xs leading-6 text-collab-400">A shared place for requirements, decisions and handovers—alongside your issues.</div>
              </aside>
            </div>
          </div>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, text }) => <div key={title}><Icon aria-hidden="true" className="mb-4 h-5 w-5 text-collab-400" /><h3 className="mb-2 font-medium">{title}</h3><p className="text-sm leading-7 text-collab-400">{text}</p></div>)}
          </div>
        </section>

        <section aria-labelledby="start-title" className="mb-20 mt-20 rounded-lg border border-collab-700 bg-collab-900 p-6 sm:p-10">
          <div className="flex flex-col justify-between gap-7 md:flex-row md:items-center">
            <div><h2 id="start-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Start with one project.</h2><p className="mt-3 max-w-xl text-sm leading-7 text-collab-400">Install the CLI, approve your workspace and read the work already there. Bring your agent when you are ready.</p></div>
            <Button asChild variant="primary" size="lg" className="h-11 shrink-0 bg-blue-600 hover:bg-blue-700"><Link href="/docs/cli#installation">Install the CLI <ArrowRight aria-hidden="true" /></Link></Button>
          </div>
          <div className="mt-8 grid gap-5 border-t border-collab-700 pt-7 text-sm sm:grid-cols-3">
            <div><p className="font-medium">01 / Install</p><p className="mt-2 leading-6 text-collab-400">One-command installers for macOS / Linux and Windows PowerShell.</p></div>
            <div><p className="font-medium">02 / Connect</p><code className="mt-2 block break-words text-xs leading-6 text-collab-400">collab auth login --url https://collab.weez.boo</code></div>
            <div><p className="font-medium">03 / Explore</p><Link href="/docs/cli#commands" className="mt-2 inline-flex min-h-11 items-center gap-2 text-collab-400 hover:text-collab-50">Browse the command reference <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></div>
          </div>
          <p className="mt-7 text-xs leading-6 text-collab-400">Search availability: exact, keyword and fuzzy retrieval are supported; semantic search requires a configured embedding provider and index. Hybrid results report semantic availability rather than silently claiming vector matches.</p>
          <details className="mt-7 border-t border-collab-700 pt-5 text-sm text-collab-400">
            <summary className="cursor-pointer py-2 font-medium text-collab-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400">Do I need Coclaw to use the CLI?</summary>
            <p className="mt-3 max-w-3xl leading-7">No. Your existing coding agent can use the CLI directly. Coclaw is an optional built-in assistant for tasks, connected messaging channels and persistent memory; using the CLI does not start Coclaw. Coclaw execution requires an enabled deployment and a configured provider.</p>
          </details>
        </section>
      </main>
      <footer className="border-t border-collab-700">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-7 text-xs text-collab-400 sm:px-8"><p>Collab by Weezboo · Shared work. Shared context.</p><div className="flex flex-wrap gap-6"><Link href="/docs/cli" className="py-2 hover:text-white">CLI documentation</Link><Link href="/login" className="py-2 hover:text-white">Open Collab</Link></div></div>
      </footer>
    </div>
  );
}
