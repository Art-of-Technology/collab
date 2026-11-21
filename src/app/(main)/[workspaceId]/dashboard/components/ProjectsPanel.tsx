import type { ReactNode } from 'react';
import type { DashboardScope, NeedsYouKind, WorkspaceIssueOverview } from '@/types/workspace-dashboard';
import RelativeTime from './RelativeTime';

type Props = {
  issues: Extract<WorkspaceIssueOverview, { kind: 'ready' }>;
  workspaceSlug: string;
  scope: DashboardScope;
  kind?: NeedsYouKind;
  dormant: boolean;
  dashboardPath: string;
  clearHref: string;
  previousHref: string | null;
  nextHref: string | null;
  dormantHref: string;
  now: string;
  needsByProject: Record<string, number> | null;
  seatsWorkingByProject: Record<string, number> | null;
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

export default function ProjectsPanel({
  issues, workspaceSlug, scope, kind, dormant, dashboardPath, clearHref, previousHref, nextHref, now,
}: Props) {
  const search = issues.projectSearch;

  return <Panel id="project-overview" title="Project overview" description={scope === 'mine' ? 'Issue counts reflect work assigned to you. Attention first, then recent issue changes.' : 'Collab issue counts. Attention first, then recent issue changes.'}>
    <form action={dashboardPath} method="get" role="search" aria-label="Find a project" className="flex flex-wrap items-end gap-2 border-b border-collab-600 px-5 py-4">
      {scope === 'mine' && <input type="hidden" name="scope" value="mine" />}
      {kind && <input type="hidden" name="kind" value={kind} />}
      {dormant && <input type="hidden" name="dormant" value="1" />}
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <label htmlFor="dashboard-project-search" className="mb-1 block text-xs text-collab-400">Find a project</label>
        <input id="dashboard-project-search" name="q" type="search" defaultValue={issues.projectSearch} placeholder="Project name" className="w-full rounded-md border border-collab-600 bg-collab-900 px-3 py-2 text-sm text-collab-50 placeholder:text-collab-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" />
      </div>
      <button type="submit" className={`${controlStyle} text-collab-50`}>Search</button>
      {search && <a href={clearHref} className={`${controlStyle} text-collab-400`}>Clear</a>}
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
            <td className="whitespace-nowrap px-5 py-4 text-xs text-collab-400">{project.lastIssueUpdatedAt ? <RelativeTime value={project.lastIssueUpdatedAt} now={now} /> : 'No issue activity'}</td>
          </tr>)}
        </tbody>
      </table>
    </div> : <p className="px-5 py-6 text-sm text-collab-400">{search ? 'No projects match your search.' : 'No accessible active projects to show yet.'}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-collab-600 px-5 py-3 text-xs text-collab-400">
      <span>{issues.matchingProjects} {issues.matchingProjects === 1 ? 'project' : 'projects'}{search ? ' matching your search' : ''}</span>
      {issues.projectPages > 1 && <nav aria-label="Project pages" className="flex items-center gap-4">
        {previousHref && <a className={linkStyle} href={previousHref}>Previous</a>}
        <span>Page {issues.projectPage} of {issues.projectPages}</span>
        {nextHref && <a className={linkStyle} href={nextHref}>Next</a>}
      </nav>}
    </div>
  </Panel>;
}
