import { Children, type ReactNode } from 'react';
import { PageLayout } from '@/components/ui/page-layout';
import { PageHeader } from '@/components/ui/page-header';
import type {
  AgentsNowOverview, DashboardIssue, DashboardScope, NeedsYouKind, NeedsYouOverview, RepositoryOverview,
  ShippedOverview, WorkspaceIssueOverview,
} from '@/types/workspace-dashboard';
import AgentsNowPanel from './AgentsNowPanel';
import DashboardRefresh from './DashboardRefresh';
import DueSoonPanel from './DueSoonPanel';
import NeedsYouPanel from './NeedsYouPanel';
import ProjectsPanel from './ProjectsPanel';
import RelativeTime from './RelativeTime';
import ShippedPanel from './ShippedPanel';

type Filters = { scope: DashboardScope; kind?: NeedsYouKind; q: string; dormant: boolean; page: number };

type Props = Filters & {
  workspaceSlug: string;
  updatedAt: string;
  now: string;
  issues: WorkspaceIssueOverview;
  repositories: RepositoryOverview;
  needsYou: NeedsYouOverview | null;
  agentsNow: AgentsNowOverview | null;
  shipped: ShippedOverview | null;
};

const linkStyle = 'rounded-sm text-blue-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400';
const controlStyle = 'rounded-md border border-collab-600 px-3 py-2 text-sm hover:bg-collab-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400';

