import type { Prisma } from '@prisma/client';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { prisma } from '@/lib/prisma';

const DAY = 86_400_000;
const PACE_DAYS = 21;
type Verdict = 'on_track' | 'at_risk' | 'behind';
const day = (date: Date) => Math.floor(date.getTime() / DAY);
const dateOf = (value: number | null) => value === null ? null : new Date(value * DAY).toISOString();
const percent = (done: number, total: number) => total ? Math.round(100 * done / total) : 0;

const overviewIssueSelect = {
  id: true, issueKey: true, title: true, type: true, milestoneId: true,
  createdAt: true, firstStartedAt: true, finishedAt: true, dueDate: true, startDate: true,
  baselineStartDate: true, baselineDueDate: true,
  projectStatus: { select: { isFinal: true, category: true } },
} satisfies Prisma.IssueSelect;

type OverviewIssue = Prisma.IssueGetPayload<{ select: typeof overviewIssueSelect }>;
const isDone = (issue: OverviewIssue) => issue.projectStatus?.isFinal === true;
const issueRef = ({ id, issueKey, title }: OverviewIssue) => ({ id, issueKey, title });

export function calculateProjectOverview(
  issues: OverviewIssue[],
  baselineAt: Date | null,
  now: Date,
) {
  const today = day(now);
  const work = issues.filter(issue => issue.type !== 'MILESTONE');
  const done = work.filter(isDone);
  const open = work.filter(issue => !isDone(issue));
  const windowStart = now.getTime() - PACE_DAYS * DAY;
  const recentClosures = done.filter(({ finishedAt }) =>
    finishedAt && finishedAt.getTime() >= windowStart && finishedAt <= now).length;

  const byMilestone = new Map<string, OverviewIssue[]>();
  for (const issue of work) {
    if (!issue.milestoneId) continue;
    const linked = byMilestone.get(issue.milestoneId) ?? [];
    linked.push(issue);
    byMilestone.set(issue.milestoneId, linked);
  }

  const ordered = issues.filter(issue => issue.type === 'MILESTONE').sort((a, b) =>
    ((a.baselineDueDate ?? a.dueDate)?.getTime() ?? Infinity) -
    ((b.baselineDueDate ?? b.dueDate)?.getTime() ?? Infinity) ||
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  let previousEnd: number | null = null;
  const milestones = ordered.map(issue => {
    const linked = byMilestone.get(issue.id) ?? [];
    const completed = linked.filter(isDone).length;
    const remaining = linked.length - completed;
    const finished = isDone(issue);
    const due = issue.dueDate ? day(issue.dueDate) : null;
    const baseline = issue.baselineDueDate ? day(issue.baselineDueDate) : null;
    let start = issue.startDate ? day(issue.startDate) : previousEnd;
    let end = due;

    if (finished) {
      const workDates = linked.map(item => day(item.firstStartedAt ?? item.createdAt));
      const finishDates = linked.flatMap(item => item.finishedAt ? [day(item.finishedAt)] : []);
      start = workDates.reduce<number | null>((earliest, date) => earliest === null ? date : Math.min(earliest, date),
        issue.firstStartedAt ? day(issue.firstStartedAt) : null);
      end = finishDates.reduce<number | null>((latest, date) => latest === null ? date : Math.max(latest, date),
        issue.finishedAt ? day(issue.finishedAt) : null);
    }
    previousEnd = end ?? previousEnd;

    const forecastStart = Math.max(today, start ?? today);
    const forecast = finished ? null : remaining === 0 ? forecastStart : recentClosures
      ? forecastStart + Math.ceil(remaining * PACE_DAYS / recentClosures)
      : null;
    const comparison = finished ? end : forecast;
    return {
      ...issueRef(issue), finished, completed, total: linked.length, progress: percent(completed, linked.length),
      startDate: dateOf(start), endDate: dateOf(end), dueDate: dateOf(due),
      baselineStartDate: issue.baselineStartDate?.toISOString() ?? null, baselineDueDate: dateOf(baseline),
      forecastDate: dateOf(forecast),
      driftDays: comparison === null || baseline === null ? null : comparison - baseline,
      daysUntilDue: due === null ? null : due - today,
    };
  });

  const unfinished = milestones.filter(milestone => !milestone.finished);
  const late = unfinished.filter(milestone => (milestone.driftDays ?? 0) > 0)
    .sort((a, b) => (b.driftDays ?? 0) - (a.driftDays ?? 0));
  const worst = late[0]?.driftDays ?? 0;
  const comparable = unfinished.length ? unfinished : milestones;
  const hasBaseline = baselineAt !== null && comparable.some(milestone => milestone.baselineDueDate);
  const missingForecast = unfinished.some(milestone => milestone.baselineDueDate && !milestone.forecastDate);
  const verdict: Verdict | null = !hasBaseline ? null : worst > 7 ? 'behind' : worst >= 3 ? 'at_risk'
    : missingForecast ? null : 'on_track';
  const dated = unfinished.flatMap(milestone => milestone.daysUntilDue === null ? []
    : [{ milestone, daysUntilDue: milestone.daysUntilDue }]).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const nextMilestone = (dated.find(item => item.daysUntilDue >= 0) ?? dated[0])?.milestone ?? unfinished[0];
  const milestoneIds = new Set(milestones.map(milestone => milestone.id));

  return {
    milestones, verdict, hasBaseline,
    baselineAt: baselineAt?.toISOString() ?? null,
    pacePerWeek: recentClosures / 3,
    nextMilestoneId: nextMilestone?.id ?? null,
    lateMilestoneIds: late.map(milestone => milestone.id),
    unplanned: open.filter(issue => !issue.milestoneId || !milestoneIds.has(issue.milestoneId)).map(issueRef),
    stats: {
      total: work.length,
      done: done.length,
      donePercent: percent(done.length, work.length),
      open: open.length,
      overdue: open.filter(issue => issue.dueDate && day(issue.dueDate) < today).length,
      addedSinceBaseline: baselineAt ? work.filter(issue => issue.createdAt > baselineAt).length : null,
    },
  };
}

export async function loadProjectOverview(projectId: string, workspaceId: string, userId: string, now: Date) {
  const issueWhere = { projectId, workspaceId, deletedAt: null, AND: [issueReadAccessWhere(userId)] };
  const projectWhere = { id: projectId, workspaceId, workspace: postWorkspaceAccessWhere(userId) };
  const seatRunWhere = { workspaceId, issue: issueWhere, state: 'finished', seatId: { not: null }, seat: { workspaceId } };
  const [issues, baseline, runCount, billing] = await Promise.all([
    prisma.issue.findMany({
      where: issueWhere,
      select: {
        ...overviewIssueSelect,
        targetRelations: {
          where: {
            relationType: 'BLOCKS',
            sourceIssue: {
              deletedAt: null,
              AND: [issueReadAccessWhere(userId), { OR: [{ statusId: null }, { projectStatus: { isFinal: false } }] }],
            },
          },
          select: { id: true },
          take: 1,
        },
      },
    }),
    prisma.projectBaseline.findFirst({
      where: { project: projectWhere },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true },
    }),
    prisma.agentRun.count({ where: seatRunWhere }),
    prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, status: true, role: { in: ['OWNER', 'ADMIN'], mode: 'insensitive' } } } },
        ],
      },
      select: { agentRuns: { where: seatRunWhere, select: { usage: true } } },
    }),
  ]);
  const overview = calculateProjectOverview(issues, baseline?.createdAt ?? null, now);
  const closed = issues.filter(issue => issue.type !== 'MILESTONE' && isDone(issue));
  const transitions = closed.length ? await prisma.issueActivity.findMany({
    where: {
      workspaceId, projectId, itemType: 'ISSUE', action: 'STATUS_CHANGED',
      itemId: { in: closed.map(issue => issue.id) },
      newStatus: { project: projectWhere, isFinal: true },
      OR: [{ oldStatusId: null }, { oldStatus: { project: projectWhere, isFinal: false } }],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { itemId: true, createdAt: true, user: { select: { agentSeat: { select: { workspaceId: true } } } } },
  }) : [];
  const finishTimes = new Map(closed.map(issue => [issue.id, issue.finishedAt]));
  const closers = new Map<string, boolean>();
  for (const transition of transitions) {
    const finishedAt = finishTimes.get(transition.itemId);
    // An older transition cannot explain the latest closure. In a transaction the event
    // timestamp can precede the trigger's statement timestamp.
    if (!finishedAt || day(transition.createdAt) < day(finishedAt) || closers.has(transition.itemId)) continue;
    closers.set(transition.itemId, transition.user.agentSeat?.workspaceId === workspaceId);
  }
  const closedByAgents = [...closers.values()].filter(Boolean).length;

  return {
    ...overview,
    blocked: issues.filter(issue => !isDone(issue) &&
      (issue.projectStatus?.category === 'blocked' || issue.targetRelations.length > 0)).map(issueRef),
    closedByAgents, closedByAgentsPercent: percent(closedByAgents, closed.length),
    runCount,
    ...(billing ? { agentSpendUsd: sumReportedRunCosts(billing.agentRuns) } : {}),
  };
}

function sumReportedRunCosts(runs: { usage: Prisma.JsonValue }[]) {
  // Run finish usage is attached to a finished run. The managed worker's cumulative
  // ledger stays on its heartbeat and is not a project run cost.
  let total: number | null = null;
  for (const { usage } of runs) {
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) continue;
    const amount = usage.estimatedUSD;
    if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) total = (total ?? 0) + amount;
  }
  return total;
}

export type ProjectOverview = Awaited<ReturnType<typeof loadProjectOverview>>;
