import type { ReactNode } from 'react';
import { PageLayout } from '@/components/ui/page-layout';
import { PageHeader } from '@/components/ui/page-header';
import type { DashboardIssue, DashboardScope, RepositoryOverview, WorkspaceIssueOverview } from '@/types/workspace-dashboard';

type Props = {
  workspaceName: string;
  workspaceSlug: string;
  scope: DashboardScope;
  issues: WorkspaceIssueOverview;
  repositories: RepositoryOverview;
};

const linkStyle = 'rounded-sm text-blue-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400';
const controlStyle = 'rounded-md border border-collab-600 px-3 py-2 text-sm hover:bg-collab-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400';
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

function DateLabel({ value }: { value: string | null }) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? <time dateTime={date.toISOString()}>{dateFormat.format(date)} UTC</time>
    : <span>Not recorded</span>;
}

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

function IssueList({ issues, workspaceSlug, attentionAt }: { issues: DashboardIssue[]; workspaceSlug: string; attentionAt?: string }) {
  return <ul className="divide-y divide-collab-600">
    {issues.map(issue => {
      const overdue = attentionAt && issue.dueDate && new Date(issue.dueDate).getTime() < new Date(attentionAt).getTime();
      return <li key={issue.id} className="space-y-2 px-5 py-4">
        <a className={`${linkStyle} block text-sm font-medium`} href={`/${encodeURIComponent(workspaceSlug)}/issues/${encodeURIComponent(issue.issueKey || issue.id)}`}>{issue.title}</a>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-collab-400">
          {issue.issueKey && <span>{issue.issueKey}</span>}
          <span>{issue.project.name}</span>
          {attentionAt ? <>
            <span className={`rounded px-2 py-0.5 ${overdue ? 'bg-amber-400/10 text-amber-300' : 'bg-blue-400/10 text-blue-300'}`}>{overdue ? 'Overdue' : 'Due in the next 7 days'}</span>
            <DateLabel value={issue.dueDate} />
          </> : <>
            <span className="rounded bg-collab-700 px-2 py-0.5 text-collab-50">{issue.status}</span>
            <span>Updated <DateLabel value={issue.updatedAt} /></span>
          </>}
        </div>
      </li>;
    })}
  </ul>;
}

