export type DashboardScope = 'all' | 'mine';

export type DashboardProject = { id: string; slug: string; name: string; color: string | null };

export type DashboardIssue = {
  id: string;
  issueKey: string | null;
  title: string;
  project: DashboardProject;
  status: string;
  dueDate: string | null;
  updatedAt: string;
};

export type WorkspaceIssueOverview = { kind: 'denied' | 'unavailable' } | {
  kind: 'ready';
  scope: DashboardScope;
  generatedAt: string;
  summary: {
    visibleProjects: number;
    projectsWithOpenWork: number;
    openIssues: number;
    overdueIssues: number;
    dueSoonIssues: number;
  };
  attention: DashboardIssue[];
  recent: DashboardIssue[];
  projects: Array<DashboardProject & {
    openIssues: number;
    overdueIssues: number;
    dueSoonIssues: number;
    lastIssueUpdatedAt: string | null;
  }>;
  projectSearch: string;
  projectPage: number;
  projectPages: number;
  matchingProjects: number;
};

export type RepositoryOverview = { kind: 'denied' | 'unavailable' } | {
  kind: 'ready';
  connectionCount: number;
  neverRefreshedCount: number;
  items: Array<{
    id: string;
    project: DashboardProject;
    provider: string;
    repository: string;
    kind: 'pull_request' | 'release';
    title: string;
    url: string | null;
    state: string | null;
    date: string;
    refreshedAt: string | null;
    refreshIsAttempt: boolean;
  }>;
};
