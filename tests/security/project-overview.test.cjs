const { assert, test, load } = require('./helpers.cjs');

const { calculateProjectOverview } = load('src/lib/project-overview.ts', {
  '@/lib/issue-finder': {}, '@/lib/post-access': {}, '@/lib/prisma': {}, '@/lib/project-burn': load('src/lib/project-burn.ts'),
});
const date = day => new Date(`2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`);
const now = date(20);
const issue = (id, fields = {}) => ({
  id, issueKey: id, title: id, type: 'TASK', milestoneId: null, createdAt: date(1),
  firstStartedAt: null, finishedAt: null, dueDate: null, startDate: null,
  baselineStartDate: null, baselineDueDate: null, projectStatus: { isFinal: false }, ...fields,
});
const milestone = (id, fields) => issue(id, { type: 'MILESTONE', ...fields });
const closed = (id, fields) => issue(id, { projectStatus: { isFinal: true }, finishedAt: date(19), ...fields });

for (const [baseline, verdict, drift] of [
  [25, 'on_track', 2], [24, 'at_risk', 3], [20, 'at_risk', 7], [19, 'behind', 8], [null, null, null],
]) {
  test(`seven open issues at seven closures per week give ${verdict ?? 'no verdict'} with baseline ${baseline}`, () => {
    const issues = [
      milestone('M1', { dueDate: date(26), baselineDueDate: baseline ? date(baseline) : null }),
      ...Array.from({ length: 7 }, (_, i) => issue(`open-${i}`, { milestoneId: 'M1' })),
      ...Array.from({ length: 21 }, (_, i) => closed(`done-${i}`, { milestoneId: 'M1' })),
      milestone('finished', { projectStatus: { isFinal: true }, finishedAt: date(15), baselineDueDate: date(1) }),
    ];
    const result = calculateProjectOverview(issues, baseline ? date(1) : null, now);
    const current = result.milestones.find(item => item.id === 'M1');
    assert.equal(result.pacePerWeek, 7);
    assert.equal(result.verdict, verdict);
    assert.equal(current.forecastDate, date(27).toISOString());
    assert.equal(current.driftDays, drift);
    assert.equal(current.progress, 75);
    assert.equal(result.nextMilestoneId, 'M1');
    assert.equal(result.milestones.find(item => item.id === 'finished').driftDays, 14);
  });
}

test('completed milestone uses actual work dates and the next milestone inherits the previous end', () => {
  const result = calculateProjectOverview([
    milestone('M1', { startDate: date(1), dueDate: date(9), projectStatus: { isFinal: true }, finishedAt: date(12) }),
    closed('task', { milestoneId: 'M1', firstStartedAt: date(3), finishedAt: date(14) }),
    milestone('M2', { dueDate: date(25), baselineDueDate: date(25) }),
    issue('late', { dueDate: date(19), milestoneId: 'M2', createdAt: date(3) }),
    issue('unplanned', { dueDate: date(20), createdAt: date(5) }),
    closed('legacy-without-finish', { finishedAt: null }),
  ], date(2), now);
  assert.equal(result.milestones[0].startDate, date(3).toISOString());
  assert.equal(result.milestones[0].endDate, date(14).toISOString());
  assert.equal(result.milestones[1].startDate, date(14).toISOString());
  assert.equal(result.pacePerWeek, 1 / 3);
  assert.equal(result.stats.overdue, 1);
  assert.equal(result.stats.addedSinceBaseline, 2);
  assert.equal(result.unplanned[0].id, 'unplanned');
});

test('an open milestone with outstanding work and no recent closures has no forecast', () => {
  const result = calculateProjectOverview([
    milestone('M1', { baselineDueDate: date(25) }),
    issue('unfinished', { milestoneId: 'M1' }),
  ], date(1), now);
  assert.equal(result.hasBaseline, true);
  assert.equal(result.verdict, null);
  assert.equal(result.milestones[0].forecastDate, null);
});

