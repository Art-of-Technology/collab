'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { NeedsYouItem, NeedsYouKind, NeedsYouOverview } from '@/types/workspace-dashboard';

const chips = [
  ['all', 'All'], ['question', 'From seats'], ['review', 'Reviews'], ['failed', 'Failed runs'], ['due', 'Due'],
] as const;
const labels = {
  question: { text: 'Question', color: 'text-blue-300' },
  waiting: { text: 'Waiting on you', color: 'text-collab-400' },
  failed: { text: 'Failed run', color: 'text-red-300' },
  due: { text: 'Due', color: 'text-amber-300' },
};
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400';
const actionStyle = `w-fit rounded-md border border-collab-600 px-3 py-1.5 text-xs text-blue-300 hover:bg-collab-700 disabled:opacity-50 ${focus}`;
const rowActionStyle = `col-start-2 sm:col-start-auto ${actionStyle}`;
const primaryStyle = `w-fit rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50 ${focus}`;
const formStyle = 'col-span-full min-w-0 space-y-2 rounded-md border border-collab-600 bg-collab-900 p-3 sm:col-start-2 sm:col-end-4';
const format = (count: number) => count.toLocaleString('en-GB');
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

function rowAge(timestamp: number, reference: number, due: boolean) {
  const difference = timestamp - reference;
  const elapsed = Math.abs(difference);
  if (due && difference >= 0) {
    const daysAhead = Math.floor(timestamp / day) - Math.floor(reference / day);
    if (daysAhead === 0) return 'due today';
    if (daysAhead === 1) return 'due tomorrow';
  }
  if (!due && elapsed < minute) return difference > 0 ? 'soon' : 'just now';

  const duration = elapsed >= day ? `${Math.floor(elapsed / day)} d`
    : elapsed >= hour ? `${Math.floor(elapsed / hour)} h`
    : `${Math.max(1, Math.floor(elapsed / minute))} min`;
  return difference > 0 ? `${due ? 'due ' : ''}in ${duration}` : `${duration} ago`;
}

async function answerStatus(url: string, item: NeedsYouItem, workspaceSlug: string, response: Response) {
  const sent = 'Answer sent.';
  if (!item.seat) return sent;
  try {
    const { authorId } = await response.json();
    if (!authorId) return sent;
    const [current, activity] = await Promise.all([
      fetch(url, { cache: 'no-store' }),
      fetch(`${url}/activities?action=AGENT_RUN_FINISHED&limit=1`, { cache: 'no-store' }),
    ]);
    if (!current.ok || !activity.ok) return sent;

    const { issue } = await current.json();
    const [finish] = await activity.json();
    // The finish records the seat ID and its account. The issue read gives the current assignee.
    if (issue?.id === item.issue.id && issue.projectId === item.issue.project.id
      && (issue.workspace?.slug || issue.workspaceId) === workspaceSlug
      && finish?.details?.seatId === item.seat.id && finish.user?.id
      && finish.user.id === issue.assigneeId && finish.user.id !== authorId) {
      return `${sent} ${item.seat.name} will pick it up.`;
    }
  } catch {
    // The comment has already been saved, even if assignment verification fails.
  }
  return sent;
}

