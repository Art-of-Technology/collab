const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { load } = require('./helpers.cjs');

const FILE = 'src/app/api/apps/auth/live/route.ts';
const REVISION = 'b'.repeat(40), AHEAD = 'a'.repeat(40), BEHIND = 'c'.repeat(40), UNKNOWN = 'd'.repeat(40);

function route(revision) {
  const asked = [], clock = { now: 1_000_000 }, statuses = { [AHEAD]: 'ahead', [BEHIND]: 'behind' };
  let options;
  const { GET } = load(FILE, { 'next/server': { NextResponse: Response },
    '@/lib/apps/auth-middleware': { withAppAuth: (handler, given) => { options = given; return handler; } } }, {
    URL, AbortSignal, process: { env: { COLLAB_REVISION: revision } }, Date: { now: () => clock.now },
    fetch: async url => {
      asked.push(url);
      const commit = /compare\/([0-9a-f]+)\.\.\./.exec(url)[1];
      if (commit === 'e'.repeat(40)) throw new Error('offline');
      return statuses[commit] ? Response.json({ status: statuses[commit] }) : Response.json({ message: 'Not Found' }, { status: 404 });
    } });
  const get = async commit => {
    const response = await GET(new Request(`https://collab.example/api/apps/auth/live${commit === undefined ? '' : `?commit=${commit}`}`));
    return { status: response.status, body: await response.json() };
  };
  return { get, asked, clock, options: () => options };
}

test('live: any valid token reads the running revision and whether a commit is in it', async () => {
  const live = route(REVISION);
  // The access rule: a valid token and no scope, as for the documentation.
  assert.deepEqual(live.options(), { requiredScopes: [] });
  assert.deepEqual(await live.get(), { status: 200, body: { revision: REVISION } });

  // The running commit itself, in full or shortened, needs no question to GitHub.
  assert.deepEqual((await live.get(REVISION.slice(0, 8))).body, { revision: REVISION, commit: REVISION.slice(0, 8), contains: true });
  assert.equal(live.asked.length, 0);

  // GitHub compares the two. A yes or a no is asked once: history does not change.
  for (let n = 0; n < 2; n++) {
    assert.equal((await live.get(AHEAD)).body.contains, true);
    assert.equal((await live.get(BEHIND)).body.contains, false);
  }
  assert.deepEqual(live.asked, [AHEAD, BEHIND].map(commit => `https://api.github.com/repos/Art-of-Technology/collab/compare/${commit}...${REVISION}?per_page=1&page=2`));

  // A commit GitHub does not know, or no answer: null, and asked again only after a minute.
  assert.equal((await live.get(UNKNOWN)).body.contains, null);
  assert.equal((await live.get(UNKNOWN)).body.contains, null);
  assert.equal((await live.get('e'.repeat(40))).body.contains, null);
  assert.equal(live.asked.length, 4);
  live.clock.now += 61_000;
  assert.equal((await live.get(UNKNOWN)).body.contains, null);
  assert.equal(live.asked.length, 5);

  // Only a commit ID reaches the address that is fetched.
  for (const commit of ['main', 'ABCDEF1', 'abc', '../../x', 'a'.repeat(41), '']) {
    assert.equal((await live.get(encodeURIComponent(commit))).status, 400, commit);
  }
  assert.equal(live.asked.length, 5);
});

test('live: a build that was not told its commit says so and asks nothing', async () => {
  for (const revision of [undefined, 'main', 'B'.repeat(40)]) {
    const live = route(revision);
    assert.deepEqual((await live.get()).body, { revision: null });
    assert.deepEqual((await live.get(AHEAD)).body, { revision: null, commit: AHEAD, contains: null });
    assert.equal(live.asked.length, 0);
  }
});

test('live: git archive, which a release is built from, writes the commit into the route', t => {
  const cwd = resolve(__dirname, '../..');
  let head;
  try { head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return t.skip('not a git checkout'); }
  const archived = execFileSync('sh', ['-c', `git archive HEAD -- ${FILE} | tar -xO`], { cwd, encoding: 'utf8' });
  assert.ok(archived.includes(`['${head}', process.env.COLLAB_REVISION]`), 'the placeholder became the commit');
});
