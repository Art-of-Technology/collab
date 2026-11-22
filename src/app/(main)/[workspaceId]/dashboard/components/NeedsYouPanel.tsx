import type { NeedsYouKind, NeedsYouOverview } from '@/types/workspace-dashboard';

const chips = [
  ['all', 'All'], ['question', 'Questions'], ['review', 'Reviews'], ['failed', 'Failed runs'], ['due', 'Due'],
] as const;
const labels = {
  question: { text: 'Question', color: 'text-blue-300' },
  review: { text: 'Review', color: 'text-violet-300' },
  failed: { text: 'Failed run', color: 'text-red-300' },
  due: { text: 'Due', color: 'text-amber-300' },
};
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400';
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

export default function NeedsYouPanel({ data, kind, kindHrefs, workspaceSlug, now }: {
  data: NeedsYouOverview;
  kind?: NeedsYouKind;
  kindHrefs: Record<NeedsYouKind | 'all', string>;
  workspaceSlug: string;
  now: string;
}) {
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
            const { issue, seat, pullRequestUrl } = item;
            const issueHref = `/${encodeURIComponent(workspaceSlug)}/issues/${encodeURIComponent(issue.issueKey || issue.id)}`;
            const review = item.kind === 'review' && pullRequestUrl;
            const label = labels[item.kind];
            const timestamp = new Date(item.since);
            const utc = Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
            return <li key={item.id} className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
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
              <a href={review || issueHref} target={review ? '_blank' : undefined} rel={review ? 'noopener noreferrer' : undefined}
                className={`col-start-2 w-fit rounded-md border border-collab-600 px-3 py-1.5 text-xs text-blue-300 hover:bg-collab-700 sm:col-start-auto ${focus}`}>
                {review ? 'Open pull request' : 'Open issue'}
              </a>
            </li>;
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
