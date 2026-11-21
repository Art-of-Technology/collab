'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import { useIssueModalUrlState } from '@/hooks/useIssueModalUrlState';
import type { ProjectSummary } from '@/hooks/queries/useProjects';
import { cn } from '@/lib/utils';

type WorkIssue = ProjectSummary['overview']['work'][number];
type Milestone = ProjectSummary['overview']['milestones'][number];

const segment = 'inline-flex overflow-hidden rounded-[9px] border border-white/[.09]';
const segmentItem = 'px-3 py-1.5 text-[13px] text-collab-400 hover:text-collab-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-300';
const activeSegment = 'bg-blue-500 text-white hover:text-white';
const chip = 'w-fit rounded-full border border-white/[.09] px-2 py-px text-[11px] leading-normal text-collab-400';
const dueDateLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Assignee({ issue, className }: { issue: WorkIssue; className?: string }) {
  return (
    <span className={cn('min-w-0 truncate text-[13px] text-collab-400', className)} title={issue.assignee ?? undefined}>
      <span aria-hidden="true" className={cn('mr-1 inline-block size-2 rounded-full', issue.agent ? 'bg-violet-400' : issue.assignee ? 'bg-blue-400' : 'bg-collab-500')} />
      {issue.assignee ?? 'Unassigned'}
    </span>
  );
}

