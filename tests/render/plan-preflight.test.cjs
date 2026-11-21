const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const script = resolve(__dirname, '../../scripts/plan-preflight.mjs');
const note = 'search Collab for an unstarted issue on the same screen or file before filing (collab issues list --project-id ID --search WORDS)';

function goodPlan() {
  return {
    contexts: { api: ['api/src/rules.ts'], page: ['app/page/**'], ops: [] },
    issues: [
      {
        id: 'T1', type: 'TASK', kind: 'schema', title: 'Schema', context: 'api', wave: 0,
        points: 2, needs: [], tests: ['a'], migration: true, security: true,
        person: { who: 'Cem', word: '1 applied', minutes: 10 },
      },
      {
        id: 'S1', type: 'STORY', title: 'Rules', context: 'api', wave: 1,
        points: 5, needs: ['T1'], tests: ['b'],
      },
      {
        id: 'S2', type: 'STORY', title: 'Page', context: 'page', wave: 1,
        points: 3, needs: ['T1'], tests: ['c'],
      },
      {
        id: 'R1', type: 'TASK', kind: 'release', title: 'Release', context: 'ops', wave: 2,
        points: 1, needs: ['S1', 'S2'], person: { who: 'Cem', word: 'deployed', minutes: 15 },
      },
    ],
    blocks: [['T1', 'S1'], ['T1', 'S2'], ['S1', 'R1'], ['S2', 'R1']],
    startsNow: ['T1'],
  };
}

function withOutside(plan) {
  plan.issues[1].needs.push('X-9');
  plan.blocks.push(['X-9', 'S1']);
}

test('passes the good plan', async () => {
  const { check } = await import('../../scripts/plan-preflight.mjs');
  const plan = goodPlan();
  const expected = { fails: [], warns: [], notes: [note] };
  assert.deepEqual(check(plan), expected);

  delete plan.issues[0].person;
  assert.deepEqual(check(plan), expected);
});

test('each of the 15 broken plans fails with its own message', async t => {
  const cases = [
    ['S1: names no test', p => { p.issues[1].tests = []; }],
    ['S1: 8 points; split it (5 or less)', p => { p.issues[1].points = 8; }],
    ["S1 and S2: same wave and same context 'api'", p => { p.issues[2].context = 'api'; }],
    ['S1 and S2: same wave and both change api/src/rules.ts; split the file first or put them in different waves',
      p => { p.issues[2].paths = ['api/src/rules.ts']; }],
    ['S1 and S2: same wave and both change api/src/rules.ts; split the file first or put them in different waves',
      p => { p.contexts.page = ['api/**']; }],
    ['S1 needs T1, but no block is planned for it', p => p.blocks.shift()],
    ["a block S1 -> S2 is planned, but S2's card does not say it needs S1", p => p.blocks.push(['S1', 'S2'])],
    ['S1 (wave 0) needs T1 (wave 0): it must be in a later wave', p => { p.issues[1].wave = 0; }],
    ['T1: has a migration, so it needs a security review', p => { delete p.issues[0].security; }],
    ["R1: kind 'release' is person-only but has no person", p => { p.issues[3].person = null; }],
    ["'Starts now' says ['S1', 'T1']; the needs say ['T1']", p => p.startsNow.push('S1')],
    ['X-9 is a sub-task: block on its parent', withOutside, { type: 'SUBTASK', status: 'backlog' }],
    ['X-9 is already done: drop it from the needs', withOutside,
      { type: 'TASK', status: 'done', assignee: { name: 'a' } }],
    ["X-9 has no assignee: nobody may ever finish it. Ask the person: 'X-9 covered' or 'X-9 hand out'",
      withOutside, { type: 'TASK', status: 'backlog', assignee: null }, 'warns'],
    ['X-9: a blocker that Collab does not know', withOutside, null],
  ];

  for (const [index, [message, change, issue, channel = 'fails']] of cases.entries()) {
    await t.test(`${index + 1}. ${message}`, async () => {
      const { check } = await import('../../scripts/plan-preflight.mjs');
      const plan = goodPlan();
      change(plan);
      const lookup = issue === undefined ? undefined : key => {
        assert.equal(key, 'X-9');
        return issue;
      };
      const result = check(plan, lookup);
      assert.ok(result[channel].includes(message), JSON.stringify(result));
      if (channel === 'warns') assert.deepEqual(result.fails, []);
    });
  }
});

test('reports missing card fields, an unknown context and an incomplete person line', async () => {
  const { check } = await import('../../scripts/plan-preflight.mjs');
  const plan = goodPlan();
  Object.assign(plan.issues[2], { title: '', type: null, context: 'unknown', wave: null, points: null });
  delete plan.issues[3].person.minutes;
  assert.deepEqual(check(plan).fails, [
    'S2: the card has no title',
    'S2: the card has no type',
    'S2: the card has no wave',
    'S2: the card has no points',
    "S2: context 'unknown' is not in the plan's context table",
    'R1: the person line needs who, word and minutes',
  ]);
});

test('runs offline and exits 1 only when a check fails', t => {
  const directory = mkdtempSync(join(tmpdir(), 'plan-preflight-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const file = join(directory, 'test plan.json');
  const plan = goodPlan();
  withOutside(plan);
  writeFileSync(file, JSON.stringify(plan));

  const pass = spawnSync(process.execPath, [script, file, '--offline'], { encoding: 'utf8' });
  assert.equal(pass.status, 0, pass.stderr);
  const offlineNote = 'NOTE  not checked (offline): the blockers that already exist in Collab: X-9';
  assert.equal(pass.stdout, `${offlineNote}\nNOTE  ${note}\n4 issues, 0 failing, 0 to ask\n`);

  plan.issues[1].tests = [];
  writeFileSync(file, JSON.stringify(plan));
  const fail = spawnSync(process.execPath, [script, file, '--offline'], { encoding: 'utf8' });
  assert.equal(fail.status, 1, fail.stderr);
  assert.equal(fail.stdout, `FAIL  S1: names no test\n${offlineNote}\nNOTE  ${note}\n4 issues, 1 failing, 0 to ask\n`);
});

test('prints usage and exits non-zero without a plan argument', () => {
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Usage: node scripts\/plan-preflight\.mjs PLAN\.json \[--offline\]/);
});
