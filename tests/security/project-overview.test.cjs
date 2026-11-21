const { assert, test, load } = require('./helpers.cjs');

const { calculateProjectOverview } = load('src/lib/project-overview.ts', {
  '@/lib/issue-finder': {}, '@/lib/post-access': {}, '@/lib/prisma': {},
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

test('Plan moves the scheduled bar and its drift while keeping the saved outline fixed until re-baseline', () => {
  const earlier = milestone('M1', { startDate: date(20), dueDate: date(22), baselineStartDate: date(20), baselineDueDate: date(22) });
  const changed = milestone('M2', { dueDate: date(25), baselineDueDate: date(25) });
  const linked = Array.from({ length: 6 }, (_, i) => issue(`open-${i}`, { milestoneId: changed.id }));
  const closures = Array.from({ length: 21 }, (_, i) => closed(`done-${i}`));
  const plan = (previous, current) => calculateProjectOverview(
    [previous, current, ...linked, ...closures], date(20), now,
  ).plan.milestones.find(row => row.id === changed.id);
  const before = plan(earlier, changed);
  const moved = plan({ ...earlier, dueDate: date(23) }, { ...changed, dueDate: date(27) });
  const rebaselined = plan(
    { ...earlier, dueDate: date(23), baselineDueDate: date(23) },
    { ...changed, dueDate: date(27), baselineDueDate: date(27) },
  );
  assert.equal(before.start, before.baselineStart);
  assert.equal(before.end, before.baselineDue);
  assert.equal(before.driftDays, 3);
  assert.equal(moved.start, before.start + 1);
  assert.equal(moved.end, before.end + 2);
  assert.equal(moved.baselineStart, before.baselineStart);
  assert.equal(moved.baselineDue, before.baselineDue);
  assert.equal(moved.driftDays, 4);
  assert.equal(rebaselined.baselineStart, moved.start);
  assert.equal(rebaselined.baselineDue, moved.end);
  assert.equal(rebaselined.driftDays, rebaselined.forecast - rebaselined.end);
  assert.equal(rebaselined.driftDays, 2);
});

test('Plan orders due-only milestones, chains their starts, and includes decision points and undated work', () => {
  const result = calculateProjectOverview([
    milestone('M4', { dueDate: date(29) }), milestone('M1', { dueDate: date(21) }),
    milestone('M2', { dueDate: date(24) }), milestone('M3', { dueDate: date(27) }),
    milestone('M5'), milestone('M6', { startDate: date(30), baselineDueDate: date(29) }),
    issue('first', { milestoneId: 'M1' }), issue('second', { milestoneId: 'M2' }),
    issue('fourth', { milestoneId: 'M4' }), issue('undated', { milestoneId: 'M5' }),
  ], null, now);
  const [first, second, decision, fourth, startOnly, undated] = result.plan.milestones;
  assert.deepEqual([first.id, second.id, decision.id, fourth.id, startOnly.id, undated.id], ['M1', 'M2', 'M3', 'M4', 'M6', 'M5']);
  assert.equal(first.start, first.end);
  assert.equal(second.start, first.end);
  assert.equal(decision.state, 'decision');
  assert.equal(decision.start, decision.end);
  assert.equal(fourth.start, decision.end);
  assert.equal(startOnly.start, startOnly.end);
  assert.equal(startOnly.forecast, null);
  assert.equal(startOnly.driftDays, null);
  assert.equal(undated.start, null);
  assert.equal(undated.end, null);
});

test('Plan preserves reversed dates for repair without charting them or chaining a start from them', () => {
  const result = calculateProjectOverview([
    milestone('valid', { dueDate: date(22), baselineDueDate: date(22) }),
    milestone('reversed', { startDate: date(28), dueDate: date(24), baselineStartDate: date(28), baselineDueDate: date(24) }),
    milestone('next', { dueDate: date(27), baselineDueDate: date(27) }),
    issue('linked', { milestoneId: 'next' }),
  ], date(21), now);
  const [valid, reversed, next] = result.plan.milestones;
  assert.equal(reversed.invalidDates, true);
  assert.deepEqual([reversed.start, reversed.end, reversed.forecast, reversed.driftDays], [null, null, null, null]);
  assert.equal(reversed.startDate, date(28).toISOString());
  assert.equal(reversed.dueDate, date(24).toISOString());
  assert.equal(next.start, valid.end);
  assert.equal(next.baselineStart, valid.baselineDue);
});
