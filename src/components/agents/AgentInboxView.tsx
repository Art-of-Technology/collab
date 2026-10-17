import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { agentInbox } from '@/lib/agent-handoffs';

type Props = {
  workspace: { id: string; slug: string | null };
  agents: { name: string }[];
  selected?: string;
  state: 'unseen' | 'claimed';
  inbox: Awaited<ReturnType<typeof agentInbox>> | null;
};

export function AgentInboxView({ workspace, agents, selected, state, inbox }: Props) {
  const base = `/${encodeURIComponent(workspace.slug || workspace.id)}`;
  return <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Agent inbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">Monitor handoffs for agents registered with your account. Opening this page does not mark work as seen or claim it.</p></div>
      <Button asChild variant="outline"><Link href="/docs/cli#agents">Agent guide</Link></Button>
    </header>
    {agents.length === 0 ? <div className="space-y-3 rounded-lg border p-6">
      <h2 className="font-medium">Register your first agent</h2>
      <p className="text-sm text-muted-foreground">Use a unique name for each running agent, then refresh this page.</p>
      <pre className="overflow-x-auto rounded bg-muted p-3 text-sm"><code>{`collab agents register --name my-agent --workspace ${workspace.id}`}</code></pre>
      <Button asChild variant="outline"><a href={`${base}/agent-inbox`}>Refresh</a></Button>
    </div> : <>
      <form action={`${base}/agent-inbox`} method="get" className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm"><span className="block">Agent</span>
          <select name="agent" defaultValue={selected} className="h-9 rounded-md border bg-background px-3">
            {agents.map(agent => <option key={agent.name} value={agent.name}>{agent.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm"><span className="block">Queue</span>
          <select name="state" defaultValue={state} className="h-9 rounded-md border bg-background px-3">
            <option value="unseen">Unseen</option><option value="claimed">Claimed work</option>
          </select>
        </label>
        <Button type="submit">Refresh inbox</Button>
      </form>
      <p className="text-sm text-muted-foreground">The agent claims and updates work through the CLI. Open an issue to see its full handoff timeline.</p>
      {inbox?.items.length === 0 && <p className="rounded-lg border border-dashed p-6 text-muted-foreground">{state === 'claimed' ? 'No claimed work.' : 'No unseen handoffs.'}</p>}
      <div className="space-y-3">{inbox?.items.map(item => <article key={item.id} className="min-w-0 space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`${base}/issues/${encodeURIComponent(item.issue.issueKey || item.issue.id)}`}>{item.issue.issueKey} {item.issue.title}</Link>
          <span className="rounded border px-2 py-1 text-xs">{item.status}</span>
        </div>
        <p className="text-sm text-muted-foreground">From {item.sender?.name || 'System'}{item.claimedBy ? ` · Claimed by ${item.claimedBy.name}` : ''}{item.requestAck ? ' · ACK requested' : ''}</p>
        <details><summary className="cursor-pointer text-sm">Handoff details</summary>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.content}</p>
          <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{item.id}</p>
        </details>
        <time className="block text-xs text-muted-foreground" dateTime={item.createdAt.toISOString()}>{item.createdAt.toISOString()}</time>
      </article>)}</div>
      {inbox?.hasMore && <p className="text-sm text-muted-foreground">Showing the oldest 50 handoffs. Have the agent mark handled items as seen, then refresh to see the next items.</p>}
    </>}
  </main>;
}
