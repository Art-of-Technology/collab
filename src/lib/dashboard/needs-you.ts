import 'server-only';
import type { Prisma } from '@prisma/client';
import { LEGACY_FINAL_STATUSES } from '@/constants/project-statuses';
import { readForgeBindings } from '@/lib/forge/reader';
import { repositoryAccessWhere } from '@/lib/github/access';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { prisma } from '@/lib/prisma';
import type { DashboardScope, NeedsYouItem, NeedsYouKind, NeedsYouOverview } from '@/types/workspace-dashboard';

const day = 86_400_000;
const projectSelect = { id: true, slug: true, name: true, color: true } as const;
const kindOrder = { question: 0, review: 1, failed: 2, due: 3 };
const waitingRun = { state: 'finished', endedAt: { not: null }, outcome: { in: ['blocked', 'in_review'] } };

type ExitFacts = { askedUser: string; pullRequest: string | null; nextStep: string | null };
type Repository = { provider: string; baseUrl: string; repositoryPath: string };

function readFinish(details: string | null) {
  try {
    const facts = JSON.parse(details ?? 'null');
    if (typeof facts?.runId !== 'string' || typeof facts.askedUser !== 'string' || !facts.askedUser) return null;
    return {
      runId: facts.runId as string,
      askedUser: facts.askedUser as string,
      pullRequest: typeof facts.pullRequest === 'string' && facts.pullRequest ? facts.pullRequest as string : null,
      nextStep: typeof facts.nextStep === 'string' ? facts.nextStep as string : null,
    };
  } catch {
    return null;
  }
}

// Apply the repository overview's HTTP(S) and credential checks to the configured instance.
function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function reviewUrl(reference: string, repositories: Repository[]): string | null {
  const match = /^([\w.-]{1,100}\/[\w.-]{1,100})#([1-9]\d{0,9})$/.exec(reference);
  if (!match) return null;
  const [, path, number] = match;
  if (path.split('/').some(segment => segment === '.' || segment === '..')) return null;
  const matches = new Map<string, Repository>();
  for (const repository of repositories) {
    if (repository.repositoryPath.toLowerCase() !== path.toLowerCase()) continue;
    const provider = repository.provider.toLowerCase();
    const baseUrl = repository.baseUrl.replace(/\/+$/, '');
    // The GitHub sign-in and a provider connection can name the same repository.
    const key = `${provider} ${baseUrl}`;
    if (!matches.has(key)) matches.set(key, { ...repository, provider, baseUrl });
  }
  if (matches.size !== 1) return null;
  const [{ provider, baseUrl, repositoryPath }] = matches.values();
  const base = safeUrl(baseUrl);
  if (!base || base.search || base.hash) return null;
  const [owner, repo] = repositoryPath.split('/').map(encodeURIComponent);
  const repository = `${owner}/${repo}`;
  const routes: Record<string, string> = {
    github: `${repository}/pull/${number}`,
    forgejo: `${repository}/pulls/${number}`,
    gitlab: `${repository}/-/merge_requests/${number}`,
    bitbucket: `${repository}/pull-requests/${number}`,
    'bitbucket-dc': `projects/${owner}/repos/${repo}/pull-requests/${number}/overview`,
  };
  const route = Object.hasOwn(routes, provider) ? routes[provider] : null;
  return route ? safeUrl(`${base.href.replace(/\/+$/, '')}/${route}`)?.href ?? null : null;
}

