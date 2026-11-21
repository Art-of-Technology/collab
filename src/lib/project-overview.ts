import type { Prisma } from '@prisma/client';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { prisma } from '@/lib/prisma';

const DAY = 86_400_000;
const PACE_DAYS = 21;
const PAGE_SIZE = 500;
const pageOrder = { id: 'asc' } as const;

async function* pages<Row extends { id: string }>(read: (after: string | undefined) => Promise<Row[]>) {
  let after: string | undefined;
  while (true) {
    const batch = await read(after);
    if (batch.length) yield batch;
    if (batch.length < PAGE_SIZE) return;
    after = batch[batch.length - 1].id;
  }
}
type Verdict = 'on_track' | 'at_risk' | 'behind';
const day = (date: Date) => Math.floor(date.getTime() / DAY);
const dateOf = (value: number | null) => value === null ? null : new Date(value * DAY).toISOString();
const percent = (done: number, total: number) => total ? Math.round(100 * done / total) : 0;

const overviewIssueSelect = {
  id: true, issueKey: true, title: true, type: true, milestoneId: true,
  reporterId: true, status: true,
  createdAt: true, firstStartedAt: true, finishedAt: true, dueDate: true, startDate: true,
  baselineStartDate: true, baselineDueDate: true,
  projectStatus: { select: { isFinal: true, category: true, displayName: true } },
} satisfies Prisma.IssueSelect;

type OverviewIssue = Prisma.IssueGetPayload<{ select: typeof overviewIssueSelect }>;
const isDone = (issue: OverviewIssue) => issue.projectStatus?.isFinal === true;
const issueRef = ({ id, issueKey, title }: OverviewIssue) => ({ id, issueKey, title });
const milestoneTie = (a: OverviewIssue, b: OverviewIssue) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
const dateOrder = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? Infinity) - (b?.getTime() ?? Infinity);

function forecastFinish(today: number, start: number | null, remaining: number, recentClosures: number) {
  const forecastStart = Math.max(today, start ?? today);
  if (!remaining) return forecastStart;
  return recentClosures ? forecastStart + Math.ceil(remaining * PACE_DAYS / recentClosures) : null;
}

function planMilestones(
  milestones: OverviewIssue[], byMilestone: Map<string, OverviewIssue[]>,
  today: number, recentClosures: number, viewerId: string | undefined,
) {
  // Infer the saved starts in baseline order so edits to the current plan
  // cannot move the outlines or the boundary between two saved milestones.
  const baselineStarts = new Map<string, number>();
  let previousBaselineDue: number | null = null;
  const baselineOrder = milestones.filter(issue => issue.baselineStartDate || issue.baselineDueDate)
    .sort((a, b) => dateOrder(a.baselineDueDate ?? a.baselineStartDate, b.baselineDueDate ?? b.baselineStartDate) || milestoneTie(a, b));
  for (const issue of baselineOrder) {
    const due = issue.baselineDueDate ? day(issue.baselineDueDate) : null;
    const start = issue.baselineStartDate ? day(issue.baselineStartDate) : previousBaselineDue ?? due;
    if (start !== null) baselineStarts.set(issue.id, start);
    previousBaselineDue = due ?? previousBaselineDue;
  }

  let previousDue: number | null = null;
  return [...milestones]
    .sort((a, b) => dateOrder(a.dueDate ?? a.startDate, b.dueDate ?? b.startDate) || milestoneTie(a, b))
    .map(issue => {
      const linked = byMilestone.get(issue.id) ?? [];
      const completed = linked.filter(isDone).length;
      const due = issue.dueDate ? day(issue.dueDate) : null;
      const start = issue.startDate ? day(issue.startDate) : due === null ? null : previousDue ?? due;
      previousDue = due ?? previousDue;
      const decision = due !== null && !issue.startDate && !linked.length;
      const state: 'decision' | 'done' | 'running' | 'planned' = decision ? 'decision' : isDone(issue) ? 'done'
        : issue.firstStartedAt || issue.projectStatus?.category === 'in_progress' ? 'running' : 'planned';
      const forecast = start !== null && state !== 'done' && !decision
        ? forecastFinish(today, start, linked.length - completed, recentClosures) : null;
      const baselineDue = issue.baselineDueDate ? day(issue.baselineDueDate) : null;
      const end = due ?? start;
      const comparison = due === null ? forecast : Math.max(due, forecast ?? due);
      return {
        ...issueRef(issue), state, completed, total: linked.length,
        startDate: issue.startDate?.toISOString() ?? null, dueDate: dateOf(due),
        start: decision ? due : start, end,
        baselineStart: baselineStarts.get(issue.id) ?? null, baselineDue,
        forecast,
        driftDays: comparison === null || baselineDue === null ? null : Math.max(0, comparison - baselineDue),
        isReporter: viewerId !== undefined && issue.reporterId === viewerId,
        issues: linked.map(item => ({ ...issueRef(item), status: item.projectStatus?.displayName ?? item.status })),
      };
    });
}