function Panel({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-title`} className="min-w-0 overflow-hidden rounded-xl border border-collab-600 bg-collab-800">
    <div className="border-b border-collab-600 px-5 py-4">
      <h2 id={`${id}-title`} className="text-base font-medium text-collab-50">{title}</h2>
      <p className="mt-1 text-xs text-collab-400">{description}</p>
    </div>
    {children}
  </section>;
}

function SectionState({ kind, subject, reloadHref }: { kind: 'denied' | 'unavailable'; subject: string; reloadHref: string }) {
  return <div className="space-y-3 px-5 py-6 text-sm">
    <p className="text-collab-400">{kind === 'denied' ? `You don't have permission to view ${subject}.` : `${subject} is temporarily unavailable.`}</p>
    {kind === 'unavailable' && <a className={linkStyle} href={reloadHref}>Reload {subject.toLowerCase()}</a>}
  </div>;
}

function externalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function IssueList({ issues, workspaceSlug, attentionAt, now }: {
  issues: DashboardIssue[];
  workspaceSlug: string;
  attentionAt: string;
  now: string;
}) {
  return <ul className="divide-y divide-collab-600">
    {issues.map(issue => {
      const overdue = issue.dueDate && new Date(issue.dueDate).getTime() < new Date(attentionAt).getTime();
      return <li key={issue.id} className="space-y-2 px-5 py-4">
        <a className={`${linkStyle} block text-sm font-medium`} href={`/${encodeURIComponent(workspaceSlug)}/issues/${encodeURIComponent(issue.issueKey || issue.id)}`}>{issue.title}</a>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-collab-400">
          {issue.issueKey && <span>{issue.issueKey}</span>}
          <span>{issue.project.name}</span>
          <span className={`rounded px-2 py-0.5 ${overdue ? 'bg-amber-400/10 text-amber-300' : 'bg-blue-400/10 text-blue-300'}`}>{overdue ? 'Overdue' : 'Due in the next 7 days'}</span>
          <RelativeTime value={issue.dueDate} now={now} due />
        </div>
      </li>;
    })}
  </ul>;
}

function dashboardSentence(needsYou: NeedsYouOverview | null, shipped: ShippedOverview | null, now: string) {
  const clauses: ReactNode[] = [];
  let needsCount: number | undefined;
  if (needsYou?.kind === 'ready') {
    const { counts, oldestQuestion } = needsYou;
    needsCount = counts.question + counts.review + counts.failed + counts.due;
    if (needsCount) clauses.push(needsCount === 1 ? '1 thing needs you.' : `${needsCount} things need you.`);
    if (oldestQuestion) {
      clauses.push(<>Oldest question: {oldestQuestion.seatName}, <RelativeTime value={oldestQuestion.since} now={now} />.</>);
    }
    if (counts.failed) clauses.push(counts.failed === 1 ? '1 failed run.' : `${counts.failed} failed runs.`);
  }
  if (shipped?.kind === 'ready' && shipped.total) {
    clauses.push(shipped.total === 1 ? '1 change shipped today.' : `${shipped.total} changes shipped today.`);
  }
  if (!clauses.length) return needsCount === 0 ? 'Nothing needs you.' : null;
  return <>{Children.toArray(clauses.flatMap((clause, index) => index === 0 ? [clause] : [' ', clause]))}</>;
}

function workingSeatsByProject(agentsNow: AgentsNowOverview | null) {
  if (agentsNow?.kind !== 'ready') return null;

  const counts = new Map<string, number>();
  for (const { projectId, state } of agentsNow.seats) {
    if (state === 'working') counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

export default function WorkspaceOverview({
  workspaceSlug, scope, kind, q, dormant, page, updatedAt, now, issues, repositories, needsYou, agentsNow, shipped,
}: Props) {
  const dashboardPath = `/${encodeURIComponent(workspaceSlug)}/dashboard`;
  function overviewHref(changes?: Partial<Filters>) {
    const filters = { scope, kind, q, dormant, page, ...changes };
    const params = new URLSearchParams();
    if (filters.scope === 'mine') params.set('scope', 'mine');
    if (filters.kind) params.set('kind', filters.kind);
    if (filters.q) params.set('q', filters.q);
    if (filters.dormant) params.set('dormant', '1');
    if (filters.page > 1) params.set('page', String(filters.page));
    return `${dashboardPath}${params.size ? `?${params}` : ''}`;
  }

  const needsByProject = needsYou?.kind === 'ready' ? needsYou.byProject : null;
  const waitingSeats = needsYou?.kind === 'ready' ? needsYou.waitingSeats : null;
  const seatsWorkingByProject = workingSeatsByProject(agentsNow);

  return <PageLayout wide className="gap-5 p-4 sm:p-8">
    <PageHeader
      title="Workspace overview"
      subtitle={dashboardSentence(needsYou, shipped, now)}
      className="gap-2 [&>div:first-child]:flex-wrap [&>div:first-child]:items-start [&>div:first-child]:gap-2"
      actions={
        <nav aria-label="Work scope" className="flex w-fit gap-1 whitespace-nowrap rounded-lg border border-collab-600 bg-collab-950 p-1">
          {(['all', 'mine'] as const).map(value => <a key={value} href={overviewHref({ scope: value, page: value === scope ? page : 1 })} aria-current={scope === value ? 'page' : undefined} className={`${controlStyle} border-0 ${scope === value ? 'bg-collab-700 text-collab-50' : 'text-collab-400'}`}>{value === 'all' ? 'All work' : 'My work'}</a>)}
        </nav>
      }
    >
      <DashboardRefresh updatedAt={updatedAt} now={now} />
    </PageHeader>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div id="issues-overview" className="min-w-0">
        {needsYou !== null ? <NeedsYouPanel data={needsYou} kind={kind} workspaceSlug={workspaceSlug} now={now} kindHrefs={{
          all: overviewHref({ kind: undefined }),
          question: overviewHref({ kind: 'question' }),
          review: overviewHref({ kind: 'review' }),
          failed: overviewHref({ kind: 'failed' }),
          due: overviewHref({ kind: 'due' }),
        }} /> : issues.kind === 'ready' ?
          <Panel id="needs-attention" title="Needs attention" description="Unfinished Collab issues with overdue or upcoming due dates.">
            {issues.attention.length ? <IssueList issues={issues.attention} workspaceSlug={workspaceSlug} attentionAt={issues.generatedAt} now={now} /> : <p className="px-5 py-6 text-sm text-collab-400">{scope === 'mine' ? 'No issues assigned to you are overdue or due in the next 7 days.' : 'No open issues are overdue or due in the next 7 days.'}</p>}
            {issues.attention.length > 0 && <p className="border-t border-collab-600 px-5 py-3 text-xs text-collab-400">Showing {issues.attention.length} of {(issues.summary.overdueIssues + issues.summary.dueSoonIssues).toLocaleString('en-GB')} issues needing attention. Earliest due first.</p>}
          </Panel> : <Panel id="issue-summary" title="Collab issues" description="Open work and due dates across your accessible projects.">
            <SectionState kind={issues.kind} subject="Issue overview" reloadHref={`${overviewHref()}#issues-overview`} />
          </Panel>}
      </div>

      <div className="grid min-w-0 gap-5">
        {agentsNow !== null && <AgentsNowPanel data={agentsNow} waitingSeats={waitingSeats} workspaceSlug={workspaceSlug} />}
        {shipped !== null ? <ShippedPanel data={shipped} now={now} /> :
          <Panel id="repository-activity" title="Recent repository activity" description="PRs, merge requests and releases across the workspace. My work does not filter this section.">
            {repositories.kind !== 'ready' ? <SectionState kind={repositories.kind} subject="Repository activity" reloadHref={`${overviewHref()}#repository-activity`} /> : <>
              {repositories.items.length ? <ul className="divide-y divide-collab-600">
                {repositories.items.map(item => {
                  const url = externalUrl(item.url);
                  return <li key={item.id} className="space-y-2 px-5 py-4">
                    {url ? <a className={`${linkStyle} block text-sm font-medium`} href={url} target="_blank" rel="noopener noreferrer">{item.title}<span className="sr-only"> (opens in a new tab)</span><span aria-hidden="true"> ↗</span></a> : <p className="text-sm font-medium text-collab-50">{item.title}</p>}
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-collab-400">
                      <span>{item.project.name}</span><span>{({ github: 'GitHub', gitlab: 'GitLab', forgejo: 'Forgejo', bitbucket: 'Bitbucket' } as Record<string, string>)[item.provider] || item.provider}</span>
                      <span className="break-all">{item.repository}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-collab-400">
                      <span className="rounded bg-collab-700 px-2 py-0.5">{item.kind === 'release' ? 'Release' : 'PR / merge request'}</span>
                      {item.state && <span>{item.state} when recorded</span>}
                      <span>{item.kind === 'release' ? 'Published ' : 'Updated '}<RelativeTime value={item.date} now={now} /></span>
                    </div>
                    <p className="text-xs text-collab-400">{item.refreshedAt ? <>{item.refreshIsAttempt ? 'Last refresh attempt: ' : 'Last refreshed: '}<RelativeTime value={item.refreshedAt} now={now} /></> : 'Refresh time not recorded'}</p>
                  </li>;
                })}
              </ul> : <div className="space-y-2 px-5 py-6 text-sm">
                <p className="font-medium text-collab-50">{repositories.connectionCount === 0 ? 'No connected repositories' : repositories.neverRefreshedCount === repositories.connectionCount ? 'Repository activity has not been refreshed yet' : 'No recent repository activity recorded'}</p>
                <p className="text-collab-400">{repositories.connectionCount === 0 ? 'Open a project’s Git providers settings to connect a repository.' : 'Open a connected project’s Git providers settings to refresh its activity.'}</p>
              </div>}
              {repositories.neverRefreshedCount > 0 && repositories.items.length > 0 && <p className="border-t border-collab-600 px-5 py-3 text-xs text-collab-400">{repositories.neverRefreshedCount} connected {repositories.neverRefreshedCount === 1 ? 'repository has' : 'repositories have'} not been refreshed yet.</p>}
              <p className="border-t border-collab-600 px-5 py-3 text-xs text-collab-400">Saved activity from the last refresh, not a live or complete list of open PRs. A release is not a deployment.</p>
            </>}
          </Panel>}
        {issues.kind === 'ready' && issues.dueSoon && <DueSoonPanel issues={issues.dueSoon} total={issues.summary.dueSoonIssues} workspaceSlug={workspaceSlug} now={now} />}
      </div>
    </div>

    {issues.kind === 'ready' && <ProjectsPanel
      issues={issues}
      workspaceSlug={workspaceSlug}
      scope={scope}
      kind={kind}
      dormant={dormant}
      dashboardPath={dashboardPath}
      clearHref={`${overviewHref({ q: '', page: 1 })}#project-overview`}
      previousHref={issues.projectPage > 1 ? `${overviewHref({ page: issues.projectPage - 1 })}#project-overview` : null}
      nextHref={issues.projectPage < issues.projectPages ? `${overviewHref({ page: issues.projectPage + 1 })}#project-overview` : null}
      dormantHref={`${overviewHref({ dormant: !dormant, page: 1 })}#project-overview`}
      now={now}
      needsByProject={needsByProject}
      seatsWorkingByProject={seatsWorkingByProject}
    />}
  </PageLayout>;
}
