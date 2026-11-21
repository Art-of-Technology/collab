import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AgentsTabs } from '@/components/agents/AgentsTabs';
import { AgentOwnSeats } from '@/components/agents/AgentOwnSeats';
import type { SeatsView } from '@/lib/agents-page';

type Props = SeatsView & { tab: 'seats' | 'inbox'; handoffs: boolean };
type Seat = SeatsView['seats'][number];
type Shown = NonNullable<Seat['room']>;

const REASONS: Record<string, string> = {
  resume: 'To resume', review_returned: 'Review returned', reply: 'New reply', blocker_resolved: 'Blocker resolved', assigned: 'Assigned',
  child_done: 'Child done', child_blocked: 'Child blocked', child_idle: 'Child idle', child_no_room: 'Child on a full seat',
};

/** What one line can say for several seats: their room reads the same when this does. */
const figure = (room: Shown) => room.kind === 'room' ? `${room.room} ${room.program}` : `${room.kind} ${room.reason}`;

/** A seat's room as room left: a bar with the percent and the program, "no room" or "unknown", each with why. The label says the bar in words. */
function Room({ room }: { room: Shown }) {
  if (room.kind === 'unknown') return <span className="flex flex-wrap items-center gap-2"><span className="rounded border px-2 py-0.5 text-xs">unknown</span><span className="text-xs text-muted-foreground">{room.reason}</span></span>;
  const percent = room.kind === 'room' ? room.room : 0;
  const why = room.kind === 'room' ? room.program && `next run on ${room.program}` : room.reason;
  return <span role="img" aria-label={[percent ? `${percent} percent room` : 'no room', why].filter(Boolean).join(', ')} className="flex flex-wrap items-center gap-2">
    <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
      <span className={`block h-full rounded-full ${percent >= 30 ? 'bg-emerald-500' : percent >= 10 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${percent}%` }} />
    </span>
    <span className="whitespace-nowrap text-sm">{percent ? `${percent}% room` : 'no room'}</span>
    {why && <span className="text-xs text-muted-foreground">{why}</span>}
  </span>;
}

/** The Seats and the Inbox tab of the Agents page: the same seats, once grouped by the person who owns them and once with what waits for each. */
export function AgentSeatsView({ workspace, seats, projects, tab, handoffs, canManage }: Props) {
  // One card per person. A person's seats run on one runner, so one figure most often says it for all of them.
  const owners = new Map<string | null, Seat[]>();
  for (const seat of seats) owners.set(seat.ownerId, [...(owners.get(seat.ownerId) ?? []), seat]);
  const people = [...owners.values()].sort((a, b) => +!a[0].owner - +!b[0].owner || (a[0].owner ?? '').localeCompare(b[0].owner ?? ''));
  const base = `/${encodeURIComponent(workspace.slug || workspace.id)}`;
  const issue = (id: string, key: string | null, title: string) =>
    <Link className="text-primary underline-offset-4 hover:underline" href={`${base}/issues/${encodeURIComponent(key || id)}`}>{key && `${key} `}{title}</Link>;
  return <main className="w-full space-y-6 p-6">
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
    </div> : tab === 'seats' ? <div className="space-y-4">{people.map(own => {
      const [{ ownerId, owner, runner, room }] = own;
      // Seats that read differently each show their own figure instead of one bar for the person.
      const one = !!room && new Set(own.map(seat => seat.room && figure(seat.room))).size === 1;
      // Seats that are all unknown differ only in why: the card says "unknown" once and each seat keeps its reason.
      const unknown = !one && own.every(seat => seat.room?.kind === 'unknown');
      // The heading says who pays for the seats' sessions: the person's own sign-in, or an API key the runner holds.
      return <section key={ownerId ?? ''} aria-label={owner ?? 'No owner (API key)'} className="rounded-lg border">
      <div className="space-y-2 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">{owner ?? 'No owner (API key)'}</h2>
          <span className="text-sm text-muted-foreground">{runner ?? 'no runner'}</span>
        </div>
        {!room ? <p className="text-sm text-muted-foreground">Room private</p> : one ? <Room room={room} />
          : unknown ? <Room room={{ kind: 'unknown', reason: '' }} />
          : <p className="text-sm text-muted-foreground">These seats do not have the same room: each shows its own.</p>}
      </div>
      <div className="overflow-x-auto border-t">
      {/* The same widths in every card, so the columns line up down the page. */}
      <table className="w-full min-w-[40rem] table-fixed text-left text-sm">
        <thead><tr className="border-b"><th className="w-2/5 p-3">Seat</th><th className="w-1/5 p-3">Project</th><th className="p-3">Works on now</th><th className="w-24 p-3">Waiting</th></tr></thead>
        <tbody>{own.map(seat => <tr key={seat.id} className="border-b last:border-0">
          <th scope="row" className="space-y-1 p-3 font-medium"><span className="mr-2 rounded border px-2 py-0.5 text-xs font-normal">{seat.role}{seat.isDefault && ' · default'}</span>{seat.name}
            {!one && seat.room && <span className="block font-normal">{unknown && seat.room.kind === 'unknown'
              ? <span className="text-xs text-muted-foreground">{seat.room.reason}</span> : <Room room={seat.room} />}</span>}
            {seat.noRunner && <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">No runner yet: its work waits until its owner connects a <Link className="underline" href={`${base}/agents/runners`}>runner</Link></span>}
            {seat.tokenExpired && <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">Token expired: its <Link className="underline" href={`${base}/agents/runners`}>runner</Link> has not asked since, so its work waits</span>}</th>
          <td className="p-3">{seat.project}</td>
          <td className="space-y-2 p-3">{seat.working.length ? seat.working.map(run => <div key={run.id}>{issue(run.issueId, run.issueKey, run.title)}
            {run.lost && <span className="block text-xs text-muted-foreground">The run is lost: clear it on the issue&apos;s Activity tab.</span>}</div>) : <span className="text-muted-foreground">Nothing</span>}</td>
          <td className="p-3">{seat.waiting.length ? <Link className="text-primary hover:underline" href={`${base}/agents/inbox#seat-${seat.id}`}>{seat.waiting.length}</Link> : <span className="text-muted-foreground">0</span>}</td>
        </tr>)}</tbody>
      </table>
      </div>
      </section>;
    })}
      <p className="text-sm text-muted-foreground">Room is how much allowance a seat has left before its runner stops taking work. Each runner reports it. {canManage
        ? 'You see every person\'s room; a member sees their own.' : 'You see your own room; other people\'s is private.'}</p>
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
