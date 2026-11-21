import type { Prisma } from '@prisma/client';
import { LEGACY_FINAL_STATUSES } from '@/constants/project-statuses';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { prisma } from '@/lib/prisma';
import { burnAccountSelect, calculateProjectBurn, type BurnAccount, type BurnTransition } from '@/lib/project-burn';

const DAY = 86_400_000;
const PACE_DAYS = 21;
const PAGE_SIZE = 500;
const FINISH_ACTIVITY_SKEW_MS = 60_000;
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
  reporterId: true, statusId: true, status: true, statusValue: true,
  createdAt: true, firstStartedAt: true, finishedAt: true, dueDate: true, startDate: true,
  baselineStartDate: true, baselineDueDate: true,
  projectStatus: { select: { isFinal: true, category: true, displayName: true } },
} satisfies Prisma.IssueSelect;

const statusFields = { isFinal: true, category: true } satisfies Prisma.ProjectStatusSelect;
const projectHomeStatusSelect = {
  ...statusFields, id: true, name: true, displayName: true, isActive: true, projectId: true,
} satisfies Prisma.ProjectStatusSelect;

type OverviewIssue = Prisma.IssueGetPayload<{ select: typeof overviewIssueSelect }>;
type ProjectHomeStatus = Prisma.ProjectStatusGetPayload<{ select: typeof projectHomeStatusSelect }>;
const legacyStatusLabel = (issue: Pick<OverviewIssue, 'status' | 'statusValue'>) =>
  issue.statusValue?.trim() || issue.status?.trim() || '';
const isLegacyFinal = (label: string) => LEGACY_FINAL_STATUSES.has(label.toLowerCase());
const isDone = (issue: Pick<OverviewIssue, 'projectStatus' | 'statusId' | 'status' | 'statusValue'>) =>
  issue.projectStatus?.isFinal ?? (!issue.statusId && isLegacyFinal(legacyStatusLabel(issue)));
const normalizeStatus = (label: string) => label.toLowerCase().replace(/[\s_-]+/g, '');
const issueRef = ({ id, issueKey, title }: Pick<OverviewIssue, 'id' | 'issueKey' | 'title'>) => ({ id, issueKey, title });
const milestoneTie = (a: OverviewIssue, b: OverviewIssue) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
const dateOrder = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? Infinity) - (b?.getTime() ?? Infinity);

function resolveLegacyStatus(label: string, activeStatuses: ProjectHomeStatus[]) {
  if (!label) return null;
  const exact = activeStatuses.filter(status => status.name === label || status.displayName === label);
  if (exact.length === 1) return exact[0];
  const key = normalizeStatus(label);
  const matches = activeStatuses.filter(status => [status.name, status.displayName].some(name => normalizeStatus(name) === key));
  if (matches.length === 1) return matches[0];
  if (!isLegacyFinal(label)) return null;
  const finalStatuses = activeStatuses.filter(status => status.isFinal);
  return finalStatuses.find(status => status.name === 'done') ?? (finalStatuses.length === 1 ? finalStatuses[0] : null);
}

function forecastFinish(today: number, start: number | null, remaining: number, recentClosures: number) {
  const forecastStart = Math.max(today, start ?? today);
  if (!remaining) return forecastStart;
  return recentClosures ? forecastStart + Math.ceil(remaining * PACE_DAYS / recentClosures) : null;
}