export default function WorkspaceOverview({ workspaceName, workspaceSlug, scope, issues, repositories }: Props) {
  const dashboardPath = `/${encodeURIComponent(workspaceSlug)}/dashboard`;
  const search = issues.kind === 'ready' ? issues.projectSearch : '';
  function overviewHref(nextScope: DashboardScope = scope, page = 1) {
    const params = new URLSearchParams();
    if (nextScope === 'mine') params.set('scope', 'mine');
    if (search) params.set('q', search);
    if (page > 1) params.set('page', String(page));
    return `${dashboardPath}${params.size ? `?${params}` : ''}`;
  }

  return <PageLayout wide className="gap-5 p-4 sm:p-8">
    <PageHeader title="Workspace overview" subtitle={`What needs attention across ${workspaceName}.`}>
      <nav aria-label="Work scope" className="flex w-fit gap-1 rounded-lg border border-collab-600 bg-collab-950 p-1">
        {(['all', 'mine'] as const).map(value => <a key={value} href={overviewHref(value)} aria-current={scope === value ? 'page' : undefined} className={`${controlStyle} border-0 ${scope === value ? 'bg-collab-700 text-collab-50' : 'text-collab-400'}`}>{value === 'all' ? 'All work' : 'My work'}</a>)}
      </nav>
    </PageHeader>

    <div id="issues-overview">
      {issues.kind !== 'ready' ? <Panel id="issue-summary" title="Collab issues" description="Open work and due dates across your accessible projects.">
        <SectionState kind={issues.kind} subject="Issue overview" reloadHref={`${overviewHref()}#issues-overview`} />
      </Panel> : <>
        <p className="mb-4 text-xs text-collab-400">{scope === 'mine' ? 'My work: Collab issues assigned to me.' : 'Collab issues across all accessible, active projects.'}</p>
        <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: 'Projects with open work', count: issues.summary.projectsWithOpenWork, note: `Of ${issues.summary.visibleProjects} accessible projects` },
            { label: 'Open Collab issues', count: issues.summary.openIssues, note: 'Excludes completed issues and Trash' },
            { label: 'Overdue', count: issues.summary.overdueIssues, note: 'Open issues past their due date' },
            { label: 'Due in the next 7 days', count: issues.summary.dueSoonIssues, note: 'Upcoming, unfinished work' },
          ].map(stat => <div key={stat.label} className="rounded-xl border border-collab-600 bg-collab-800 p-4 sm:p-5">
            <dt className="text-sm text-collab-400">{stat.label}</dt>
            <dd>
              <p className={`my-2 text-3xl font-medium tabular-nums ${stat.label === 'Overdue' && stat.count > 0 ? 'text-amber-300' : 'text-collab-50'}`}>{stat.count.toLocaleString('en-GB')}</p>
              <p className="text-xs text-collab-400">{stat.note}</p>
            </dd>
          </div>)}
        </dl>
      </>}
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-2">
      {issues.kind === 'ready' && <Panel id="needs-attention" title="Needs attention" description="Unfinished Collab issues with overdue or upcoming due dates.">
        {issues.attention.length ? <IssueList issues={issues.attention} workspaceSlug={workspaceSlug} attentionAt={issues.generatedAt} /> : <p className="px-5 py-6 text-sm text-collab-400">{scope === 'mine' ? 'No issues assigned to you are overdue or due in the next 7 days.' : 'No open issues are overdue or due in the next 7 days.'}</p>}
        {issues.attention.length > 0 && <p className="border-t border-collab-600 px-5 py-3 text-xs text-collab-400">Showing {issues.attention.length} of {(issues.summary.overdueIssues + issues.summary.dueSoonIssues).toLocaleString('en-GB')} issues needing attention. Earliest due first.</p>}
      </Panel>}

      <Panel id="repository-activity" title="Recent repository activity" description="PRs, merge requests and releases across the workspace. My work does not filter this section.">
        {repositories.kind !== 'ready' ? <SectionState kind={repositories.kind} subject="Repository activity" reloadHref={`${overviewHref(scope, issues.kind === 'ready' ? issues.projectPage : 1)}#repository-activity`} /> : <>
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
                  <span>{item.kind === 'release' ? 'Published ' : 'Updated '}<DateLabel value={item.date} /></span>
                </div>
                <p className="text-xs text-collab-400">{item.refreshedAt ? <>{item.refreshIsAttempt ? 'Last refresh attempt: ' : 'Last refreshed: '}<DateLabel value={item.refreshedAt} /></> : 'Refresh time not recorded'}</p>
              </li>;
            })}
          </ul> : <div className="space-y-2 px-5 py-6 text-sm">
            <p className="font-medium text-collab-50">{repositories.connectionCount === 0 ? 'No connected repositories' : repositories.neverRefreshedCount === repositories.connectionCount ? 'Repository activity has not been refreshed yet' : 'No recent repository activity recorded'}</p>
            <p className="text-collab-400">{repositories.connectionCount === 0 ? 'Open a project’s Git providers settings to connect a repository.' : 'Open a connected project’s Git providers settings to refresh its activity.'}</p>
          </div>}
          {repositories.neverRefreshedCount > 0 && repositories.items.length > 0 && <p className="border-t border-collab-600 px-5 py-3 text-xs text-collab-400">{repositories.neverRefreshedCount} connected {repositories.neverRefreshedCount === 1 ? 'repository has' : 'repositories have'} not been refreshed yet.</p>}
          <p className="border-t border-collab-600 px-5 py-3 text-xs text-collab-400">Saved activity from the last refresh, not a live or complete list of open PRs. A release is not a deployment.</p>
        </>}
      </Panel>
    </div>

    {issues.kind === 'ready' && <>
      <Panel id="project-overview" title="Project overview" description={scope === 'mine' ? 'Issue counts reflect work assigned to you. Attention first, then recent issue changes.' : 'Collab issue counts. Attention first, then recent issue changes.'}>
        <form action={dashboardPath} method="get" role="search" aria-label="Find a project" className="flex flex-wrap items-end gap-2 border-b border-collab-600 px-5 py-4">
          {scope === 'mine' && <input type="hidden" name="scope" value="mine" />}
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <label htmlFor="dashboard-project-search" className="mb-1 block text-xs text-collab-400">Find a project</label>
            <input id="dashboard-project-search" name="q" type="search" defaultValue={issues.projectSearch} placeholder="Project name" className="w-full rounded-md border border-collab-600 bg-collab-900 px-3 py-2 text-sm text-collab-50 placeholder:text-collab-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" />
          </div>
          <button type="submit" className={`${controlStyle} text-collab-50`}>Search</button>
          {search && <a href={`${dashboardPath}${scope === 'mine' ? '?scope=mine' : ''}#project-overview`} className={`${controlStyle} text-collab-400`}>Clear</a>}
        </form>
        {issues.projects.length ? <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-collab-900 text-xs text-collab-400"><tr>
              {['Project', 'Open Collab issues', 'Overdue', 'Due in 7 days', 'Latest issue change'].map(label => <th key={label} scope="col" className="whitespace-nowrap px-5 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-collab-600">
              {issues.projects.map(project => <tr key={project.id}>
                <th scope="row" className="px-5 py-4 font-medium"><a className={linkStyle} href={`/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(project.slug)}`}>{project.name}</a></th>
                <td className="px-5 py-4 tabular-nums text-collab-50">{project.openIssues}</td>
                <td className={`px-5 py-4 tabular-nums ${project.overdueIssues ? 'text-amber-300' : 'text-collab-400'}`}>{project.overdueIssues}</td>
                <td className="px-5 py-4 tabular-nums text-collab-400">{project.dueSoonIssues}</td>
                <td className="whitespace-nowrap px-5 py-4 text-xs text-collab-400">{project.lastIssueUpdatedAt ? <DateLabel value={project.lastIssueUpdatedAt} /> : 'No issue activity'}</td>
              </tr>)}
            </tbody>
          </table>
        </div> : <p className="px-5 py-6 text-sm text-collab-400">{search ? 'No projects match your search.' : 'No accessible active projects to show yet.'}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-collab-600 px-5 py-3 text-xs text-collab-400">
          <span>{issues.matchingProjects} {issues.matchingProjects === 1 ? 'project' : 'projects'}{search ? ' matching your search' : ''}</span>
          {issues.projectPages > 1 && <nav aria-label="Project pages" className="flex items-center gap-4">
            {issues.projectPage > 1 && <a className={linkStyle} href={`${overviewHref(scope, issues.projectPage - 1)}#project-overview`}>Previous</a>}
            <span>Page {issues.projectPage} of {issues.projectPages}</span>
            {issues.projectPage < issues.projectPages && <a className={linkStyle} href={`${overviewHref(scope, issues.projectPage + 1)}#project-overview`}>Next</a>}
          </nav>}
        </div>
      </Panel>

      <Panel id="recent-issues" title="Recently updated issues" description={scope === 'mine' ? 'Recent changes to Collab issues assigned to you.' : 'Continue where the team left off.'}>
        {issues.recent.length ? <IssueList issues={issues.recent} workspaceSlug={workspaceSlug} /> : <p className="px-5 py-6 text-sm text-collab-400">{scope === 'mine' ? 'No issues assigned to you yet.' : 'No issue activity recorded yet.'}</p>}
      </Panel>
    </>}
  </PageLayout>;
}