function IssueGroup({ milestone, issues, openIssue }: {
  milestone: Milestone | null;
  issues: WorkIssue[];
  openIssue: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const drift = milestone?.forecastDate ? milestone.driftDays ?? 0 : 0;
  return (
    <section>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-white/[.09] bg-collab-800 px-2.5 py-2 text-left text-[13px] hover:bg-collab-700">
        <span className={cn('flex min-w-0 flex-1 items-center gap-2', milestone && 'max-[479px]:basis-full')}>
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          {milestone?.issueKey && <strong>{milestone.issueKey}</strong>}
          <span className={cn('truncate', !milestone && 'pl-2')} title={milestone?.title}>{milestone?.title ?? 'No milestone'}</span>
        </span>
        <span className="whitespace-nowrap text-collab-400">{milestone?.completed ?? issues.filter(issue => issue.done).length} of {issues.length}</span>
        {milestone && (
          <span className="whitespace-nowrap text-collab-400">
            {milestone.dueDate ? <>due <time dateTime={milestone.dueDate}>{dueDateLabel.format(new Date(milestone.dueDate))}</time></> : 'No due date'}
          </span>
        )}
        {drift > 0 && <span className={cn(chip, 'border-amber-400/40 text-amber-400')} aria-label={`${drift} days after baseline`}>+{drift}d</span>}
      </button>
      {open && (issues.length ? (
        <ul className="divide-y divide-white/[.09] border-b border-white/[.09]">
          {issues.map(issue => (
            <li key={issue.id}>
              <button type="button" onClick={() => openIssue(issue.id)} title={issue.title}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 px-2.5 py-[7px] text-left text-[13px] hover:bg-collab-700 sm:flex">
                <span className="whitespace-nowrap tabular-nums text-collab-400">{issue.issueKey}</span>
                <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                <span className={cn(chip, 'max-w-[45vw] truncate', issue.done ? 'border-emerald-400/40 text-emerald-400' : issue.blocked && 'border-red-400/40 text-red-400')} title={issue.status}>
                  {issue.status}
                </span>
                <Assignee issue={issue} className="sm:max-w-[30%]" />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="px-2.5 py-2 text-collab-400">No issues in this group.</p>)}
    </section>
  );
}

function WorkBoard({ issues, statuses, milestones, openIssue }: {
  issues: WorkIssue[];
  statuses: ProjectSummary['statusDistribution'];
  milestones: Map<string, Milestone>;
  openIssue: (id: string) => void;
}) {
  const columns = new Map(statuses.map(status => [`status:${status.id}`, {
    label: status.displayName ?? status.name,
    issues: [] as WorkIssue[],
  }]));
  for (const issue of issues) {
    const key = issue.statusId ? `status:${issue.statusId}` : `legacy:${issue.status}`;
    const column = columns.get(key) ?? { label: issue.status, issues: [] };
    column.issues.push(issue);
    columns.set(key, column);
  }
  return (
    <div className="grid grid-cols-2 gap-2 min-[861px]:grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))]">
      {[...columns].map(([key, column]) => (
        <section key={key} aria-label={column.label} className="min-w-0 rounded-lg border border-white/[.09] bg-collab-950 p-2">
          <h3 className="mb-1.5 break-words text-xs font-medium text-collab-400">{column.label} · {column.issues.length}</h3>
          <ul className="space-y-1.5">
            {column.issues.map(issue => {
              const milestone = issue.milestoneId ? milestones.get(issue.milestoneId) : undefined;
              return (
                <li key={issue.id}>
                  <button type="button" onClick={() => openIssue(issue.id)}
                    className="grid w-full min-w-0 grid-cols-1 gap-1 rounded-lg border border-white/[.09] bg-collab-800 p-2 text-left text-xs hover:border-blue-500">
                    <span className="tabular-nums text-collab-400">{issue.issueKey}</span>
                    <span className="break-words">{issue.title}</span>
                    <span className="flex min-w-0 flex-wrap items-center gap-1">
                      <span className={cn(chip, 'max-w-full truncate')} title={milestone?.title}>{milestone?.issueKey ?? milestone?.title ?? 'No milestone'}</span>
                      <Assignee issue={issue} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ProjectWork({ base, summary, hasForge, forgeBoard, milestoneId, noMilestone }: {
  base: string;
  summary?: ProjectSummary;
  hasForge: boolean;
  forgeBoard?: ReactNode;
  milestoneId: string | null;
  noMilestone: boolean;
}) {
  const [view, setView] = useState<'milestone' | 'board'>('milestone');
  const { selectedIssueId, setSelectedIssueId, closeModal } = useIssueModalUrlState();
  const workUrl = `${base}?tab=work`;
  const work = summary?.overview.work ?? [];
  const milestones = new Map(summary?.overview.milestones.map(milestone => [milestone.id, milestone]));
  const filter = noMilestone ? null : milestoneId && milestones.has(milestoneId) ? milestoneId : undefined;
  const visible = filter === undefined ? work : work.filter(issue => issue.milestoneId === filter);
  const grouped = new Map<string | null, WorkIssue[]>();
  for (const issue of visible) {
    const group = grouped.get(issue.milestoneId) ?? [];
    group.push(issue);
    grouped.set(issue.milestoneId, group);
  }
  const groups = [...milestones.values()].filter(milestone => milestone.id === filter || grouped.has(milestone.id));
  const showUnplanned = filter === null || grouped.has(null);

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {hasForge && (
            <div role="group" aria-label="Work sub-view" className={segment}>
              <Link href={workUrl} scroll={false} aria-current={!forgeBoard ? 'page' : undefined}
                className={cn(segmentItem, !forgeBoard && activeSegment)}>Issues</Link>
              <Link href={`${workUrl}&view=forge`} scroll={false} prefetch={false} aria-current={forgeBoard ? 'page' : undefined}
                className={cn(segmentItem, forgeBoard && activeSegment)}>Forge board</Link>
            </div>
          )}
          {!forgeBoard && (
            <div role="group" aria-label="Grouping" className={segment}>
              <button type="button" aria-pressed={view === 'milestone'} className={cn(segmentItem, view === 'milestone' && activeSegment)}
                onClick={() => setView('milestone')}>By milestone</button>
              <button type="button" aria-pressed={view === 'board'} className={cn(segmentItem, view === 'board' && activeSegment)}
                onClick={() => setView('board')}>Board</button>
            </div>
          )}
        </div>
        {!forgeBoard && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-collab-400">
            {filter !== undefined && <Link href={workUrl} scroll={false} className="text-blue-400 hover:underline">Show all issues</Link>}
            <span>{visible.length} of {work.length} issues shown</span>
          </div>
        )}
      </div>
      {forgeBoard || (
        <>
          {view === 'board' ? (
            <WorkBoard issues={visible} statuses={summary?.statusDistribution ?? []} milestones={milestones} openIssue={setSelectedIssueId} />
          ) : (
            <div className="mt-2 space-y-2">
              {groups.map(milestone => (
                <IssueGroup key={milestone.id} milestone={milestone} issues={grouped.get(milestone.id) ?? []} openIssue={setSelectedIssueId} />
              ))}
              {showUnplanned && <IssueGroup milestone={null} issues={grouped.get(null) ?? []} openIssue={setSelectedIssueId} />}
            </div>
          )}
          {groups.length === 0 && !showUnplanned && <p className="py-2 text-collab-400">No project issues yet.</p>}
          {selectedIssueId && work.some(issue => issue.id === selectedIssueId) && <IssueDetailModal issueId={selectedIssueId} onClose={closeModal} />}
        </>
      )}
    </>
  );
}