export function calculateProjectOverview(
  issues: OverviewIssue[],
  baselineAt: Date | null,
  now: Date,
  viewerId?: string,
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
    dateOrder(a.baselineDueDate ?? a.dueDate, b.baselineDueDate ?? b.dueDate) || milestoneTie(a, b));
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

    const forecast = finished ? null : forecastFinish(today, start, remaining, recentClosures);
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
    plan: { today, milestones: planMilestones(ordered, byMilestone, today, recentClosures, viewerId) },
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
  const billingWhere = {
    id: workspaceId,
    OR: [
      { ownerId: userId },
      { members: { some: { userId, status: true, role: { in: ['OWNER', 'ADMIN'], mode: 'insensitive' as const } } } },
    ],
  };
  const issueSelect = {
    ...overviewIssueSelect,
    targetRelations: {
      where: {
        relationType: 'BLOCKS',
        sourceIssue: {
          deletedAt: null,
          AND: [issueReadAccessWhere(userId), { OR: [{ statusId: null }, { projectStatus: { isFinal: false } }] }],
        },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 1,
    },
  } satisfies Prisma.IssueSelect;
  const issues: Prisma.IssueGetPayload<{ select: typeof issueSelect }>[] = [];
  const latestChange = new Map<string, { createdAt: Date; byAgent: boolean }>();

  async function readIssues() {
    for await (const batch of pages(after => prisma.issue.findMany({
      where: { ...issueWhere, id: after ? { gt: after } : undefined },
      select: issueSelect,
      take: PAGE_SIZE,
      orderBy: pageOrder,
    }))) {
      issues.push(...batch);
      const closedIds = batch.filter(issue => issue.type !== 'MILESTONE' && isDone(issue)).map(issue => issue.id);
      const blockedIds = batch.filter(issue => !isDone(issue) && issue.projectStatus?.category === 'blocked').map(issue => issue.id);
      if (!closedIds.length && !blockedIds.length) continue;
      for await (const changes of pages(after => prisma.issueActivity.findMany({
        where: {
          workspaceId, projectId, itemType: 'ISSUE', action: 'STATUS_CHANGED',
          id: after ? { gt: after } : undefined,
          OR: [
            {
              itemId: { in: closedIds },
              newStatus: { project: projectWhere, isFinal: true },
              OR: [{ oldStatusId: null }, { oldStatus: { project: projectWhere, isFinal: false } }],
            },
            {
              itemId: { in: blockedIds },
              newStatus: { project: projectWhere, isFinal: false, category: 'blocked' },
              OR: [{ oldStatusId: null }, { oldStatus: { project: projectWhere, OR: [{ category: null }, { category: { not: 'blocked' } }] } }],
            },
          ],
        },
        orderBy: pageOrder,
        take: PAGE_SIZE,
        select: { id: true, itemId: true, createdAt: true, user: { select: { agentSeat: { select: { workspaceId: true } } } } },
      }))) {
        for (const change of changes) {
          const previous = latestChange.get(change.itemId);
          if (!previous || change.createdAt >= previous.createdAt) {
            latestChange.set(change.itemId, {
              createdAt: change.createdAt, byAgent: change.user.agentSeat?.workspaceId === workspaceId,
            });
          }
        }
      }
    }
  }

  const agentSpend = async () => {
    // Run finish usage attaches per-run estimates. The managed worker's cumulative
    // ledger stays on its heartbeat and is not a project run cost.
    let total: number | null = null;
    for await (const batch of pages(after => prisma.agentRun.findMany({
      where: { ...seatRunWhere, workspace: billingWhere, id: after ? { gt: after } : undefined },
      select: { id: true, usage: true },
      orderBy: pageOrder,
      take: PAGE_SIZE,
    }))) {
      for (const { usage } of batch) {
        if (!usage || typeof usage !== 'object' || Array.isArray(usage)) continue;
        const amount = usage.estimatedUSD;
        if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) total = (total ?? 0) + amount;
      }
    }
    const allowed = await prisma.workspace.findFirst({ where: billingWhere, select: { id: true } });
    return allowed ? { agentSpendUsd: total } : {};
  };

  const [baseline, runCount, billing] = await Promise.all([
    prisma.projectBaseline.findFirst({
      where: { project: projectWhere },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true, setById: true },
    }),
    prisma.agentRun.count({ where: seatRunWhere }),
    agentSpend(),
    readIssues(),
  ]);
  const baselineSetter = baseline && await prisma.user.findFirst({
    where: {
      id: baseline.setById,
      OR: [
        { ownedWorkspaces: { some: { id: workspaceId, ...postWorkspaceAccessWhere(userId) } } },
        { workspaceMemberships: { some: { workspaceId, workspace: postWorkspaceAccessWhere(userId) } } },
      ],
    },
    select: { name: true },
  });
  const overview = calculateProjectOverview(issues, baseline?.createdAt ?? null, now, userId);
  const closed = issues.filter(issue => issue.type !== 'MILESTONE' && isDone(issue));
  const blocked = issues.filter(issue => !isDone(issue) &&
    (issue.projectStatus?.category === 'blocked' || issue.targetRelations.length > 0));
  const closedByAgents = closed.filter(issue => {
    const change = latestChange.get(issue.id);
    // Event timestamps from a transaction can precede the finish trigger's
    // statement timestamp, so compare the recorded calendar dates.
    return change?.byAgent && issue.finishedAt && day(change.createdAt) >= day(issue.finishedAt);
  }).length;

  return {
    ...overview, baselineSetBy: baselineSetter?.name ?? null,
    blocked: blocked.map(issue => {
      const sinceStatus = latestChange.get(issue.id)?.createdAt ?? now;
      const sinceRelation = issue.targetRelations[0]?.createdAt ?? now;
      const elapsed = day(now) - Math.min(day(sinceStatus), day(sinceRelation));
      return { ...issueRef(issue), blockedDays: Math.max(0, elapsed) };
    }),
    closedByAgents, closedByAgentsPercent: percent(closedByAgents, closed.length),
    runCount, ...billing,
  };
}

export type ProjectOverview = Awaited<ReturnType<typeof loadProjectOverview>>;
