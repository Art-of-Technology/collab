"use client";

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUpdateIssue } from '@/hooks/queries/useIssues';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/permission-types';
import type { ProjectSummary } from '@/hooks/queries/useProjects';
import { cn } from '@/lib/utils';

type Overview = ProjectSummary['overview'];
type Milestone = Overview['plan']['milestones'][number];

const DAY = 86_400_000;
const NEXT_WEEKS = 56;
const dateLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const baselineDateLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const controlStyle = 'h-auto rounded-lg border-white/[.09] bg-collab-800 px-3 py-1.5 text-[13px] font-normal text-collab-50 hover:bg-collab-700';
const cardStyle = 'min-w-0 rounded-[10px] border-white/[.09] bg-collab-800 p-3';
const chipStyle = 'rounded-full border border-white/[.09] px-2 py-px text-[11px] text-collab-400';
const fieldStyle = 'grid content-start gap-1 text-[13px] text-collab-400';
const titleOf = ({ issueKey, title }: Milestone) => issueKey ? `${issueKey} · ${title}` : title;
const stateStyle = {
  done: { label: 'Done', color: '#34d399', track: 'rgba(52,211,153,.22)', chip: 'border-emerald-400/40 text-emerald-400' },
  running: { label: 'In progress', color: '#60a5fa', track: 'rgba(96,165,250,.25)', chip: 'border-blue-400/40 text-blue-400' },
  planned: { label: 'Planned', color: '#9c9ca1', track: 'rgba(156,156,161,.22)', chip: '' },
  decision: { label: 'Decision point', color: '#a78bfa', track: '', chip: 'text-violet-400' },
};

function planLink(base: string, id: string) {
  return `${base}?tab=plan&milestone=${encodeURIComponent(id)}`;
}