function milestoneWorkDates(issue: OverviewIssue, linked: OverviewIssue[]) {
  const workDates = linked.map(item => day(item.firstStartedAt ?? item.createdAt));
  const finishDates = linked.flatMap(item => item.finishedAt ? [day(item.finishedAt)] : []);
  return {
    start: workDates.reduce<number | null>((earliest, date) => earliest === null ? date : Math.min(earliest, date),
      issue.firstStartedAt ? day(issue.firstStartedAt) : null),
    end: finishDates.reduce<number | null>((latest, date) => latest === null ? date : Math.max(latest, date),
      issue.finishedAt ? day(issue.finishedAt) : null),
  };
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
    if (start !== null && due !== null && due < start) continue;
    if (start !== null) baselineStarts.set(issue.id, start);
    previousBaselineDue = due ?? previousBaselineDue;
  }

  let previousEnd: number | null = null;
  return milestones
    .map(issue => {
      const linked = byMilestone.get(issue.id) ?? [];
      const actual = isDone(issue) && !issue.startDate && !issue.dueDate ? milestoneWorkDates(issue, linked) : null;
      const sortTime = issue.dueDate?.getTime() ?? issue.startDate?.getTime() ?? (actual?.end ?? Infinity) * DAY;
      return { issue, linked, actual, sortTime };
    })
    .sort((a, b) => a.sortTime - b.sortTime || milestoneTie(a.issue, b.issue))
    .map(({ issue, linked, actual }) => {
      const completed = linked.filter(isDone).length;
      const due = issue.dueDate ? day(issue.dueDate) : null;
      const actualEnd = actual?.end ?? null;
      const start = actualEnd !== null ? Math.min(actual?.start ?? actualEnd, actualEnd)
        : issue.startDate ? day(issue.startDate) : due === null ? null : previousEnd ?? due;
      const invalidDates = start !== null && due !== null && due < start;
      if (!invalidDates) previousEnd = due ?? actualEnd ?? previousEnd;
      const decision = due !== null && !issue.startDate && !linked.length;
      const state: 'decision' | 'done' | 'running' | 'planned' = decision ? 'decision' : isDone(issue) ? 'done'
        : issue.firstStartedAt || issue.projectStatus?.category === 'in_progress' ? 'running' : 'planned';
      const forecast = due !== null && !invalidDates && state !== 'done' && !decision
        ? forecastFinish(today, start, linked.length - completed, recentClosures) : null;
      const baselineStart = baselineStarts.get(issue.id) ?? null;
      const baselineDue = baselineStart !== null && issue.baselineDueDate ? day(issue.baselineDueDate) : null;
      const end = due ?? actualEnd ?? start;
      const comparison = due === null || invalidDates ? null : Math.max(due, forecast ?? due);
      return {
        ...issueRef(issue), state, completed, total: linked.length,
        startDate: issue.startDate?.toISOString() ?? null, dueDate: dateOf(due),
        start: invalidDates ? null : decision ? due : start, end: invalidDates ? null : end, invalidDates,
        baselineStart, baselineDue,
        forecast,
        driftDays: comparison === null || baselineDue === null ? null : Math.max(0, comparison - baselineDue),
        isReporter: viewerId !== undefined && issue.reporterId === viewerId,
        issues: linked.map(item => ({ ...issueRef(item), status: item.projectStatus?.displayName ?? (legacyStatusLabel(item) || null) })),
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
      ({ start, end } = milestoneWorkDates(issue, linked));
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

export async function loadProjectHome(projectId: string, workspaceId: string, userId: string, createdAt: Date, now: Date, issuePrefix: string) {
  const readableIssue = { deletedAt: null, AND: [issueReadAccessWhere(userId)] };
  const issueWhere = { ...readableIssue, projectId, workspaceId };
  const projectWhere = { id: projectId, workspaceId, workspace: postWorkspaceAccessWhere(userId) };
  const seatRunWhere = { workspaceId, issue: issueWhere, state: 'finished', seatId: { not: null }, seat: { workspaceId } };
  const billingWhere = {
    id: workspaceId,
    OR: [
      { ownerId: userId },
      { members: { some: { userId, status: true, role: { in: ['OWNER', 'ADMIN'], mode: 'insensitive' as const } } } },
    ],
  };
  const dependencySelect = {
    id: true, issueKey: true, title: true, projectId: true, statusId: true, status: true, statusValue: true,
    assigneeId: true, updatedAt: true,
    projectStatus: { select: overviewIssueSelect.projectStatus.select },
    targetRelations: {
      where: { relationType: 'BLOCKS', sourceIssue: readableIssue },
      select: { sourceIssue: { select: { id: true } } },
    },
    sourceRelations: {
      where: { relationType: 'BLOCKED_BY', targetIssue: readableIssue },
      select: { targetIssue: { select: { id: true } } },
    },
  } satisfies Prisma.IssueSelect;
  const issueSelect = {
    ...overviewIssueSelect, ...dependencySelect,
    projectStatus: { select: { ...overviewIssueSelect.projectStatus.select, id: true, name: true, projectId: true } },
    agentRequestRole: true,
    assignee: { select: burnAccountSelect },
  } satisfies Prisma.IssueSelect;
  type DependencyIssue = Prisma.IssueGetPayload<{ select: typeof dependencySelect }>;
  const prerequisites = (issue: DependencyIssue) => [
    ...issue.targetRelations.map(({ sourceIssue }) => sourceIssue.id),
    ...issue.sourceRelations.map(({ targetIssue }) => targetIssue.id),
  ];
  const issues: Prisma.IssueGetPayload<{ select: typeof issueSelect }>[] = [];
  const blockedSince = new Map<string, Date>();
  const closingActors = new Map<string, BurnAccount | undefined>();
  const closureHistory = new Map<string, BurnTransition[]>();
  const projectStatuses = await prisma.projectStatus.findMany({
    where: { projectId, project: projectWhere },
    select: projectHomeStatusSelect,
  });
  const activeStatuses = projectStatuses.filter(status => status.isActive);

  function legacyActivityStatus(label: string | null) {
    if (!label) return undefined;
    const matches = projectStatuses.filter(status => status.name === label || status.displayName === label);
    return matches.length === 1 ? matches[0].isFinal : undefined;
  }

  async function readIssues() {
    for await (const stored of pages(after => prisma.issue.findMany({
      where: { ...issueWhere, id: after ? { gt: after } : undefined },
      select: issueSelect,
      take: PAGE_SIZE,
      orderBy: pageOrder,
    }))) {
      // Resolve old labels for Project Home only. A linked status takes precedence.
      const batch = stored.map(issue => issue.statusId === null
        ? { ...issue, projectStatus: resolveLegacyStatus(legacyStatusLabel(issue), activeStatuses) }
        : issue);
      issues.push(...batch);
      const datedIssues = new Map(batch.flatMap(issue => issue.type !== 'MILESTONE' && isDone(issue) && issue.finishedAt
        ? [[issue.id, issue.finishedAt]] as const : []));
      const workIds = batch.filter(issue => issue.type !== 'MILESTONE').map(issue => issue.id);
      const blockedIds = new Set(batch.filter(issue => !isDone(issue) && issue.projectStatus?.category === 'blocked').map(issue => issue.id));
      if (!workIds.length && !blockedIds.size) continue;
      for await (const changes of pages(after => prisma.issueActivity.findMany({
        where: {
          workspaceId, itemType: 'ISSUE', id: after ? { gt: after } : undefined,
          OR: [
            {
              projectId, itemId: { in: workIds }, action: 'STATUS_CHANGED',
              newStatus: { project: projectWhere, isFinal: true },
              OR: [{ oldStatusId: null }, { oldStatus: { project: projectWhere, isFinal: false } }],
            },
            {
              projectId, itemId: { in: workIds }, action: 'STATUS_CHANGED',
              oldStatus: { project: projectWhere, isFinal: true },
              newStatus: { project: projectWhere, isFinal: false },
            },
            {
              itemId: { in: workIds }, action: 'UPDATED', fieldName: 'status', newStatusId: null,
              OR: [{ projectId }, { projectId: null }],
            },
            {
              projectId, itemId: { in: [...blockedIds] }, action: 'STATUS_CHANGED',
              newStatus: { project: projectWhere, isFinal: false, category: 'blocked' },
              OR: [{ oldStatusId: null }, { oldStatus: { project: projectWhere, OR: [{ category: null }, { category: { not: 'blocked' } }] } }],
            },
          ],
        },
        orderBy: pageOrder,
        take: PAGE_SIZE,
        select: { id: true, itemId: true, createdAt: true, action: true, oldValue: true, newValue: true, oldStatusId: true,
          oldStatus: { select: statusFields }, newStatus: { select: statusFields }, user: { select: burnAccountSelect } },
      }))) {
        for (const change of changes) {
          const legacy = change.action === 'UPDATED';
          const { oldStatus, newStatus } = change;
          if (!legacy && blockedIds.has(change.itemId) && newStatus?.category === 'blocked' && !newStatus.isFinal &&
            (!change.oldStatusId || (oldStatus && oldStatus.category !== 'blocked'))) {
            const previous = blockedSince.get(change.itemId);
            if (!previous || change.createdAt > previous) blockedSince.set(change.itemId, change.createdAt);
          }
          const wasFinal = legacy ? legacyActivityStatus(change.oldValue) : change.oldStatusId ? oldStatus?.isFinal : false;
          const isFinal = legacy ? legacyActivityStatus(change.newValue) : newStatus?.isFinal;
          const closing = wasFinal === false && isFinal === true;
          if (!closing && !(wasFinal === true && isFinal === false)) continue;
          const finishedAt = datedIssues.get(change.itemId);
          if (finishedAt && change.createdAt.getTime() > finishedAt.getTime() + FINISH_ACTIVITY_SKEW_MS) continue;
          let transitions = closureHistory.get(change.itemId);
          if (!transitions) {
            transitions = [];
            closureHistory.set(change.itemId, transitions);
          }
          transitions.push({ at: change.createdAt, closed: closing, actor: change.user });
        }
      }
      for (const [issueId, finishedAt] of datedIssues) {
        const transitions = closureHistory.get(issueId);
        if (!transitions) continue;
        const finish = finishedAt.getTime();
        let lastReopen = -Infinity;
        for (const transition of transitions) {
          if (!transition.closed) lastReopen = Math.max(lastReopen, transition.at.getTime());
        }
        // The trigger and activity writers have different clocks. Match the
        // current finish within that skew, keeping closures before the reopen.
        let closest = Infinity;
        let actor: BurnAccount | undefined;
        const previousTransitions: BurnTransition[] = [];
        for (const transition of transitions) {
          const at = transition.at.getTime();
          const distance = Math.abs(at - finish);
          if (!transition.closed || at < lastReopen || distance > FINISH_ACTIVITY_SKEW_MS) {
            previousTransitions.push(transition);
          } else if (distance < closest) {
            closest = distance;
            actor = transition.actor;
          } else if (distance === closest && actor?.id !== transition.actor?.id) {
            actor = undefined;
          }
        }
        closingActors.set(issueId, actor);
        closureHistory.set(issueId, previousTransitions);
      }
    }
  }

  async function collect<Row extends { id: string }>(read: (after: string | undefined) => Promise<Row[]>) {
    const rows: Row[] = [];
    for await (const batch of pages(read)) rows.push(...batch);
    return rows;
  }

  const readRuns = (billing: boolean) => collect(after => prisma.agentRun.findMany({
    where: { ...seatRunWhere, ...(billing ? { workspace: billingWhere } : {}), id: after ? { gt: after } : undefined },
    select: { id: true, startedAt: true, endedAt: true, user: { select: burnAccountSelect }, usage: billing },
    orderBy: pageOrder, take: PAGE_SIZE,
  }));
  const workspaceAccountWhere = {
    OR: [
      { agentSeat: { workspaceId } },
      { ownedWorkspaces: { some: { id: workspaceId } } },
      { workspaceMemberships: { some: { workspaceId } } },
    ],
  } satisfies Prisma.UserWhereInput;
  const billingAtStart = !!await prisma.workspace.findFirst({ where: billingWhere, select: { id: true } });
  const [baseline, seats, storedMerges, initialRuns, logs] = await Promise.all([
    prisma.projectBaseline.findFirst({
      where: { project: projectWhere },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true, setById: true },
    }),
    collect(after => prisma.agentSeat.findMany({
      where: { workspaceId, project: projectWhere, retiredAt: null, id: after ? { gt: after } : undefined },
      select: { id: true, user: { select: burnAccountSelect } }, orderBy: pageOrder, take: PAGE_SIZE,
    })),
    collect(after => prisma.pullRequest.findMany({
      where: { state: 'MERGED', repository: { project: projectWhere }, id: after ? { gt: after } : undefined },
      select: { id: true, issueId: true, headBranchName: true, title: true, mergedAt: true, mergedBy: { select: {
        ...burnAccountSelect,
        ownedWorkspaces: { where: { id: workspaceId }, select: { id: true } },
        workspaceMemberships: { where: { workspaceId }, select: { id: true } },
      } } }, orderBy: pageOrder, take: PAGE_SIZE,
    })),
    readRuns(billingAtStart),
    collect(after => prisma.workLog.findMany({
      where: { workspaceId, issue: issueWhere, id: after ? { gt: after } : undefined },
      select: { id: true, timeSpent: true, user: { select: burnAccountSelect } },
      orderBy: pageOrder, take: PAGE_SIZE,
    })),
    readIssues(),
  ]);
  const issuesById = new Map(issues.map(issue => [issue.id, issue]));
  const issueIdsByKey = new Map(issues.flatMap(issue => issue.issueKey ? [[issue.issueKey.toUpperCase(), issue.id]] : []));
  const escapedPrefix = issuePrefix?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const issueKeyPattern = escapedPrefix ? new RegExp(`\\b${escapedPrefix}-\\d+\\b`, 'i') : null;
  const resolveKey = (text: string | null) => {
    const key = text && issueKeyPattern?.exec(text)?.[0];
    return key ? issueIdsByKey.get(key.toUpperCase()) : undefined;
  };
  // Some PRs first arrive as a merge or via sync, with a branch and title but no stored issue ID.
  const merges = storedMerges.map(merge => ({
    ...merge, issueId: merge.issueId ?? resolveKey(merge.headBranchName) ?? resolveKey(merge.title),
  }));
  const firstMergeByIssue = new Map<string, Date>();
  for (const { issueId, mergedAt } of merges) {
    if (!issueId || !mergedAt || !issuesById.has(issueId)) continue;
    const first = firstMergeByIssue.get(issueId);
    if (!first || mergedAt < first) firstMergeByIssue.set(issueId, mergedAt);
  }
  const changesByIssue = new Map<string, { createdAt: Date; oldValue: string | null }[]>();
  const linkedIssues = [...firstMergeByIssue];
  for (let start = 0; start < linkedIssues.length; start += PAGE_SIZE) {
    for await (const changes of pages(after => prisma.issueActivity.findMany({
      where: {
        workspaceId, itemType: 'ISSUE', id: after ? { gt: after } : undefined,
        fieldName: { in: ['assignee', 'assigneeId'] },
        OR: linkedIssues.slice(start, start + PAGE_SIZE).map(([itemId, mergedAt]) => ({
          itemId, createdAt: { gt: mergedAt },
        })),
      },
      select: { id: true, itemId: true, createdAt: true, oldValue: true },
      orderBy: pageOrder, take: PAGE_SIZE,
    }))) {
      for (const change of changes) {
        const history = changesByIssue.get(change.itemId) ?? [];
        history.push(change);
        changesByIssue.set(change.itemId, history);
      }
    }
  }
  for (const history of changesByIssue.values()) history.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  // The first assignment change after the merge records who held it at merge time.
  const mergeAssignments = merges.map(({ issueId, mergedAt }) => {
    if (!issueId || !mergedAt) return undefined;
    return changesByIssue.get(issueId)?.find(change => change.createdAt > mergedAt);
  });
  const historicalIds = [...new Set(mergeAssignments.flatMap(change => change?.oldValue ? [change.oldValue] : []))];
  const historicalAssignees = new Map<string, BurnAccount>();
  for (let start = 0; start < historicalIds.length; start += PAGE_SIZE) {
    const accounts = await prisma.user.findMany({
      where: { ...workspaceAccountWhere, id: { in: historicalIds.slice(start, start + PAGE_SIZE) } },
      select: burnAccountSelect,
    });
    for (const account of accounts) historicalAssignees.set(account.id, account);
  }
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
  const billingAllowed = billingAtStart && !!await prisma.workspace.findFirst({ where: billingWhere, select: { id: true } });
  // If billing access was revoked while reading, fetch the ordinary run fields
  // again. The billed query may have returned only the pages read before revocation.
  const runs = (billingAtStart && !billingAllowed ? await readRuns(false) : initialRuns).filter(run => run.user.agentSeat);
  const spend = billingAllowed ? runs.flatMap(({ user, endedAt, usage }) => {
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return [];
    const amount = usage.estimatedUSD;
    return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? [{ userId: user.id, endedAt, amount }] : [];
  }) : undefined;
  const overview = calculateProjectOverview(issues, baseline?.createdAt ?? null, now, userId);
  const work = issues.filter(issue => issue.type !== 'MILESTONE');
  const milestoneIds = new Set(overview.milestones.map(milestone => milestone.id));
  const workItems = work.map(issue => {
    const status = issue.projectStatus?.projectId === projectId ? issue.projectStatus : null;
    return {
      ...issueRef(issue),
      milestoneId: issue.milestoneId && milestoneIds.has(issue.milestoneId) ? issue.milestoneId : null,
      statusId: status?.id ?? null,
      status: status?.displayName ?? status?.name ?? (legacyStatusLabel(issue) || 'No status'),
      done: isDone(issue),
      blocked: status?.category === 'blocked',
      assignee: issue.assignee?.name ?? null,
      agent: issue.assignee?.agentSeat?.workspaceId === workspaceId,
    };
  });
  const burn = calculateProjectBurn({
    workspaceId, createdAt, now,
    work: work.map(issue => ({
      ...issue, done: isDone(issue), closer: closingActors.get(issue.id), history: closureHistory.get(issue.id),
    })),
    milestones: issues.flatMap(issue => issue.type === 'MILESTONE' && issue.dueDate
      ? [{ label: issue.issueKey ?? issue.title, dueDate: issue.dueDate, done: isDone(issue) }] : []),
    accounts: [...seats.map(seat => seat.user), ...work.flatMap(issue => issue.assignee ?? [])],
    merges: merges.map(({ issueId, mergedAt, mergedBy }, index) => {
      if (issueId) {
        const change = mergeAssignments[index];
        const assignee = change
          ? historicalAssignees.get(change.oldValue ?? '')
          : mergedAt && issuesById.get(issueId)?.assignee;
        return { mergedAt, mergedBy: assignee ?? null };
      }
      const inWorkspace = mergedBy && (mergedBy.agentSeat?.workspaceId === workspaceId ||
        mergedBy.ownedWorkspaces.length > 0 || mergedBy.workspaceMemberships.length > 0);
      return { mergedAt, mergedBy: inWorkspace ? mergedBy : null };
    }),
    runs, logs, spend,
  });
  // Project issues are already loaded. Read each additional prerequisite at most once.
  const dependencyIssues = new Map<string, DependencyIssue>(issues.map(issue => [issue.id, issue]));
  const seen = new Set(dependencyIssues.keys());
  const externalProjectIds = new Set<string>();
  let frontier: DependencyIssue[] = issues;
  while (frontier.length) {
    const missing: string[] = [];
    for (const issue of frontier) {
      if (issue.projectStatus?.isFinal) continue;
      for (const id of prerequisites(issue)) {
        if (seen.has(id)) continue;
        seen.add(id);
        missing.push(id);
      }
    }
    frontier = [];
    for (let start = 0; start < missing.length; start += PAGE_SIZE) {
      const batch = await prisma.issue.findMany({
        where: { ...readableIssue, id: { in: missing.slice(start, start + PAGE_SIZE) } },
        select: dependencySelect,
        take: PAGE_SIZE,
      });
      frontier.push(...batch);
      for (const issue of batch) {
        dependencyIssues.set(issue.id, issue);
        if (issue.statusId === null && legacyStatusLabel(issue)) externalProjectIds.add(issue.projectId);
      }
    }
  }
  const activeStatusesByProject = new Map([[projectId, activeStatuses]]);
  const externalProjects = [...externalProjectIds];
  for (let start = 0; start < externalProjects.length; start += PAGE_SIZE) {
    for await (const statuses of pages(after => prisma.projectStatus.findMany({
      where: {
        projectId: { in: externalProjects.slice(start, start + PAGE_SIZE) },
        project: { workspace: postWorkspaceAccessWhere(userId) },
        isActive: true,
        id: after ? { gt: after } : undefined,
      },
      select: projectHomeStatusSelect,
      orderBy: pageOrder,
      take: PAGE_SIZE,
    }))) {
      for (const status of statuses) {
        const active = activeStatusesByProject.get(status.projectId) ?? [];
        active.push(status);
        activeStatusesByProject.set(status.projectId, active);
      }
    }
  }
  const closedDependencies = new Set<string>();
  for (const issue of dependencyIssues.values()) {
    const status = issue.statusId === null && !issue.projectStatus
      ? resolveLegacyStatus(legacyStatusLabel(issue), activeStatusesByProject.get(issue.projectId) ?? [])
      : issue.projectStatus;
    if (status?.isFinal ?? isDone(issue)) closedDependencies.add(issue.id);
  }

  const terminals = new Set(dependencyIssues.keys());
  const dependents = new Map<string, string[]>();
  const remainingPrerequisites = new Map<string, number>();
  for (const issue of dependencyIssues.values()) {
    if (closedDependencies.has(issue.id)) continue;
    const links = prerequisites(issue).filter(id => dependencyIssues.has(id));
    const open = links.filter(id => !closedDependencies.has(id));
    // Prefer live prerequisites, keeping a closed link when it's the end of a longer chain.
    const next = open.length ? open : links;
    if (!next.length) continue;
    terminals.delete(issue.id);
    remainingPrerequisites.set(issue.id, next.length);
    for (const id of next) {
      const waiting = dependents.get(id) ?? [];
      waiting.push(issue.id);
      dependents.set(id, waiting);
    }
  }
  const blocked = issues.flatMap(issue => {
    if (isDone(issue) || issue.projectStatus?.category !== 'blocked') return [];
    const elapsed = day(now) - day(blockedSince.get(issue.id) ?? now);
    return [{ ...issueRef(issue), blockedDays: Math.max(0, elapsed) }];
  });
  const workThatCanWait = new Set(issues.filter(issue =>
    !isDone(issue) && issue.type !== 'MILESTONE' && issue.projectStatus?.category !== 'blocked').map(issue => issue.id));
  const waiting = [...terminals].flatMap(id => {
    if (!dependents.has(id)) return [];
    const pending = new Set([id]);
    const issueIds: string[] = [];
    for (const blockerId of pending) {
      for (const dependent of dependents.get(blockerId) ?? []) {
        if (pending.has(dependent)) continue;
        pending.add(dependent);
        // A direct link to already closed work doesn't make an issue wait.
        if (!closedDependencies.has(blockerId) && workThatCanWait.has(dependent)) issueIds.push(dependent);
      }
    }
    if (!issueIds.length) return [];
    const issue = dependencyIssues.get(id)!;
    const state: 'closed' | 'unassigned' | null = closedDependencies.has(id) ? 'closed'
      : !issue.assigneeId && now.getTime() - issue.updatedAt.getTime() >= 14 * DAY ? 'unassigned' : null;
    return [{ blocker: issueRef(issue), state, issueIds }];
  }).sort((a, b) => b.issueIds.length - a.issueIds.length ||
    (a.blocker.issueKey ?? a.blocker.title).localeCompare(b.blocker.issueKey ?? b.blocker.title) ||
    a.blocker.id.localeCompare(b.blocker.id));

  // Remove branches from the terminals up. The remaining issues still lead into a cycle.
  const resolvable = [...terminals];
  for (const id of resolvable) {
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = remainingPrerequisites.get(dependent)! - 1;
      if (remaining) {
        remainingPrerequisites.set(dependent, remaining);
      } else {
        remainingPrerequisites.delete(dependent);
        resolvable.push(dependent);
      }
    }
  }
  const waitingOnCycle = [...remainingPrerequisites.keys()].filter(id => workThatCanWait.has(id));
  // The Overview tile keeps its original workspace-specific attribution.
  const closedByAgents = work.filter(issue => issue.agentRequestRole == null &&
    closingActors.get(issue.id)?.agentSeat?.workspaceId === workspaceId).length;
  const { agents, people, unmatched } = burn.closures;
  return {
    burn,
    overview: {
      ...overview, work: workItems, baselineSetBy: baselineSetter?.name ?? null,
      blocked, waiting, waitingOnCycle,
      closedByAgents, closedByAgentsPercent: percent(closedByAgents, agents + people + unmatched),
      runCount: burn.runCount,
      ...(billingAllowed ? { agentSpendUsd: burn.spendUsd ?? null } : {}),
    },
  };
}

export type ProjectOverview = Awaited<ReturnType<typeof loadProjectHome>>['overview'];
