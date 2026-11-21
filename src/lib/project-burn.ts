const DAY = 86_400_000;
const WEEK = 7;
const HOUR = 3_600_000;

export const burnDay = (date: Date) => Math.floor(date.getTime() / DAY);
const weekOf = (day: number) => day - ((day + 3) % WEEK + WEEK) % WEEK;

export type BurnAccount = { id: string; name: string | null; agentSeat: { name: string; workspaceId: string } | null };
export const burnAccountSelect = {
  id: true, name: true, agentSeat: { select: { name: true, workspaceId: true } },
} as const;

type Work = { createdAt: Date; updatedAt: Date; finishedAt: Date | null; done: boolean; closer?: BurnAccount };
type Merge = { mergedAt: Date | null; mergedBy: BurnAccount | null };
type Run = { startedAt: Date; endedAt: Date | null; user: BurnAccount };
type Spend = { endedAt: Date | null; userId: string; amount: number };
type WorkCount = { agents: number; people: number; unmatched: number };
const count = (): WorkCount => ({ agents: 0, people: 0, unmatched: 0 });
// A seat is identified by the account. A seat name is only shown in its own workspace.
const group = (actor: BurnAccount | null | undefined) => actor ? (actor.agentSeat ? 'agents' : 'people') : 'unmatched';