export function BaselineControl({ overview, projectId, refetch, showHistory = true }: {
  overview: Overview;
  projectId: string;
  refetch: () => Promise<unknown>;
  showHistory?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { baselineAt } = overview;

  async function freeze() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/baseline`, { method: 'POST' });
      if (!response.ok) throw new Error('Could not set baseline');
      setConfirming(false);
      await refetch();
    } catch {
      setError('Could not update the baseline. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showHistory && <BaselineHistory overview={overview} />}
      {confirming ? (
        <>
          <span className="text-[13px]">Freeze today&apos;s dates as the {baselineAt ? 'new baseline' : 'baseline'}?</span>
          <Button type="button" className={cn(controlStyle, 'border-blue-500 bg-blue-500 text-white hover:bg-blue-600')}
            disabled={saving} onClick={freeze}>{saving ? 'Freezing…' : 'Freeze'}</Button>
          <Button type="button" variant="outline" className={cn(controlStyle, 'bg-transparent')}
            disabled={saving} onClick={() => setConfirming(false)}>Cancel</Button>
        </>
      ) : (
        <Button type="button" variant="outline" className={controlStyle}
          disabled={saving || !overview.plan.milestones.some(milestone =>
            !milestone.invalidDates && (milestone.startDate || milestone.dueDate))}
          onClick={() => { setError(''); setConfirming(true); }}>
          {baselineAt ? 'Re-baseline' : 'Set baseline'}
        </Button>
      )}
      {error && <p role="alert" className="text-[13px] text-red-400">{error}</p>}
    </div>
  );
}

function BaselineHistory({ overview }: { overview: Overview }) {
  if (!overview.baselineAt) return null;
  return (
    <span className="text-[13px] text-collab-400">
      Baseline set <time dateTime={overview.baselineAt}>{baselineDateLabel.format(new Date(overview.baselineAt))}</time>
      {overview.baselineSetBy && ` by ${overview.baselineSetBy}`}
    </span>
  );
}

function MilestoneChart({ milestones, today, nextWeeks, showBaseline, compact, selected, open, href }: {
  milestones: Milestone[];
  today: number;
  nextWeeks: boolean;
  showBaseline: boolean;
  compact?: boolean;
  selected?: string;
  open?: (id: string) => void;
  href?: (id: string) => string;
}) {
  const dated = milestones.flatMap(milestone => milestone.start === null || milestone.end === null
    ? [] : [{ ...milestone, start: milestone.start, end: milestone.end }]);
  const until = today + NEXT_WEEKS;
  const rows = nextWeeks ? dated.filter(row => row.start <= until && Math.max(row.end, row.forecast ?? row.end) >= today) : dated;
  if (!rows.length) {
    return <p className="py-2 text-[13px] text-collab-400">{nextWeeks ? 'No milestones in the next 8 weeks.' : 'No milestones with chartable dates.'}</p>;
  }

  const width = compact ? 520 : 1000;
  const labels = compact ? 128 : 236;
  const rowHeight = compact ? 26 : 30;
  const top = 24;
  const height = top + rowHeight * rows.length + 18;
  let from = nextWeeks ? today - 14 : today;
  let to = nextWeeks ? until : today;
  if (!nextWeeks) {
    for (const row of rows) {
      from = Math.min(from, row.start, row.baselineStart ?? row.start);
      to = Math.max(to, row.end, row.forecast ?? row.end, row.baselineDue ?? row.end, row.baselineStart ?? row.end);
    }
    to += 3;
  }
  const x = (date: number) => labels + Math.max(0, Math.min(1, (date - from) / (to - from))) * (width - labels - 44);

  const ticks = [];
  const month = new Date(from * DAY);
  month.setUTCDate(1);
  month.setUTCMonth(month.getUTCMonth() + 1);
  const step = Math.max(1, Math.ceil((to - from) / (31 * 24)));
  for (; month.getTime() < to * DAY; month.setUTCMonth(month.getUTCMonth() + step)) {
    const pos = x(month.getTime() / DAY);
    ticks.push(
      <g key={month.getTime()}>
        <line x1={pos} y1={top - 4} x2={pos} y2={height - 16} stroke="rgba(255,255,255,.09)" />
        <text x={pos + 4} y={13} fill="#9c9ca1" fontSize={11}>{monthLabel.format(month)}</text>
      </g>,
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Milestones on a time axis"
        className={cn('block h-auto w-full', compact ? 'min-w-[340px]' : 'min-w-[825px]')}>
        <g aria-hidden="true">{ticks}</g>
        {rows.map((row, index) => {
          const y = top + index * rowHeight;
          const center = y + rowHeight / 2;
          const start = x(row.start);
          const due = x(row.end);
          const end = Math.max(due, start + 5);
          const forecast = row.forecast !== null && row.forecast > row.end ? x(row.forecast) : end;
          const baselineStart = x(row.baselineStart ?? row.start);
          const baselineEnd = x(row.baselineDue ?? row.baselineStart ?? row.end);
          const active = row.id === selected;
          const { color, track } = stateStyle[row.state];
          const limit = Math.max(4, (compact ? 16 : 32) - (row.issueKey?.length ?? 0));
          const title = row.title.length > limit ? `${row.title.slice(0, limit - 1)}…` : row.title;
          const drift = row.driftDays ?? 0;
          const visual = (
            <>
              <title>{titleOf(row)}</title>
              <rect x={1} y={y + 1} width={width - 2} height={rowHeight - 2} rx={4}
                className={cn('group-focus-visible:stroke-blue-500', active ? 'fill-blue-500/15' : 'fill-transparent group-hover:fill-white/[.04]')} />
              <text x={8} y={center + 4} fontSize={12} fill="#fafafa">
                {row.issueKey && <tspan fill="#9c9ca1" fontWeight={600}>{row.issueKey}</tspan>}
                <tspan dx={row.issueKey ? 4 : 0}>{title}</tspan>
              </text>
              {showBaseline && row.baselineStart !== null && (
                <rect x={baselineStart} y={y + 4} width={Math.max(baselineEnd - baselineStart, 5)} height={rowHeight - 8}
                  rx={4} fill="none" stroke="#9c9ca1" strokeDasharray="3 3" />
              )}
              {row.state === 'decision' ? (
                <polygon points={`${due},${y + 5} ${due + 9},${center} ${due},${y + rowHeight - 5} ${due - 9},${center}`} fill={color} />
              ) : (
                <>
                  <rect x={start} y={y + 8} width={end - start} height={rowHeight - 16} rx={3} fill={track} />
                  {row.total > 0 && row.completed > 0 && (
                    <rect x={start} y={y + 8} width={(end - start) * row.completed / row.total}
                      height={rowHeight - 16} rx={3} fill={color} />
                  )}
                  {forecast > end && (
                    <rect x={end} y={y + 8} width={forecast - end} height={rowHeight - 16}
                      fill="rgba(251,191,36,.35)" stroke="#fbbf24" strokeDasharray="3 2" />
                  )}
                </>
              )}
              {drift > 0 && row.state !== 'done' && (
                <text x={Math.max(end, forecast, showBaseline ? baselineEnd : 0) + 6} y={center + 4}
                  fill="#fbbf24" fontSize={11} fontWeight={600}>+{drift}d</text>
              )}
            </>
          );
          const label = `${titleOf(row)}, ${stateStyle[row.state].label}, ${row.completed} of ${row.total} done${drift ? `, ${drift} days after baseline` : ''}`;
          return href ? (
            <a key={row.id} href={href(row.id)} aria-label={label} className="group cursor-pointer outline-none">{visual}</a>
          ) : (
            <g key={row.id} role="button" tabIndex={0} aria-label={label} aria-pressed={active} aria-controls="p-detail"
              className="group cursor-pointer outline-none" onClick={() => open?.(row.id)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  open?.(row.id);
                }
              }}>{visual}</g>
          );
        })}
        <g aria-hidden="true" pointerEvents="none">
          <line x1={x(today)} y1={top - 8} x2={x(today)} y2={height - 16} stroke="#3b82f6" strokeWidth={1.5} />
          <text x={x(today) + 4} y={height - 4} textAnchor={to - today < 15 ? 'end' : 'start'}
            fill="#3b82f6" fontSize={11}>today, {dateLabel.format(today * DAY)}</text>
        </g>
      </svg>
    </div>
  );
}

export function ProjectPlanPreview({ overview, base }: { overview: Overview; base: string }) {
  return (
    <Card className={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">Plan · next 8 weeks</h2>
        <Button variant="outline" asChild className={cn(controlStyle, 'bg-transparent')}>
          <Link href={`${base}?tab=plan`}>Open Plan →</Link>
        </Button>
      </div>
      <MilestoneChart {...overview.plan} compact nextWeeks showBaseline href={id => planLink(base, id)} />
    </Card>
  );
}

function MilestoneDetail({ milestone, workspaceId, workspaceSlug, base, canEdit, refetch }: {
  milestone: Milestone;
  workspaceId: string;
  workspaceSlug: string;
  base: string;
  canEdit: boolean;
  refetch: () => Promise<unknown>;
}) {
  const update = useUpdateIssue();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Partial<Record<'startDate' | 'dueDate', string>>>({});
  const { baselineDue, driftDays, completed, total, state } = milestone;
  const storedStart = milestone.startDate?.slice(0, 10) ?? '';
  const storedDue = milestone.dueDate?.slice(0, 10) ?? '';
  const start = draft.startDate ?? storedStart;
  const due = draft.dueDate ?? storedDue;
  const dirty = start !== storedStart || due !== storedDue;

  async function saveDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving || !dirty) return;
    if (start && due && due < start) {
      setError('The due date is before the start.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await update.mutateAsync({
        id: milestone.id, workspaceId,
        ...(start !== storedStart && { startDate: start ? new Date(start) : null }),
        ...(due !== storedDue && { dueDate: due ? new Date(due) : null }),
      });
      await refetch();
      setDraft({});
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the milestone date.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={cardStyle} id="p-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{titleOf(milestone)}</h3>
        <span className={cn(chipStyle, stateStyle[state].chip)}>{stateStyle[state].label}</span>
      </div>
      <form className="my-2.5 space-y-2" onSubmit={saveDates}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))] gap-2.5">
          {(['startDate', 'dueDate'] as const).map((field, index) => (
            <label key={field} className={fieldStyle}>
              {index === 0 ? 'Start' : 'Due'}
              <input type="date" value={index === 0 ? start : due} readOnly={!canEdit} disabled={saving}
                className="w-full min-w-0 rounded-lg border border-white/[.09] bg-collab-950 px-2.5 py-1.5 text-sm text-collab-50 [color-scheme:dark]"
                onChange={event => {
                  const value = event.target.value;
                  setDraft(previous => ({ ...previous, [field]: value }));
                  setError('');
                }} />
            </label>
          ))}
          <div className={fieldStyle}>Baseline due<strong className="text-sm text-collab-50">
            {baselineDue === null ? '—' : dateLabel.format(baselineDue * DAY)}
          </strong></div>
          <div className={fieldStyle}>Drift<strong className={cn('text-sm', driftDays ? 'text-amber-400' : 'text-emerald-400')}>
            {driftDays ? `+${driftDays} ${driftDays === 1 ? 'day' : 'days'}` : driftDays === null ? '—' : 'none'}
          </strong></div>
          <div className={fieldStyle}>Issues<strong className="text-sm text-collab-50">{total ? `${completed} of ${total} done` : 'none'}</strong></div>
        </div>
        {error && <p role="alert" className="text-[13px] text-red-400">{error}</p>}
        {canEdit && (dirty || saving) && (
          <Button type="submit" variant="outline" className={controlStyle} disabled={saving}>
            {saving ? 'Saving dates…' : 'Save dates'}
          </Button>
        )}
      </form>
      <p className="text-[13px] text-collab-400">Agents can change these dates through the CLI and MCP. The baseline moves only when you freeze it.</p>
      <ul className="divide-y divide-white/[.09] border-b-white/[.09] [&:not(:empty)]:border-b">
        {milestone.issues.map(issue => (
          <li key={issue.id}>
            <Link href={`/${workspaceSlug}/issues/${issue.id}`} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] hover:bg-collab-700">
              {issue.issueKey && <span className="shrink-0 text-collab-400">{issue.issueKey}</span>}
              <span className="min-w-0 flex-1 truncate">{issue.title}</span>
              {issue.status && <span className={chipStyle}>{issue.status}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <Button variant="outline" asChild className={cn(controlStyle, 'mt-2.5')}>
        <Link href={`${base}?tab=work&milestone=${encodeURIComponent(milestone.id)}`}>Open {milestone.issueKey ?? 'milestone'} in Work →</Link>
      </Button>
    </Card>
  );
}

const legend = [
  ['done', 'bg-emerald-400'],
  ['in progress', 'bg-blue-400'],
  ['baseline', 'border border-dashed border-collab-400'],
  ['forecast past due', 'border border-dashed border-amber-400 bg-amber-400/35'],
  ['decision point', 'bg-violet-400'],
];

export function ProjectPlan({ summary, workspaceId, workspaceSlug, base, milestoneId, refetch }: {
  summary: ProjectSummary;
  workspaceId: string;
  workspaceSlug: string;
  base: string;
  milestoneId: string | null;
  refetch: () => Promise<unknown>;
}) {
  const { overview } = summary;
  const { milestones } = overview.plan;
  const [nextWeeks, setNextWeeks] = useState(false);
  const [showBaseline, setShowBaseline] = useState(true);
  const [selected, setSelected] = useState(milestoneId ?? overview.nextMilestoneId);
  const milestone = milestones.find(item => item.id === selected) ?? milestones[0];
  const unplotted = milestones.filter(item => item.start === null);
  const { checkPermission } = usePermissions(workspaceId);
  const canSetBaseline = checkPermission(Permission.EDIT_ANY_TASK).hasPermission;
  const canEdit = canSetBaseline || (milestone?.isReporter === true && checkPermission(Permission.EDIT_SELF_TASK).hasPermission);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Time window" className="inline-flex rounded-[9px] border border-white/[.09] text-[13px]">
            {(['Whole plan', 'Next 8 weeks'] as const).map((label, index) => (
              <button key={label} type="button" aria-pressed={nextWeeks === Boolean(index)}
                className={cn('px-3 py-1.5 first:rounded-l-[8px] last:rounded-r-[8px]',
                  nextWeeks === Boolean(index) ? 'bg-blue-500 text-white' : 'text-collab-400 hover:text-collab-50')}
                onClick={() => setNextWeeks(Boolean(index))}>{label}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={showBaseline} onChange={event => setShowBaseline(event.target.checked)} className="accent-blue-500" />
            Show baseline
          </label>
        </div>
        {canSetBaseline
          ? <BaselineControl overview={overview} projectId={summary.project.id} refetch={refetch} />
          : <BaselineHistory overview={overview} />}
      </div>

      <Card className={cardStyle}>
        <MilestoneChart {...overview.plan} nextWeeks={nextWeeks} showBaseline={showBaseline} selected={milestone?.id} open={setSelected} />
        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-collab-400">
          {legend.map(([label, style]) => (
            <span key={label} className="inline-flex items-center gap-[5px]">
              <span aria-hidden="true" className={cn('h-2 w-3.5 rounded-sm', style)} />{label}
            </span>
          ))}
        </div>
      </Card>

      {unplotted.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-collab-400">
          <p>Milestones outside the chart</p>
          {unplotted.map(item => (
            <button key={item.id} type="button" aria-pressed={item.id === milestone?.id} aria-controls="p-detail" onClick={() => setSelected(item.id)}
              className={cn(chipStyle, 'hover:bg-collab-700', item.id === milestone?.id && 'border-blue-500 text-collab-50')}>
              {titleOf(item)}{item.invalidDates && ' · Due before start'}
            </button>
          ))}
        </div>
      )}

      {milestone && <MilestoneDetail key={milestone.id} milestone={milestone} workspaceId={workspaceId}
        workspaceSlug={workspaceSlug} base={base} canEdit={canEdit} refetch={refetch} />}
    </div>
  );
}
