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
  dueSoon?: DashboardIssue[];
  dormant?: { projects: number; overdueIssues: number };
  showingDormant?: boolean;
  attention: DashboardIssue[];
  recent: DashboardIssue[];
  projects: Array<DashboardProject & {
    openIssues: number;
    overdueIssues: number;
    dueSoonIssues: number;
    lastIssueUpdatedAt: string | null;
    finishedPerDay?: number[];
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

export type Panel<T> = { kind: 'denied' | 'unavailable' } | ({ kind: 'ready' } & T);

export type NeedsYouKind = 'question' | 'review' | 'failed' | 'due';

export type NeedsYouItem = {
  id: string; // `${kind}:${issueId}`
  kind: NeedsYouKind;
  issue: { id: string; issueKey: string | null; title: string; project: DashboardProject };
  seat: { id: string; name: string } | null;
  since: string; // Run end for questions and reviews, lease or start for failed runs, due date for due issues.
  text: string | null;
  question: string | null;
  ask: 'here' | 'issue' | 'elsewhere' | 'none'; // 'issue': several questions, answered on the issue's own page.
  replyOn: { id: string; issueKey: string } | null;
  options: string[];
  suggested: string | null;
  pullRequestUrl: string | null;
  runId: string | null;
  canAct: boolean;
};

export type NeedsYouOverview = Panel<{
  generatedAt: string;
  oldestQuestion: { seatName: string; since: string } | null;
  items: NeedsYouItem[];
  counts: Record<NeedsYouKind, number>;
  byProject: Record<string, number>;
  waitingSeats: Array<{ seatId: string; issueKey: string | null }>;
}>;

export type SeatState = 'working' | 'waiting_on_person' | 'failed' | 'idle';

export type AgentsNowOverview = Panel<{
  seats: Array<{
    id: string;
    name: string;
    projectId: string;
    state: Exclude<SeatState, 'waiting_on_person'>;
    issueKey: string | null;
  }>;
}>;

export type ShippedOverview = Panel<{
  items: Array<{
    id: string;
    kind: 'merged' | 'released';
    title: string;
    project: DashboardProject;
    repository: string;
    url: string | null;
    at: string;
  }>;
  total: number;
  connectionCount: number;
  staleRepositories: number;
}>;
