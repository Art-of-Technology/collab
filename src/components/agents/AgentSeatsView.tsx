import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AgentsTabs } from '@/components/agents/AgentsTabs';
import { AgentOwnSeats } from '@/components/agents/AgentOwnSeats';
import type { SeatsView } from '@/lib/agents-page';

type Props = SeatsView & { tab: 'seats' | 'inbox'; handoffs: boolean; canManage: boolean };

const REASONS: Record<string, string> = {
  resume: 'To resume', review_returned: 'Review returned', reply: 'New reply', blocker_resolved: 'Blocker resolved', assigned: 'Assigned',
  child_done: 'Child done', child_blocked: 'Child blocked', child_idle: 'Child idle',
};

/** The Seats and the Inbox tab of the Agents page: the same seats, once as a table and once with what waits for each. */
export function AgentSeatsView({ workspace, seats, projects, tab, handoffs, canManage }: Props) {
  const base = `/${encodeURIComponent(workspace.slug || workspace.id)}`;
  const issue = (id: string, key: string | null, title: string) =>
    <Link className="text-primary underline-offset-4 hover:underline" href={`${base}/issues/${encodeURIComponent(key || id)}`}>{key && `${key} `}{title}</Link>;
  return <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
    <AgentsTabs base={base} current={tab} handoffs={handoffs} />
    <div className="flex flex-wrap items-start justify-between gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">{tab === 'seats'
        ? 'A seat is an agent that works one project in one role. It takes only the issues assigned to it.'
        : 'The issues that wait for each seat, in the order the seat takes them. An issue a seat is working on, or one that waits for a review or an answer, is not listed.'}
        {' '}Opening this page changes nothing.</p>
      <div className="flex gap-2">
        <Button asChild variant="outline"><Link href="/docs/agents/overview">About seats</Link></Button>
        {canManage && <Button asChild variant="outline"><Link href={`/workspaces/${encodeURIComponent(workspace.id)}/settings/agent-tokens`}>Create or retire a seat</Link></Button>}
      </div>
    </div>
    {tab === 'seats' && <AgentOwnSeats workspaceId={workspace.id} projects={projects} canManage={canManage} />}
    {seats.length === 0 ? <div className="space-y-2 rounded-lg border p-6">
      <h2 className="font-medium">No seats in the projects you can read</h2>
      <p className="text-sm text-muted-foreground">A seat is created under Settings, Agent tokens, by someone who may manage the workspace. <Link className="text-primary hover:underline" href="/docs/agents/create-a-seat">Create a seat</Link> shows how.</p>
    </div> : tab === 'seats' ? <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="p-3">Seat</th><th className="p-3">Role</th><th className="p-3">Project</th><th className="p-3">Owner</th><th className="p-3">Works on now</th><th className="p-3">Waiting</th></tr></thead>
        <tbody>{seats.map(seat => <tr key={seat.id} className="border-b last:border-0">
          <th scope="row" className="p-3 font-medium">{seat.name}{seat.isDefault && <span className="block text-xs font-normal text-muted-foreground">Default for its role</span>}
            {seat.noRunner && <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">No runner yet: its work waits until its owner connects a <Link className="underline" href={`${base}/agents/runners`}>runner</Link></span>}
            {seat.tokenExpired && <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">Token expired: its <Link className="underline" href={`${base}/agents/runners`}>runner</Link> has not asked since, so its work waits</span>}</th>
          <td className="p-3 capitalize">{seat.role}</td>
          <td className="p-3">{seat.project}</td>
          {/* Who pays for the seat's sessions: its owner's own sign-in, or an API key the runner holds. */}
          <td className="p-3">{seat.owner ?? <span className="text-muted-foreground">No owner (API key)</span>}</td>
          <td className="space-y-2 p-3">{seat.working.length ? seat.working.map(run => <div key={run.id}>{issue(run.issueId, run.issueKey, run.title)}
            {run.lost && <span className="block text-xs text-muted-foreground">The run is lost: clear it on the issue&apos;s Activity tab.</span>}</div>) : <span className="text-muted-foreground">Nothing</span>}</td>
          <td className="p-3">{seat.waiting.length ? <Link className="text-primary hover:underline" href={`${base}/agents/inbox#seat-${seat.id}`}>{seat.waiting.length}</Link> : <span className="text-muted-foreground">0</span>}</td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="space-y-4">{seats.map(seat => <section key={seat.id} id={`seat-${seat.id}`} aria-label={seat.name} className="space-y-2 rounded-lg border p-4">
      <h2 className="font-medium">{seat.name} <span className="text-sm font-normal text-muted-foreground"><span className="capitalize">{seat.role}</span> seat of {seat.project} · {seat.waiting.length} waiting</span></h2>
      {seat.waiting.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waits for this seat.</p> : <ol className="divide-y text-sm">
        {seat.waiting.map(item => <li key={item.issueId} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="min-w-0 break-words">{issue(item.issueId, item.issueKey, item.title)}</span>
          <span className="flex gap-2 text-xs text-muted-foreground"><span className="rounded border px-2 py-0.5">{REASONS[item.reason] ?? item.reason}</span><span className="rounded border px-2 py-0.5 capitalize">{item.priority}</span></span>
        </li>)}
      </ol>}
    </section>)}</div>}
  </main>;
}
