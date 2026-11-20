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