test('Burn forecasts the current scope using the mean and extremes of three weeks', () => {
  const { calculateProjectBurn, burnDay } = load('src/lib/project-burn.ts');
  const workspaceId = 'workspace';
  const actor = { id: 'person', name: 'Person', agentSeat: null };
  const work = [
    ...Array.from({ length: 12 }, () => ({ ...issue('open'), done: false })),
    ...[2, 4, 6].flatMap((count, week) => Array.from({ length: count }, () => ({
      ...closed('finished', { finishedAt: date(19 - week * 7) }), done: true, closer: actor,
    }))),
  ];
  const input = {
    workspaceId, createdAt: date(1), now, work, milestones: [{ label: 'M1', dueDate: date(27) }],
    accounts: [], merges: [], runs: [], logs: [], spend: undefined,
  };
  const burn = calculateProjectBurn(input);
  assert.equal(burn.forecast.day, burnDay(date(20)) + 21);
  assert.equal(burn.forecast.earliest, burnDay(date(20)) + 14);
  assert.equal(burn.forecast.latest, burnDay(date(20)) + 42);
  assert.equal(burn.forecast.remaining, 12);
  assert.equal(burn.points.at(-1).closed, 12);
  assert.equal(burn.points.at(-1).scope, 24);
  assert.equal(burn.milestones[0].day, burnDay(date(27)));
  const incomplete = calculateProjectBurn({
    ...input, work: [...work, { ...closed('legacy'), finishedAt: null, updatedAt: date(10), done: true }],
  });
  assert.equal(incomplete.historyStart, burnDay(date(11)));
  assert.equal(incomplete.points[0].day, burnDay(date(11)));
  assert.equal(incomplete.points.at(-1).closed, 13);
  assert.equal(incomplete.forecast, null);
});

test('Burn keeps a reopened closure in its week, the pace and the done line until the reopen', () => {
  const { calculateProjectBurn, burnDay } = load('src/lib/project-burn.ts');
  const plain = value => JSON.parse(JSON.stringify(value));
  const person = { id: 'person', name: 'Person', agentSeat: null };
  const seat = { id: 'seat', name: 'Seat', agentSeat: { name: 'Seat', workspaceId: 'workspace' } };
  const open = id => ({ ...issue(id), updatedAt: date(1), done: false });
  const reopened = {
    ...open('reopened'), updatedAt: date(17),
    history: [{ at: date(10), closed: true, actor: seat }, { at: date(17), closed: false, actor: person }],
  };
  const input = {
    workspaceId: 'workspace', createdAt: date(1), now, work: [reopened, open('a'), open('b')],
    milestones: [], accounts: [], merges: [], runs: [], logs: [], spend: undefined,
  };
  const burn = calculateProjectBurn(input);
  const closedOn = day => burn.points.filter(point => point.day <= burnDay(date(day))).at(-1).closed;
  assert.equal(burn.historyLimited, false);
  assert.deepEqual([closedOn(9), closedOn(10), closedOn(16), closedOn(17), closedOn(20)], [0, 1, 1, 0, 0]);
  const week = burn.weeks.find(entry => entry.day <= burnDay(date(10)) && burnDay(date(10)) < entry.day + 7);
  assert.deepEqual(plain(week.issues), { agents: 1, people: 0, unmatched: 0 });
  assert.deepEqual(plain(burn.recentClosures), { agents: 1, people: 0, unmatched: 0 });
  // One closure ten days ago gives weekly paces of 0, 1 and 0 for the three reopened issues.
  assert.deepEqual(plain(burn.forecast), {
    day: burnDay(now) + 63, earliest: burnDay(now) + 21, latest: null, remaining: 3,
  });

  const closedAgain = calculateProjectBurn({ ...input, work: [{
    ...reopened, done: true, finishedAt: date(19), closer: person,
  }] });
  assert.deepEqual(plain(closedAgain.weeks.flatMap(entry => entry.issues.agents + entry.issues.people ? [entry.issues] : [])),
    [{ agents: 1, people: 0, unmatched: 0 }, { agents: 0, people: 1, unmatched: 0 }]);
  assert.equal(closedAgain.points.at(-1).closed, 1);

  // A reopen without its closure, or a closure without its reopen, limits the history.
  const missingClose = calculateProjectBurn({ ...input, work: [{ ...open('x'), history: [{ at: date(8), closed: false }] }] });
  assert.equal(missingClose.historyStart, burnDay(date(9)));
  assert.equal(missingClose.points.at(-1).closed, 0);
  const missingReopen = calculateProjectBurn({ ...input, work: [{ ...open('y'), updatedAt: date(12), history: [{ at: date(6), closed: true }] }] });
  assert.equal(missingReopen.historyStart, burnDay(date(13)));
  assert.equal(missingReopen.points.at(-1).closed, 0);
});