export function calculateProjectBurn({
  workspaceId, createdAt, now, work, milestones, accounts, merges, runs, logs, spend,
}: {
  workspaceId: string;
  createdAt: Date;
  now: Date;
  work: Work[];
  milestones: { label: string; dueDate: Date }[];
  accounts: BurnAccount[];
  merges: Merge[];
  runs: Run[];
  logs: { user: BurnAccount; timeSpent: number }[];
  spend: Spend[] | undefined;
}) {
  const today = burnDay(now);
  const projectStart = Math.min(today, burnDay(createdAt));
  const contributors = new Map<string, {
    id: string; name: string; agent: boolean; issuesClosed: number; prsMerged: number;
    runs: number; runHours: number; hoursLogged: number; spendUsd?: number | null;
  }>();
  function contributor(account: BurnAccount) {
    let row = contributors.get(account.id);
    if (!row) {
      const seat = account.agentSeat?.workspaceId === workspaceId ? account.agentSeat : null;
      row = {
        id: account.id, name: seat?.name ?? account.name ?? 'Unnamed account',
        agent: !!account.agentSeat, issuesClosed: 0, prsMerged: 0, runs: 0, runHours: 0, hoursLogged: 0,
      };
      contributors.set(account.id, row);
    }
    return row;
  }
  for (const account of accounts) contributor(account);

  let historyStart = projectStart;
  let attributionStart = projectStart;
  let undated = 0;
  const closures = count();
  const scopeDays = new Map<number, number>();
  const closureDays = new Map<number, number>();
  const weeks = new Map<number, { day: number; issues: WorkCount; prs: WorkCount; spendUsd?: number }>();
  function week(day: number) {
    const start = weekOf(day);
    let entry = weeks.get(start);
    if (!entry) {
      entry = { day: start, issues: count(), prs: count() };
      weeks.set(start, entry);
    }
    return entry;
  }
  const increment = (days: Map<number, number>, day: number) => days.set(day, (days.get(day) ?? 0) + 1);
  const pace = [0, 0, 0];
  let remaining = 0;

  for (const issue of work) {
    increment(scopeDays, burnDay(issue.createdAt));
    if (!issue.done) {
      remaining++;
      continue;
    }
    closures[group(issue.closer)]++;
    if (issue.closer) contributor(issue.closer).issuesClosed++;
    if (!issue.finishedAt || issue.finishedAt > now) {
      undated++;
      historyStart = Math.max(historyStart, Math.min(today, burnDay(issue.updatedAt) + 1));
      continue;
    }
    const finish = burnDay(issue.finishedAt);
    increment(closureDays, finish);
    week(finish).issues[group(issue.closer)]++;
    if (!issue.closer) attributionStart = Math.max(attributionStart, Math.min(today, finish + 1));
    const age = (now.getTime() - issue.finishedAt.getTime()) / DAY;
    if (age < WEEK * pace.length) pace[Math.floor(age / WEEK)]++;
  }

  let closed = undated;
  let scope = 0;
  const points: { day: number; scope: number; closed: number }[] = [];
  const recentStart = Math.max(historyStart, today - 29);
  const days = new Set([historyStart, recentStart, today, ...scopeDays.keys(), ...closureDays.keys()]);
  for (const day of [...days].sort((a, b) => a - b)) {
    if (day > today) break;
    scope += scopeDays.get(day) ?? 0;
    closed += closureDays.get(day) ?? 0;
    if (day >= historyStart) points.push({ day, scope, closed });
  }

  const average = pace.reduce((sum, value) => sum + value, 0) / pace.length;
  const slowest = Math.min(...pace);
  const fastest = Math.max(...pace);
  const reliablePace = historyStart === projectStart || historyStart <= today - 21;
  const finishAt = (weekly: number) => today + Math.ceil(remaining * WEEK / weekly);
  const forecast = remaining && average && reliablePace ? {
    day: finishAt(average), earliest: finishAt(fastest), latest: slowest ? finishAt(slowest) : null, remaining,
  } : null;

  const prCounts = count();
  let undatedPrs = 0;
  let firstMergeDay: number | undefined;
  for (const pr of merges) {
    prCounts[group(pr.mergedBy)]++;
    if (pr.mergedBy) contributor(pr.mergedBy).prsMerged++;
    if (!pr.mergedAt || pr.mergedAt > now) {
      undatedPrs++;
      continue;
    }
    const day = burnDay(pr.mergedAt);
    firstMergeDay = Math.min(firstMergeDay ?? day, day);
    week(day).prs[group(pr.mergedBy)]++;
  }

  let runHours = 0;
  for (const run of runs) {
    const row = contributor(run.user);
    const hours = run.endedAt ? Math.max(0, run.endedAt.getTime() - run.startedAt.getTime()) / HOUR : 0;
    row.runs++;
    row.runHours += hours;
    runHours += hours;
  }

  for (const { user, timeSpent } of logs) {
    if (!user.agentSeat) contributor(user).hoursLogged += timeSpent / 60;
  }
  const people = [...contributors.values()].filter(row => !row.agent);
  let spendTotal: number | null = null;
  if (spend) {
    for (const run of spend) {
      spendTotal = (spendTotal ?? 0) + run.amount;
      const row = contributors.get(run.userId);
      if (row?.agent) row.spendUsd = (row.spendUsd ?? 0) + run.amount;
      if (run.endedAt) {
        const entry = week(burnDay(run.endedAt));
        entry.spendUsd = (entry.spendUsd ?? 0) + run.amount;
      }
    }
  }

  const issuesStart = Math.max(historyStart, attributionStart);
  // Start at the first full week when a gap falls in the middle of a week. Show a
  // partial current week if it is the only available one.
  const weeklyStart = issuesStart > projectStart && weekOf(issuesStart) !== issuesStart
    ? Math.min(weekOf(today), weekOf(issuesStart) + WEEK)
    : weekOf(issuesStart);
  const thisWeek = weekOf(today);
  const prStart = weekOf(firstMergeDay ?? today);
  for (let day = Math.min(weeklyStart, prStart); day <= thisWeek; day += WEEK) week(day);

  return {
    today, historyStart, historyLimited: historyStart > projectStart, recentStart,
    points, forecast, remaining,
    milestones: milestones.map(({ label, dueDate }) => ({ label, day: burnDay(dueDate) })),
    weeklyStart, weeklyLimited: issuesStart > projectStart, prStart,
    weeks: [...weeks.values()].filter(entry => entry.day <= thisWeek).sort((a, b) => a.day - b.day),
    prCounts, undatedPrs, closures,
    recentClosures: work.reduce((totals, issue) => {
      if (issue.done && issue.finishedAt && issue.finishedAt <= now && burnDay(issue.finishedAt) >= recentStart) {
        totals[group(issue.closer)]++;
      }
      return totals;
    }, count()),
    runCount: runs.length, runHours,
    peopleCount: people.length, peopleLogged: people.filter(row => row.hoursLogged > 0).length,
    humanHours: people.reduce((total, row) => total + row.hoursLogged, 0),
    contributors: [...contributors.values()].sort((a, b) => Number(b.agent) - Number(a.agent)
      || b.issuesClosed - a.issuesClosed || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    ...(spend ? { spendUsd: spendTotal, spendPerIssueUsd: spendTotal === null || !closures.agents ? null : spendTotal / closures.agents } : {}),
  };
}

export type ProjectBurn = ReturnType<typeof calculateProjectBurn>;
