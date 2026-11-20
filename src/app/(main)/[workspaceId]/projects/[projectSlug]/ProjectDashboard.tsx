"use client";

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import NewIssueModal from '@/components/issue/NewIssueModal';
import { useProjectSummary, type ProjectSummary } from '@/hooks/queries/useProjects';
import { cn } from '@/lib/utils';

interface ProjectDashboardProps {
  projectId: string;
  projectName: string;
  projectSlug: string;
  projectDescription: string | null;
  projectColor: string | null;
  workspaceId: string;
  workspaceSlug: string;
}

type Milestone = ProjectSummary['overview']['milestones'][number];
const tabs = ['Overview', 'Plan', 'Burn', 'Work'] as const;
const cardStyle = 'rounded-[10px] border-white/[.09]';
const controlStyle = 'h-auto rounded-lg border-white/[.09] bg-collab-800 px-3 py-1.5 text-[13px] font-normal text-collab-50 hover:bg-collab-700 focus-visible:ring-2 focus-visible:ring-blue-500';
const dateLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const titleOf = ({ issueKey, title }: { issueKey: string | null; title: string }) => issueKey ? `${issueKey} · ${title}` : title;
const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;

const verdictStyle = {
  on_track: { label: 'On track', text: 'text-emerald-400', band: 'border-emerald-400/45 bg-[linear-gradient(90deg,rgba(52,211,153,.14),transparent_60%)]' },
  at_risk: { label: 'At risk', text: 'text-amber-400', band: 'border-amber-400/45 bg-[linear-gradient(90deg,rgba(251,191,36,.13),transparent_60%)]' },
  behind: { label: 'Behind', text: 'text-red-400', band: 'border-red-400/45 bg-[linear-gradient(90deg,rgba(248,113,113,.13),transparent_60%)]' },
};

function OverviewStat({ label, value, detail, color }: { label: string; value: ReactNode; detail: string; color?: string }) {
  return (
    <Card className={cn(cardStyle, 'grid content-start gap-px px-3 py-2.5 text-[13px] text-collab-400')}>
      <span>{label}</span>
      <strong className={cn('text-2xl font-[650] leading-[1.2] text-collab-50', color)}>{value}</strong>
      <span>{detail}</span>
    </Card>
  );
}