function NeedsYouRow({ item, workspaceSlug, reference, open, onToggle, onComplete }: {
  item: NeedsYouItem;
  workspaceSlug: string;
  reference: number;
  open: boolean;
  onToggle: () => void;
  onComplete: (message: string) => void;
}) {
  const { issue, seat, pullRequestUrl } = item;
  const issueHref = `/${encodeURIComponent(workspaceSlug)}/issues/${encodeURIComponent(issue.issueKey || issue.id)}`;
  const issueApi = `/api/issues/${encodeURIComponent(issue.id)}`;
  const review = item.kind === 'review' && pullRequestUrl;
  const seatRow = item.kind === 'question' || item.kind === 'review';
  const label = seatRow ? (item.ask === 'none' ? labels.waiting : labels.question) : item.kind === 'failed' ? labels.failed : labels.due;
  const replyHref = item.replyOn ? `/${encodeURIComponent(workspaceSlug)}/issues/${encodeURIComponent(item.replyOn.id)}` : null;
  const timestamp = new Date(item.since);
  const utc = Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();

  const actionId = useId();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const answer = seatRow && item.ask === 'here';
  // Both actions name the run the row shows: the server acts only while that run is still what the row says it is.
  const action = item.runId && (answer || item.kind === 'failed') ? `runs/${encodeURIComponent(item.runId)}/${answer ? 'reply' : 'clear'}` : null;
  const actionable = item.canAct && action && !submitted;
  const showDetails = !actionable && seatRow && !!item.question && !submitted;
  const options = item.suggested ? [item.suggested, ...item.options.filter(option => option !== item.suggested)] : item.options;
  const question = item.question && <p className="whitespace-pre-wrap break-words text-sm text-collab-50">
    {seat && <strong className="block">From {seat.name}</strong>}{item.question}
  </p>;
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionable || !open || submitting.current) return;
    const content = draft.trim();
    if (answer && !content) {
      setError('Type an answer first.');
      return;
    }
    const fallback = answer ? 'The answer could not be sent. Try again.' : 'The run could not be cleared. Try again.';
    submitting.current = true;
    setPending(true);
    setError('');
    const response = await fetch(`${issueApi}/${action}`, answer
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }
      : { method: 'POST' }).catch(() => null);
    if (!response?.ok) {
      const details = await response?.json().catch(() => null);
      const message = details?.error_description || details?.error;
      setError(typeof message === 'string' && message ? message : fallback);
      submitting.current = false;
      setPending(false);
      return;
    }
    setSubmitted(true);
    onComplete(answer ? await answerStatus(issueApi, item, workspaceSlug, response) : 'Run cleared.');
  }

  return <li className={`grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center ${(actionable || showDetails) && open ? 'bg-blue-950/20' : ''}`}>
    <span className={`text-xs font-medium ${label.color}`}>{label.text}</span>
    <div className="min-w-0">
      <p className="break-words text-sm font-medium text-collab-50">{issue.title}</p>
      <p className="mt-1 break-words text-xs text-collab-400">
        {issue.issueKey && <>{issue.issueKey} · </>}{issue.project.name}{seat && <> · from {seat.name}</>}
        {' · '}{utc
          ? <time dateTime={utc} title={utc}>{rowAge(timestamp.getTime(), reference, item.kind === 'due')}</time>
          : <span>Not recorded</span>}
      </p>
    </div>
    {actionable
      ? <button type="button" ref={trigger} aria-expanded={open} aria-controls={open ? actionId : undefined}
        className={answer ? `col-start-2 sm:col-start-auto ${primaryStyle}` : rowActionStyle} onClick={onToggle}>
        {answer ? (open ? 'Close' : 'Answer') : 'Session has stopped: clear run'}
      </button>
      : <div className="col-start-2 flex flex-wrap gap-2 sm:col-start-auto sm:justify-end">
        <a href={replyHref ?? issueHref} className={actionStyle}>
          {item.replyOn ? `Open ${item.replyOn.issueKey}` : 'Open issue'}
        </a>
        {showDetails && <button type="button" className={actionStyle} aria-expanded={open}
          aria-controls={open ? actionId : undefined} onClick={onToggle}>
          {open ? 'Hide details' : 'Show details'}
        </button>}
      </div>}
    {review && <a href={review} target="_blank" rel="noopener noreferrer" className={`col-start-2 text-xs text-blue-300 hover:underline ${focus}`}>
      Open pull request
    </a>}
    {showDetails && open && <div id={actionId} className={formStyle}>{question}</div>}
    {actionable && open && <form id={actionId} className={formStyle} onSubmit={submit}>
      {answer ? <>
        {question}
        <div className="flex flex-wrap gap-2">
          {options.map(option => <button key={option} type="button" aria-pressed={draft === option} disabled={pending}
            className={`${actionStyle} aria-pressed:border-blue-400 aria-pressed:bg-blue-950/40`} onClick={() => {
              setDraft(option);
              setError('');
            }}>
            {option}{option === item.suggested && <span className="ml-1 text-collab-300"> Suggested</span>}
          </button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="text" name="answer" aria-label="Your answer" placeholder="Type your answer"
            className={`min-w-0 flex-1 basis-36 rounded-md border border-collab-600 bg-collab-800 px-3 py-1.5 text-sm text-collab-50 ${focus}`}
            value={draft} onChange={event => setDraft(event.target.value)} disabled={pending} />
          <button type="submit" className={primaryStyle} disabled={pending}>{pending ? 'Sending…' : 'Send answer'}</button>
        </div>
      </> : <>
        <p className="text-sm text-collab-50">Confirm that you checked that the old session has stopped.</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={actionStyle} disabled={pending}>{pending ? 'Clearing…' : 'Confirm clear run'}</button>
          <button type="button" className={actionStyle} disabled={pending} onClick={() => {
            setError('');
            onToggle();
            trigger.current?.focus();
          }}>Cancel</button>
        </div>
      </>}
      {error && <p role="alert" className="break-words text-xs text-red-300">{error}</p>}
    </form>}
  </li>;
}

export default function NeedsYouPanel({ data, kind, kindHrefs, workspaceSlug, now }: {
  data: NeedsYouOverview;
  kind?: NeedsYouKind;
  kindHrefs: Record<NeedsYouKind | 'all', string>;
  workspaceSlug: string;
  now: string;
}) {
  const router = useRouter();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const total = data.kind === 'ready' ? Object.values(data.counts).reduce((sum, count) => sum + count, 0) : null;
  const selected = kind ?? 'all';
  const visibleTotal = data.kind === 'ready' && kind ? data.counts[kind] : total;
  const reference = Date.parse(now);

  return <section id="needs-you" aria-labelledby="needs-you-title" className="min-w-0 overflow-hidden rounded-xl border border-collab-600 bg-collab-800">
    <header className="border-b border-collab-600 px-5 py-4">
      <h2 id="needs-you-title" className="text-base font-medium text-collab-50">
        Needs you{total !== null && <> <span className="ml-1 tabular-nums text-collab-400">{format(total)}</span></>}
      </h2>
    </header>
    <div role="status">{status && <p className="border-b border-collab-600 px-5 py-3 text-sm text-emerald-300">{status}</p>}</div>
    {data.kind === 'ready' ? <>
      <nav aria-label="Needs you filters" className="flex flex-wrap gap-2 px-5 py-3">
        {chips.map(([value, label]) => <a
          key={value} href={kindHrefs[value]} aria-current={selected === value ? 'page' : undefined}
          className={`rounded-full border px-3 py-1 text-xs tabular-nums hover:bg-collab-700 ${focus} ${selected === value
            ? 'border-blue-400 bg-blue-950/40 text-blue-200' : 'border-collab-600 text-collab-400'}`}
        >{label} {format(value === 'all' ? total ?? 0 : data.counts[value])}</a>)}
      </nav>
      {data.items.length === 0 ? <p className="border-t border-collab-600 px-5 py-6 text-sm text-collab-400">Nothing is waiting on you.</p> :
        <ul className="divide-y divide-collab-600 border-t border-collab-600">
          {data.items.map(item => {
            const rowKey = `${item.id}:${item.runId ?? item.since}`;
            return <NeedsYouRow key={rowKey} item={item} workspaceSlug={workspaceSlug} reference={reference} open={openRow === rowKey}
              onToggle={() => setOpenRow(current => current === rowKey ? null : rowKey)}
              onComplete={message => {
                setOpenRow(current => current === rowKey ? null : current);
                setStatus(message);
                router.refresh();
              }} />;
          })}
        </ul>}
      {visibleTotal !== null && visibleTotal > data.items.length &&
        <p className="border-t border-collab-600 px-5 py-3 text-xs text-collab-400">Showing {format(data.items.length)} of {format(visibleTotal)}</p>}
    </> : <div className="space-y-3 px-5 py-6 text-sm">
      <p className="text-collab-400">{data.kind === 'denied' ? "You don't have permission to view issues." : 'Needs you is temporarily unavailable.'}</p>
      {data.kind === 'unavailable' && <a href={`${kindHrefs[selected]}#needs-you`} className={`rounded-sm text-blue-300 hover:underline ${focus}`}>Reload Needs you</a>}
    </div>}
  </section>;
}