export async function loadNeedsYou({
  actorId, workspaceId, scope, kind, now = new Date(),
}: {
  actorId: string;
  workspaceId: string;
  scope: DashboardScope;
  kind?: NeedsYouKind;
  now?: Date;
}): Promise<NeedsYouOverview> {
  if (!actorId || !workspaceId) return { kind: 'denied' };
  try {
    const workspaceAccess = postWorkspaceAccessWhere(actorId);
    const workspace = await prisma.workspace.findFirst({ where: { ...workspaceAccess, id: workspaceId }, select: { id: true } });
    if (!workspace) return { kind: 'denied' };
    const permission = await checkUserPermission(actorId, workspaceId, Permission.VIEW_TASKS);
    if (permission.reason === 'Internal error') return { kind: 'unavailable' };
    if (!permission.hasPermission) return { kind: 'denied' };

    const projectWhere = { workspaceId, workspace: workspaceAccess, OR: [{ isArchived: false }, { isArchived: null }] };
    const readableIssues = { workspaceId, project: projectWhere, AND: [issueReadAccessWhere(actorId)] };
    const dueBefore = new Date(now.getTime() + 7 * day);
    const issues = await prisma.issue.findMany({
      where: {
        ...readableIssues,
        OR: [
          { assigneeId: actorId, dueDate: { lt: dueBefore } },
          { assigneeId: { not: null }, agentRuns: { some: { workspaceId, seatId: { not: null }, ...waitingRun } } },
          { agentRuns: { some: { workspaceId, endedAt: null, OR: [{ state: 'lost' }, { leaseUntil: { lt: now } }] } } },
        ],
      },
      select: {
        id: true, issueKey: true, title: true, project: { select: projectSelect }, assigneeId: true, createdAt: true, dueDate: true,
        status: true, statusValue: true, projectStatus: { select: { category: true, isFinal: true } },
        helpers: { select: { userId: true, approvedAt: true, assignedAt: true } },
        // An open run is unique per issue and is always the latest. Fetch the latest before testing its outcome.
        agentRuns: { orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 1, select: {
          id: true, workspaceId: true, userId: true, state: true, outcome: true, startedAt: true, endedAt: true, leaseUntil: true,
          seat: { select: { id: true, name: true, userId: true, ownerId: true, projectId: true, workspaceId: true } },
        } },
      },
    });
    const rows: NeedsYouItem[] = [];
    const waiting = new Map<string, {
      issue: NeedsYouItem['issue'];
      seat: { id: string; name: string; ownerId: string | null; userId: string };
      runId: string;
      endedAt: Date;
    }>();
    const due: Array<{ issue: NeedsYouItem['issue']; since: Date }> = [];
    const add = (kind: NeedsYouKind, issue: NeedsYouItem['issue'], since: Date, details: Partial<NeedsYouItem> = {}) => {
      rows.push({ kind, id: `${kind}:${issue.id}`, issue, since: since.toISOString(), seat: null,
        text: null, pullRequestUrl: null, runId: null, canAct: false, ...details });
    };

    for (const { id, issueKey, title, project, assigneeId, createdAt, dueDate, status, statusValue, projectStatus, helpers, agentRuns } of issues) {
      const issue = { id, issueKey, title, project };
      const legacyDone = LEGACY_FINAL_STATUSES.has((statusValue?.trim() || status?.trim() || '').toLowerCase());
      if (!(projectStatus?.isFinal ?? legacyDone) && assigneeId === actorId && dueDate && dueDate < dueBefore) {
        due.push({ issue, since: dueDate });
      }
      const run = agentRuns[0];
      if (!run || run.workspaceId !== workspaceId) continue;
      const seat = run.seat?.workspaceId === workspaceId && run.seat.projectId === project.id ? run.seat : null;
      if (!run.endedAt && (run.state === 'lost' || (run.leaseUntil && run.leaseUntil < now))) {
        if (scope === 'all' || assigneeId === actorId || seat?.ownerId === actorId) {
          add('failed', issue, run.leaseUntil ?? run.startedAt, { runId: run.id, seat: seat && { id: seat.id, name: seat.name } });
        }
      }

      const done = projectStatus?.category != null ? projectStatus.category === 'done' : projectStatus?.isFinal ?? legacyDone;
      if (done || !seat || assigneeId !== seat.userId || run.userId !== seat.userId
        || run.state !== 'finished' || !run.endedAt || !waitingRun.outcome.in.includes(run.outcome ?? '')) continue;
      const helper = helpers.find(row => row.userId === assigneeId);
      if (run.endedAt >= (helper?.approvedAt ?? helper?.assignedAt ?? createdAt)) {
        waiting.set(id, { issue, seat, runId: run.id, endedAt: run.endedAt });
      }
    }

    const waitingIds = [...waiting.keys()];
    const dueProjects = [...new Set(due.map(row => row.issue.project.id))];
    const oldestFinish = [...waiting.values()].reduce((earliest, row) => Math.min(earliest, row.endedAt.getTime()), now.getTime());
    const [finishes, comments, activeProjects] = await Promise.all([
      waitingIds.length ? prisma.issueActivity.findMany({
        where: { workspaceId, itemType: 'ISSUE', itemId: { in: waitingIds }, action: 'AGENT_RUN_FINISHED' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { itemId: true, projectId: true, userId: true, details: true },
      }) : [],
      waitingIds.length ? prisma.issueComment.groupBy({
        by: ['issueId', 'authorId'],
        where: { issueId: { in: waitingIds }, issue: readableIssues, createdAt: { gt: new Date(oldestFinish) } },
        _max: { createdAt: true },
      }) : [],
      dueProjects.length ? prisma.issue.groupBy({
        by: ['projectId'],
        where: { ...readableIssues, projectId: { in: dueProjects }, updatedAt: { gte: new Date(now.getTime() - 30 * day) } },
      }) : [],
    ]);

    const answered = new Set<string>();
    for (const reply of comments) {
      const current = waiting.get(reply.issueId);
      const latest = reply._max.createdAt;
      if (current && latest && latest > current.endedAt && reply.authorId !== current.seat.userId) answered.add(reply.issueId);
    }
    const factsByIssue = new Map<string, ExitFacts>();
    for (const activity of finishes) {
      const current = waiting.get(activity.itemId);
      if (!current || answered.has(activity.itemId) || factsByIssue.has(activity.itemId)
        || activity.projectId !== current.issue.project.id || activity.userId !== current.seat.userId) continue;
      const facts = readFinish(activity.details);
      if (facts?.runId === current.runId) factsByIssue.set(activity.itemId, facts);
    }

    const waitingSeats = new Map<string, { seatId: string; issueKey: string | null }>();
    const orderedWaiting = [...waiting.values()].sort((a, b) => a.endedAt.getTime() - b.endedAt.getTime() || a.issue.id.localeCompare(b.issue.id));
    for (const { issue, seat, endedAt } of orderedWaiting) {
      const facts = factsByIssue.get(issue.id);
      if (!facts) continue;
      if (!waitingSeats.has(seat.id)) waitingSeats.set(seat.id, { seatId: seat.id, issueKey: issue.issueKey });
      if (scope === 'all' || facts.askedUser === actorId || seat.ownerId === actorId || seat.userId === actorId) {
        add(facts.pullRequest ? 'review' : 'question', issue, endedAt, { seat: { id: seat.id, name: seat.name }, text: facts.nextStep });
      }
    }
    const activeIds = new Set(activeProjects.map(project => project.projectId));
    for (const row of due) if (activeIds.has(row.issue.project.id)) add('due', row.issue, row.since);

    const counts = { question: 0, review: 0, failed: 0, due: 0 };
    const byProject = new Map<string, number>();
    for (const row of rows) {
      counts[row.kind]++;
      const projectId = row.issue.project.id;
      byProject.set(projectId, (byProject.get(projectId) ?? 0) + 1);
    }
    const oldest = rows.find(row => row.kind === 'question');
    const items = rows.filter(row => !kind || row.kind === kind)
      .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.since.localeCompare(b.since) || a.id.localeCompare(b.id)).slice(0, 20);
    const reviewProjects = [...new Set(items.filter(item => item.kind === 'review').map(item => item.issue.project.id))];
    const repoProjects = { ...projectWhere, id: { in: reviewProjects } } satisfies Prisma.ProjectWhereInput;
    const [connections, github, assign, forgeBindings] = await Promise.all([
      reviewProjects.length ? prisma.gitConnection.findMany({
        where: { isActive: true, project: repoProjects },
        select: { projectId: true, provider: true, baseUrl: true, repositoryPath: true },
      }) : [],
      reviewProjects.length ? prisma.repository.findMany({
        where: { isActive: true, AND: [repositoryAccessWhere(actorId), { project: repoProjects }] },
        select: { projectId: true, fullName: true },
      }) : [],
      items.some(item => item.kind === 'failed') ? checkUserPermission(actorId, workspaceId, Permission.ASSIGN_TASK) : null,
      items.some(item => item.kind === 'question') ? readForgeBindings() : [],
    ]);
    const repositories = [...github.map(row => ({ projectId: row.projectId, provider: 'github',
      baseUrl: 'https://github.com', repositoryPath: row.fullName })), ...connections];
    const forgeProjects = new Set(forgeBindings.map(binding => binding.projectId));
    for (const item of items) {
      if (item.kind === 'question') item.canAct = !forgeProjects.has(item.issue.project.id);
      if (item.kind === 'failed') item.canAct = assign?.hasPermission ?? false;
      const reference = factsByIssue.get(item.issue.id)?.pullRequest;
      if (item.kind === 'review' && reference) {
        item.pullRequestUrl = reviewUrl(reference, repositories.filter(repo => repo.projectId === item.issue.project.id));
      }
    }

    return {
      kind: 'ready', generatedAt: now.toISOString(),
      oldestQuestion: oldest?.seat ? { seatName: oldest.seat.name, since: oldest.since } : null,
      items, counts, byProject: Object.fromEntries(byProject), waitingSeats: [...waitingSeats.values()],
    };
  } catch {
    return { kind: 'unavailable' };
  }
}