function ProjectOverview({
  summary, base, workspaceSlug, projectName, openMilestoneForm, refetch,
}: {
  summary: ProjectSummary;
  base: string;
  workspaceSlug: string;
  projectName: string;
  openMilestoneForm: () => void;
  refetch: () => Promise<unknown>;
}) {
  const { overview } = summary;
  const { stats, milestones, unplanned, blocked } = overview;
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [baselineError, setBaselineError] = useState(false);
  const next = milestones.find(milestone => milestone.id === overview.nextMilestoneId);
  const byId = new Map(milestones.map(milestone => [milestone.id, milestone]));
  const late = overview.lateMilestoneIds.flatMap(id => {
    const milestone = byId.get(id);
    return milestone?.forecastDate && milestone.driftDays !== null
      ? [{ ...milestone, forecastDate: milestone.forecastDate, driftDays: milestone.driftDays }] : [];
  });
  const verdict = overview.verdict ? verdictStyle[overview.verdict] : null;
  const planLink = (milestone: Milestone) => `${base}?tab=plan&milestone=${encodeURIComponent(milestone.id)}`;
  const workLink = `${base}?tab=work&group=no-milestone`;
  const issueLink = (issue: { id: string }) => `/${workspaceSlug}/issues/${issue.id}`;
  const attention = [
    ...late.map(milestone => ({
      href: planLink(milestone), key: milestone.id, color: 'bg-amber-400',
      label: `${milestone.issueKey ?? milestone.title} is forecast ${days(milestone.driftDays)} after its baseline`,
    })),
    ...blocked.map(issue => ({
      href: issueLink(issue), key: issue.id, color: 'bg-red-400', label: issue.blockedDays > 0 ? `${issue.issueKey ?? issue.title} has been blocked for ${days(issue.blockedDays)}`
        : `${issue.issueKey ?? issue.title} is blocked`,
    })),
    ...(unplanned.length ? [{
      href: workLink, key: workLink, color: 'bg-collab-400',
      label: unplanned.length === 1 ? '1 open issue has no milestone' : `${unplanned.length} open issues have no milestone`,
    }] : []),
  ];

  async function setBaseline() {
    setSavingBaseline(true);
    setBaselineError(false);
    try {
      const response = await fetch(`/api/projects/${summary.project.id}/baseline`, { method: 'POST' });
      if (!response.ok) throw new Error('Could not set baseline');
      await refetch();
    } catch {
      setBaselineError(true);
    } finally {
      setSavingBaseline(false);
    }
  }

  return (
    <div className="grid gap-3">
      {milestones.length ? (
        <Card className={cn(cardStyle, 'grid min-w-0 gap-3 p-3.5 min-[861px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]', verdict?.band)}>
          <div className="min-w-0">
            <p className="text-[13px] text-collab-400">{projectName} is</p>
            <h2 className={cn('break-words text-[28px] font-[650] leading-[1.1]', verdict?.text)}>
              {verdict?.label ?? (overview.hasBaseline ? 'Forecast unavailable' : 'Awaiting baseline')}
            </h2>
            <div className="mt-1.5 text-sm text-collab-400">
              {late.length ? (
                <ul>
                  {late.slice(0, 2).map(milestone => (
                    <li key={milestone.id}>
                      {milestone.issueKey ?? milestone.title} is forecast for {dateLabel.format(new Date(milestone.forecastDate))}, {days(milestone.driftDays)} after its baseline
                    </li>
                  ))}
                </ul>
              ) : verdict ? (
                <p>{milestones.every(milestone => milestone.finished)
                  ? 'All milestones are finished'
                  : 'Every open milestone with a baseline is forecast within 2 days of it'}</p>
              ) : overview.hasBaseline ? (
                <p>Issue closures in the last three weeks are needed for a forecast.</p>
              ) : overview.baselineAt ? (
                <p>Add milestone due dates and ask the workspace owner to update the baseline.</p>
              ) : (
                <p>{milestones.some(milestone => milestone.dueDate)
                  ? 'Set a baseline to compare milestone forecasts with the plan.'
                  : 'Add milestone due dates so the workspace owner can set a baseline.'}</p>
              )}
              {!overview.hasBaseline && !overview.baselineAt && 'agentSpendUsd' in overview && (
                <Button variant="outline" className={cn(controlStyle, 'mt-2')} disabled={savingBaseline || !milestones.some(milestone => milestone.dueDate)} onClick={setBaseline}>
                  {savingBaseline ? 'Setting baseline…' : 'Set baseline'}
                </Button>
              )}
              {baselineError && <p role="alert" className="mt-2 text-red-400">Could not set the baseline. Try again.</p>}
            </div>
          </div>
          {next && (
            <Link href={planLink(next)} className="grid min-w-0 content-start gap-0.5 rounded-lg border border-white/[.09] bg-collab-900 px-3 py-2.5 text-[13px] hover:bg-collab-700">
              <span className="text-collab-400">Next milestone</span>
              <strong className="break-words text-[15px]">{titleOf(next)}</strong>
              <span>
                {next.dueDate && next.daysUntilDue !== null
                  ? `due ${dateLabel.format(new Date(next.dueDate))}, ${next.daysUntilDue < 0
                    ? `${days(-next.daysUntilDue)} overdue` : next.daysUntilDue === 0 ? 'today' : `in ${days(next.daysUntilDue)}`}`
                  : 'No due date'}
                {' · '}{next.completed} of {next.total} done
              </span>
            </Link>
          )}
        </Card>
      ) : (
        <Card className={cn(cardStyle, 'p-3.5 text-sm text-collab-400')}>
          <button type="button" className="text-blue-400 hover:underline" onClick={openMilestoneForm}>Create your first milestone</button> to see the project plan and forecast.
        </Card>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-2.5">
        <OverviewStat label="Done" value={`${stats.donePercent}%`} detail={`${stats.done} of ${stats.total} issues`} color="text-emerald-400" />
        <OverviewStat label="Open" value={stats.open} detail={`${unplanned.length} with no milestone`} />
        <OverviewStat label="Overdue" value={stats.overdue} detail="counted in full, no cap" />
        <OverviewStat label="Added since baseline" value={stats.addedSinceBaseline === null ? '—' : `+${stats.addedSinceBaseline}`}
          detail={stats.addedSinceBaseline === null ? 'No baseline set' : 'issues'} color="text-amber-400" />
        <OverviewStat label="Closed by agents" value={`${overview.closedByAgentsPercent}%`} color="text-violet-400"
          detail={overview.agentSpendUsd != null ? `${dollars.format(overview.agentSpendUsd)} agent spend` : `${overview.runCount} ${overview.runCount === 1 ? 'run' : 'runs'}`} />
      </div>

      {milestones.length > 0 && (
        <div className="grid gap-3 min-[861px]:grid-cols-2">
          {([
            ['Plan · next 8 weeks', 'Plan'],
            ['Burn-up · last 30 days', 'Burn'],
          ] as const).map(([heading, tab]) => (
            <Card key={tab} className={cn(cardStyle, 'p-3')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold">{heading}</h2>
                <Button variant="outline" asChild className={cn(controlStyle, 'bg-transparent')}>
                  <Link href={`${base}?tab=${tab.toLowerCase()}`}>Open {tab} →</Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className={cn(cardStyle, 'p-3')}>
        <h2 className="mb-2 text-[13px] font-semibold text-collab-400">Needs attention · {attention.length}</h2>
        {attention.length ? (
          <ul className="divide-y divide-white/[.09]">
            {attention.map(item => (
              <li key={item.key}>
                <Link href={item.href} className="flex items-center gap-2 px-1.5 py-2 text-[13px] hover:bg-collab-700">
                  <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', item.color)} />
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-collab-400">Nothing needs attention.</p>}
      </Card>

      <ProjectDetails base={base} summary={summary} workspaceSlug={workspaceSlug} />
    </div>
  );
}

function ProjectDetails({ base, summary, workspaceSlug }: { base: string; summary: ProjectSummary; workspaceSlug: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { connections, activities } = summary.repositories;
  const { notes, featureRequests } = summary;
  const connectionLabel = connections.length === 1 ? 'repository' : 'repositories';
  const panels = [
    {
      id: 'repository', label: 'Repository',
      content: (
        <>
          <p>{connections.length ? `${connections.length} ${connectionLabel} connected` : 'No repository connected'}</p>
          <ul className="break-all">{connections.map(connection => <li key={connection.id}>{connection.name}</li>)}</ul>
          <ul>{activities.slice(0, 5).map(activity => <li key={activity.id}>{activity.author.name} {activity.title}{activity.description ? ` · ${activity.description}` : ''}</li>)}</ul>
          <Link className="text-blue-400 hover:underline" href={`${base}/settings?tab=github`}>
            {connections.length ? 'Repository settings' : 'Connect repository'} →
          </Link>
        </>
      ),
    },
    {
      id: 'notes', label: `Context notes (${notes.length})`,
      content: (
        <>
          <ul>{notes.map(note => (
            <li key={note.id}><Link className="hover:underline" href={`/${workspaceSlug}/notes/${note.id}`}>{note.title}</Link></li>
          ))}</ul>
          <Link className="text-blue-400 hover:underline" href={`/${workspaceSlug}/context?project=${summary.project.id}`}>Open context notes →</Link>
        </>
      ),
    },
    ...(featureRequests.length ? [{
      id: 'features', label: `Feature requests (${featureRequests.length})`,
      content: (
        <>
          <ul>{featureRequests.map(feature => (
            <li key={feature.id}><Link className="hover:underline" href={`${base}/features/${feature.id}`}>{feature.title}</Link></li>
          ))}</ul>
          <Link className="text-blue-400 hover:underline" href={`${base}/features`}>Open feature requests →</Link>
        </>
      ),
    }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {panels.map(({ id, label }) => (
          <Button key={id} type="button" variant="outline" className={controlStyle} aria-expanded={expanded === id}
            aria-controls={`project-details-${id}`} onClick={() => setExpanded(expanded === id ? null : id)}>
            <ChevronRight aria-hidden="true" className={cn('!size-3', expanded === id && 'rotate-90')} />{label}
          </Button>
        ))}
      </div>
      {panels.map(({ id, content }) => (
        <Card key={id} id={`project-details-${id}`} hidden={expanded !== id} className={cn(cardStyle, 'space-y-1 p-3 text-[13px] text-collab-400')}>
          {expanded === id && content}
        </Card>
      ))}
    </>
  );
}

export function ProjectDashboard({
  projectId, projectName, projectSlug, projectDescription, projectColor, workspaceId, workspaceSlug,
}: ProjectDashboardProps) {
  const search = useSearchParams();
  const [creatingMilestone, setCreatingMilestone] = useState(false);
  const { data: summary, isLoading, isError, refetch } = useProjectSummary(projectId);
  const base = `/${workspaceSlug}/projects/${projectSlug}`;
  const available = summary?.overview.milestones.length ? tabs : (['Overview', 'Work'] as const);
  const selected = available.find(tab => tab.toLowerCase() === search.get('tab')) ?? 'Overview';
  const milestone = selected === 'Plan' ? summary?.overview.milestones.find(item => item.id === search.get('milestone')) : undefined;
  const unplanned = selected === 'Work' && search.get('group') === 'no-milestone' ? summary?.overview.unplanned : undefined;

  return (
    <div className="h-full w-full overflow-y-auto bg-collab-900 text-collab-50">
      <div className="mx-auto max-w-[1180px] p-4 pb-12 text-sm">
        <header className="mb-2.5 flex flex-wrap items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-stretch gap-2.5">
            <span aria-hidden="true" className="w-1 shrink-0 rounded-sm" style={{ backgroundColor: projectColor || '#2563eb' }} />
            <div className="min-w-0">
              <h1 className="break-words text-base font-semibold">{projectName}</h1>
              {projectDescription && <p className="truncate text-[13px] text-collab-400" title={projectDescription}>{projectDescription}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ['GitHub', 'github'], ['Releases', 'changelog'], ['Settings', 'settings'],
            ] as const).map(([label, path]) => (
              <Button key={path} variant="outline" asChild className="h-auto rounded-full border-white/[.09] bg-transparent px-2 py-px text-[11px] font-normal text-collab-400 hover:bg-collab-700 hover:text-collab-50">
                <Link href={`${base}/${path}`}>{label}</Link>
              </Button>
            ))}
          </div>
        </header>

        {summary && (
          <nav aria-label="Project tabs" className="mb-3.5 flex gap-0.5 border-b border-white/[.09]">
            {available.map(tab => (
              <Link key={tab} href={tab === 'Overview' ? base : `${base}?tab=${tab.toLowerCase()}`}
                aria-current={tab === selected ? 'page' : undefined} scroll={false}
                className={cn('-mb-px border-b-2 px-3.5 py-2', tab === selected ? 'border-blue-500 text-collab-50' : 'border-transparent text-collab-400 hover:text-collab-50')}>
                {tab}
              </Link>
            ))}
          </nav>
        )}

        {isLoading && <p role="status" className="text-collab-400">Loading project overview…</p>}
        {(isError || (!summary && !isLoading)) && (
          <Card className={cn(cardStyle, 'space-y-2 p-3')} role="alert">
            <p>Could not load project overview.</p>
            <p className="text-collab-400">Connection status unavailable</p>
            <Button variant="outline" className={controlStyle} onClick={() => refetch()}>Retry</Button>
          </Card>
        )}
        {summary && !isError && (selected === 'Overview' ? (
          <ProjectOverview summary={summary} base={base} workspaceSlug={workspaceSlug} projectName={projectName}
            openMilestoneForm={() => setCreatingMilestone(true)} refetch={refetch} />
        ) : (
          <Card className={cn(cardStyle, 'space-y-2 p-3')}>
            <h2 className="text-base font-semibold">{selected}{unplanned && ' · No milestone'}</h2>
            <p className="text-collab-400">{selected} is coming.</p>
            {milestone && (
              <p><Link className="text-blue-400 hover:underline" href={`/${workspaceSlug}/issues/${milestone.id}`}>{titleOf(milestone)} →</Link></p>
            )}
            {unplanned && (
              <ul className="space-y-1">
                {unplanned.map(issue => (
                  <li key={issue.id}><Link className="text-blue-400 hover:underline" href={`/${workspaceSlug}/issues/${issue.id}`}>{titleOf(issue)}</Link></li>
                ))}
              </ul>
            )}
          </Card>
        ))}
        {creatingMilestone && (
          <NewIssueModal open onOpenChange={setCreatingMilestone} workspaceId={workspaceId} projectId={projectId}
            defaultType="MILESTONE" onCreated={() => refetch()} />
        )}
      </div>
    </div>
  );
}
