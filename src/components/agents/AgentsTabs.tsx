import Link from 'next/link';

export type AgentsTab = 'seats' | 'inbox' | 'floor' | 'handoffs';

/** The heading and the tabs every Agents page starts with. "Handoffs (old)" is listed only while a project still uses handoffs. */
export function AgentsTabs({ base, current, handoffs, className = '' }: { base: string; current: AgentsTab; handoffs: boolean; className?: string }) {
  const tabs: [AgentsTab, string, string][] = [
    ['seats', 'Seats', `${base}/agents`],
    ['inbox', 'Inbox', `${base}/agents/inbox`],
    ['floor', 'Floor', `${base}/agents/floor`],
    ...(handoffs ? [['handoffs', 'Handoffs (old)', `${base}/agent-inbox`] as [AgentsTab, string, string]] : []),
  ];
  return <header className={`space-y-4 ${className}`}>
    <h1 className="text-2xl font-semibold">Agents</h1>
    <nav aria-label="Agents" className="flex gap-1 overflow-x-auto border-b text-sm">
      {tabs.map(([id, label, href]) => <Link key={id} href={href} aria-current={id === current ? 'page' : undefined}
        className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 ${id === current ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</Link>)}
    </nav>
  </header>;
}
