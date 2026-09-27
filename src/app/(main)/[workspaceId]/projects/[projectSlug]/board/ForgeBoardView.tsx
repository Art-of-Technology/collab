'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { ForgeBoard } from '@/lib/forge/board';
import { needsAttention, taskStatuses, type ForgeTask, type TaskStatus } from '@/lib/forge/tasks';
import { refreshForgeBoard } from './actions';

const labels: Record<TaskStatus, string> = { backlog: 'Backlog', 'in-progress': 'In progress', waiting: 'Waiting', blocked: 'Blocked', done: 'Done' };

export function ForgeBoardView({ initial, workspaceSlug, projectSlug }: {
  initial: Exclude<ForgeBoard, { kind: 'denied' }>;
  workspaceSlug: string;
  projectSlug: string;
}) {
  const [board, setBoard] = useState<ForgeBoard>(initial);
  const [refreshError, setRefreshError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'board' | 'list' | 'attention'>('board');
  const [status, setStatus] = useState<TaskStatus | 'all'>('all');
  const [selected, setSelected] = useState<number | null>(null);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const ready = board.kind === 'ready' ? board : null;
  const tasks = ready?.tasks.filter(task =>
    (status === 'all' || task.status === status) &&
    (view !== 'attention' || needsAttention(task, ready.today)) &&
    `${task.number} ${task.title} ${task.owner} ${task.nextAction}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const current = ready?.tasks.find(task => task.number === selected);
  const refresh = () => startTransition(async () => {
    try {
      const next = await refreshForgeBoard(workspaceSlug, projectSlug);
      if (next.kind === 'unavailable' && ready) setRefreshError(true);
      else { setBoard(next); setRefreshError(false); if (next.kind !== 'ready') setSelected(null); }
    } catch { setRefreshError(true); }
  });
  const card = (task: ForgeTask) => <button key={task.number} type="button" onClick={event => { selectedButton.current = event.currentTarget; setSelected(task.number); }}
    className="w-full min-w-0 rounded-xl border border-collab-700 bg-collab-900 p-4 text-left transition-colors hover:border-collab-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-collab-400">
      <span>#{task.number}</span><Badge variant="outline">{labels[task.status]}</Badge>
      {task.priority !== 'normal' && <Badge variant="secondary">{task.priority} priority</Badge>}
    </div>
    <p className="break-words font-medium text-collab-50">{task.title}</p>
    <p className="mt-2 break-words text-sm text-collab-400">{task.owner || 'Unassigned'}</p>
    {task.nextAction && <p className="mt-2 break-words text-sm text-collab-50">Next: {task.nextAction}</p>}
    {(task.dueDate || task.followUpDate) && <p className="mt-3 text-xs text-collab-400">
      {task.dueDate && <span className="mr-3">Due {task.dueDate}</span>}
      {task.followUpDate && <span>Follow up {task.followUpDate}</span>}
    </p>}
    {task.warning && <p className="mt-2 text-sm text-amber-300">{task.warning}</p>}
  </button>;

  return <div className="h-full overflow-y-auto p-4 pb-32 text-collab-50 md:p-8 md:pb-32">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link className="text-sm text-collab-400 underline underline-offset-4" href={`/${workspaceSlug}/projects`}>Projects</Link>
          <h1 className="mt-2 break-words text-2xl font-semibold">{board.kind === 'denied' ? 'Project unavailable' : board.projectName}</h1>
          <p className="mt-1 text-sm text-collab-400">Project work and follow-ups</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href={`/${workspaceSlug}/projects/${projectSlug}/notes`}>Project notes</Link></Button>
          <Button variant="outline" onClick={refresh} disabled={pending}>{pending ? 'Refreshing…' : 'Refresh'}</Button>
        </div>
      </header>
      <div aria-live="polite" className="text-sm text-collab-400">
        {refreshError ? <p role="alert" className="rounded-lg border border-amber-400/40 p-3 text-amber-300">{ready ? 'Refresh failed. Showing the last loaded issues; try Refresh again.' : 'Refresh failed. Try Refresh again.'}</p> :
          ready && <p>Read-only · {ready.tasks.length} issues · Updated {new Date(ready.fetchedAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })} London time</p>}
      </div>
      {board.kind === 'denied' && <p role="alert">You no longer have access to this project.</p>}
      {board.kind === 'not-connected' && <div className="rounded-xl border border-collab-700 bg-collab-800 p-6">
        <h2 className="font-medium">Project connection is not ready</h2>
        <p className="mt-2 text-sm text-collab-400">A workspace owner must finish verifying the project connection before issues can be shown here.</p>
      </div>}
      {board.kind === 'unavailable' && <div role="alert" className="rounded-xl border border-collab-700 bg-collab-800 p-6">
        <h2 className="font-medium">Could not load project issues</h2><p className="mt-2 text-sm text-collab-400">Try Refresh. If this continues, ask a workspace owner to check the connection.</p>
      </div>}
      {ready && <>
        {ready.truncated && <p role="status" className="rounded-lg border border-amber-400/40 p-3 text-sm text-amber-300">Only the first 1,000 source records were loaded. Counts and filters cover this partial view.</p>}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Issue view">
            {(['board', 'list', 'attention'] as const).map(mode => <Button key={mode} variant={view === mode ? 'secondary' : 'outline'} aria-pressed={view === mode} onClick={() => setView(mode)}>
              {mode === 'board' ? 'Board' : mode === 'list' ? 'List' : 'Needs attention'}
            </Button>)}
          </div>
          <label className="min-w-[min(100%,12rem)] flex-1 space-y-1 text-sm">Search issues
            <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, owner or next action" />
          </label>
          <label className="space-y-1 text-sm">Status
            <select className="block h-10 rounded-md border border-collab-700 bg-collab-800 px-3 text-collab-50" value={status} onChange={event => setStatus(event.target.value as TaskStatus | 'all')}>
              <option value="all">All statuses</option>{taskStatuses.map(value => <option key={value} value={value}>{labels[value]}</option>)}
            </select>
          </label>
        </div>
        {tasks.length === 0 ? <div className="rounded-xl border border-collab-700 p-8 text-center">
          <h2 className="font-medium">{ready.tasks.length ? 'No issues match this view' : 'No project issues yet'}</h2>
          <p className="mt-2 text-sm text-collab-400">{ready.tasks.length ? 'Change the filters or search to see other issues.' : 'Existing issues will appear here when they are added to the connected project.'}</p>
        </div> : view === 'board' ? <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {taskStatuses.filter(value => status === 'all' || value === status).map(value => <section key={value} aria-label={labels[value]} className="min-w-0 rounded-xl border border-collab-700 bg-collab-800 p-3">
            <h2 className="mb-3 flex items-center justify-between font-medium">{labels[value]} <span className="text-sm text-collab-400">{tasks.filter(task => task.status === value).length}</span></h2>
            <div className="space-y-3">{tasks.filter(task => task.status === value).map(card)}</div>
          </section>)}
        </div> : <div className="grid gap-3 md:grid-cols-2">{tasks.map(card)}</div>}
      </>}
      <Dialog open={Boolean(current)} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={event => { if (selectedButton.current?.isConnected) { event.preventDefault(); selectedButton.current.focus(); } }}>
          {current && <><DialogHeader><DialogTitle className="break-words">#{current.number} {current.title}</DialogTitle>
            <DialogDescription>{labels[current.status]} · {current.priority} priority · {current.owner || 'Unassigned'}</DialogDescription></DialogHeader>
            {current.warning && <p role="status" className="text-sm text-amber-300">{current.warning}</p>}
            <p className="whitespace-pre-wrap break-words text-sm">{current.description || 'No description yet.'}</p>
            {current.nextAction && <p className="break-words text-sm"><strong>Next action:</strong> {current.nextAction}</p>}
            <p className="text-sm text-muted-foreground">{current.comments} comments on the source issue. Editing and comments are not available in this view yet.</p>
            {current.sourceUrl && <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">Open source discussion</a>}
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  </div>;
}
