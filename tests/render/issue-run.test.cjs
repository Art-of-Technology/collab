const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const base = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'date-fns': { formatDistanceToNow: () => '5 minutes ago' },
  'next/navigation': { useParams: () => ({ workspaceId: 'acme' }) } };
const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
const helpers = load('src/components/issue/sections/activity/utils/activityHelpers.ts');
const { ActivityItem } = load('src/components/issue/sections/activity/components/ActivityItem.tsx', { ...base,
  '@/lib/comment-html': { commentHtml }, '@/components/ui/custom-avatar': { CustomAvatar: () => null }, '@/components/ui/badge': { Badge: ({ children }) => React.createElement('span', { 'data-chip': '' }, children) }, './ActivityIcon': { ActivityIcon: () => null },
  './ActivityChangeDetails': { ActivityChangeDetails: () => null }, '../utils/activityHelpers': helpers });
const { OpenRun } = load('src/components/issue/sections/activity/components/OpenRun.tsx', { ...base,
  '@/components/ui/button': { Button: ({ children, onClick }) => React.createElement('button', { onClick }, children) } }, { fetch: (...call) => global.fetch(...call) });

const note = '## Done\n\nThe fix is merged.\n\n## Decisions\n\nNone.\n\n## Evidence\n\nPR 1.\n\n## Next\n\nDeploy.';
const user = { id: 'u1', name: 'dev-a', image: null };
async function shown(element, then = async () => {}) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(element));
  try { return await then() ?? document.getElementById('root').textContent; } finally { await React.act(async () => root.unmount()); }
}
const entry = (action, details) => shown(React.createElement(ActivityItem, { activity: { id: 'a1', action, details, createdAt: '2026-11-15T10:00:00.000Z', user } }));

test('the timeline shows an exit note under the run that left it, as handoff notes are shown', async () => {
  const finished = await entry('AGENT_RUN_FINISHED', { runId: 'r1', outcome: 'in_review', content: note });
  assert.ok(finished.startsWith('dev-a finished a run on this issue: in review5 minutes ago'), finished);
  assert.ok(finished.includes(`Exit noteDone\nThe fix is merged.\nDecisions\nNone.\nEvidence\nPR 1.\nNext\nDeploy.\n`), finished);
  const late = await entry('AGENT_RUN_LATE', { runId: 'r1', outcome: 'done', content: note });
  assert.ok(late.startsWith('dev-a sent an exit note after the run on this issue had ended; nothing else changed'), late);
  assert.ok(late.includes(`Exit noteDone\nThe fix is merged.\nDecisions\nNone.\nEvidence\nPR 1.\nNext\nDeploy.\n`), late);
  // The checked facts of the note stand above it: the pull request with the commit it was left at, and the next step.
  const facts = await entry('AGENT_RUN_FINISHED', { runId: 'r1', outcome: 'in_review', content: note, pullRequest: 'acme/app#12', headCommit: 'a1'.repeat(20), nextStep: 'Merge when approved' });
  assert.ok(facts.includes(`Pull request: acme/app#12 at ${'a1'.repeat(20)}Next: Merge when approvedExit noteDone\nThe fix is merged.\nDecisions\nNone.\nEvidence\nPR 1.\nNext\nDeploy.\n`), facts);
  assert.ok(!finished.includes('Pull request') && !finished.includes('Next:'), finished);
  // A handoff's note keeps its own label.
  assert.ok((await entry('AGENT_PROGRESS', { agent: { name: 'navy' }, content: 'Half way' })).includes('Handoff detailsHalf way'));
});

test('beside each run: whose allowance it used and on which program, the name alone without a program, nothing without an owner', async () => {
  const chip = allowance => shown(React.createElement(ActivityItem, { activity: { id: 'a1', action: 'AGENT_RUN_FINISHED', details: { runId: 'r1', outcome: 'done' },
    allowance, createdAt: '2026-11-15T10:00:00.000Z', user } }), async () => [...document.querySelectorAll('[data-chip]')].map(found => found.textContent));
  assert.deepEqual(await chip({ owner: 'Bob', program: 'Claude Code' }), ['Bob\'s allowance · Claude Code']);
  assert.deepEqual(await chip({ owner: 'Cem', program: null }), ['Cem\'s allowance']);
  assert.deepEqual(await chip(null), []);
  assert.deepEqual(await chip(undefined), []);
});

test('an assignment by a lead seat is on the timeline under the lead\'s name and names the seat', async () => {
  const by = (details) => shown(React.createElement(ActivityItem, { activity: { id: 'a1', action: 'LEAD_ASSIGNED', details, createdAt: '2026-11-15T10:00:00.000Z', user: { ...user, name: 'lead-a' } } }));
  assert.equal(await by({ seatId: 's1', toSeatId: 's2', to: 'dev-a' }), 'lead-a assigned this issue to dev-a5 minutes ago');
  assert.equal(await by(null), 'lead-a assigned this issue to a seat5 minutes ago');
});

test('a security review is on the timeline and above it: who asked, the verdict, what was reviewed, and a link to the request', async () => {
  const links = () => [...document.querySelectorAll('a')].map(link => [link.textContent, link.getAttribute('href')]);
  const item = (action, details, by = 'sec-a') => shown(React.createElement(ActivityItem, { activity: { id: 'a1', action, details, createdAt: '2026-11-15T10:00:00.000Z', user: { ...user, name: by } } }),
    async () => [document.getElementById('root').textContent, links()]);
  assert.deepEqual(await item('SECURITY_REQUESTED', { requestId: 'r1', requestKey: 'SEC-7' }, 'dev-a'), ['dev-a asked for a security reviewSEC-75 minutes ago', [['SEC-7', '/acme/issues/SEC-7']]]);
  // On the request itself the entry names the issue it was filed for.
  assert.deepEqual(await item('SECURITY_REQUESTED', { forIssueId: 'i1', forIssueKey: 'APP-1' }, 'dev-a'), ['dev-a asked for a security reviewAPP-15 minutes ago', [['APP-1', '/acme/issues/APP-1']]]);
  assert.deepEqual(await item('SECURITY_VERDICT', { verdict: 'failed', reviewed: 'PR 12 at abc1234', requestKey: 'SEC-7' }),
    ['sec-a reviewed PR 12 at abc1234 for security: failedSEC-75 minutes ago', [['SEC-7', '/acme/issues/SEC-7']]]);
  assert.ok((await item('SECURITY_VERDICT', { verdict: 'passed', reviewed: 'PR 12 at def5678', requestKey: 'SEC-9' }))[0].startsWith('sec-a reviewed PR 12 at def5678 for security: passed'));
  // The verdict on the request's own timeline links to the issue it was filed for, not to itself.
  assert.deepEqual((await item('SECURITY_VERDICT', { verdict: 'passed', reviewed: 'PR 12', requestKey: 'SEC-9', forIssueKey: 'APP-1' }))[1], [['APP-1', '/acme/issues/APP-1']]);
  // An ordinary entry carries no such link.
  assert.deepEqual((await item('AGENT_RUN_FINISHED', { outcome: 'done', requestKey: 'SEC-7' }))[1], []);

  const security = [{ requestKey: 'SEC-7', state: 'failed', reviewed: 'PR 12 at abc1234', by: 'sec-a' }, { requestKey: 'SEC-9', state: 'passed', reviewed: 'PR 12 at def5678', by: 'sec-b' },
    { requestKey: 'SEC-11', state: 'closed' }, { requestKey: 'SEC-12', state: 'open' }];
  let run = null;
  global.fetch = async () => ({ ok: true, json: async () => ({ run, security }) });
  const open = () => shown(React.createElement(OpenRun, { issueId: 'i1' }), async () => [document.getElementById('root').textContent, links()]);
  const line = 'Security reviewSEC-7 failed: PR 12 at abc1234, by sec-aSEC-9 passed: PR 12 at def5678, by sec-bSEC-11 closed without a verdictSEC-12 open';
  assert.deepEqual(await open(), [line, [['SEC-7', '/acme/issues/SEC-7'], ['SEC-9', '/acme/issues/SEC-9'], ['SEC-11', '/acme/issues/SEC-11'], ['SEC-12', '/acme/issues/SEC-12']]]);
  // With a run open both lines show.
  run = { id: 'r1', state: 'running', startedAt: '2026-11-15T10:00:00.000Z', by: 'dev-a', clearable: false };
  assert.equal((await open())[0], `${line}dev-a started working on this issue 5 minutes ago.`);
});

test('above the timeline: who is working the issue and since when, and a clear button only where a run can be cleared', async () => {
  const calls = [];
  let run = { id: 'r1', state: 'running', startedAt: '2026-11-15T10:00:00.000Z', by: 'dev-a', clearable: false };
  global.fetch = async (url, options) => {
    calls.push(`${options?.method ?? 'GET'} ${url}`);
    if (options?.method === 'POST') run = null;
    return { ok: true, json: async () => ({ run }) };
  };
  const open = then => shown(React.createElement(OpenRun, { issueId: 'i1' }), then);
  assert.equal(await open(), 'dev-a started working on this issue 5 minutes ago.');
  assert.deepEqual(calls, ['GET /api/issues/i1/runs']);

  run = { ...run, state: 'lost', clearable: true };
  assert.equal(await open(), 'dev-a started working on this issue 5 minutes ago and stopped answering. The issue is not offered again until this run is cleared.Session has stopped: clear run');
  // Clearing asks the server and reads the run again: none is open any more, so the line goes.
  calls.length = 0;
  assert.equal(await open(async () => {
    await React.act(async () => document.querySelector('button').click());
    return document.getElementById('root').textContent;
  }), '');
  assert.deepEqual(calls, ['GET /api/issues/i1/runs', 'POST /api/issues/i1/runs/r1/clear', 'GET /api/issues/i1/runs']);

  // A clear the server refuses says so and leaves the run in view.
  run = { id: 'r2', state: 'running', startedAt: '2026-11-15T10:00:00.000Z', by: 'Cem', clearable: true };
  global.fetch = async (url, options) => ({ ok: options?.method !== 'POST', json: async () => ({ run }) });
  assert.equal(await open(async () => {
    await React.act(async () => document.querySelector('button').click());
    return document.getElementById('root').textContent;
  }), 'Cem started working on this issue 5 minutes ago.Session has stopped: clear runThe run was not cleared. Reload the page and try again.');

  let readCount = 0;
  global.fetch = async (url, options) => {
    if (options?.method === 'POST') return { ok: false };
    return { ok: true, json: async () => ({ run: readCount++ === 0 ? run : null }) };
  };
  assert.equal(await open(async () => {
    await React.act(async () => document.querySelector('button').click());
    return document.getElementById('root').textContent;
  }), 'Cem started working on this issue 5 minutes ago.Session has stopped: clear runThe run was not cleared. Reload the page and try again.');

  for (const failure of ['http', 'network', 'json']) {
    let reads = 0;
    global.fetch = async (url, options) => {
      if (options?.method === 'POST') return { ok: false };
      if (reads++ === 0) return { ok: true, json: async () => ({ run }) };
      if (failure === 'network') throw new Error('offline');
      return { ok: failure !== 'http', json: async () => { throw new Error('invalid response'); } };
    };
    assert.equal(await open(async () => {
      await React.act(async () => document.querySelector('button').click());
      return document.getElementById('root').textContent;
    }), 'Cem started working on this issue 5 minutes ago.Session has stopped: clear runThe run was not cleared. Reload the page and try again.');
  }

  // A clear that worked takes the run out of view, also when the read after it fails.
  let cleared = false;
  global.fetch = async (url, options) => {
    if (options?.method === 'POST') { cleared = true; return { ok: true }; }
    if (cleared) throw new Error('offline');
    return { ok: true, json: async () => ({ run }) };
  };
  assert.equal(await open(async () => {
    await React.act(async () => document.querySelector('button').click());
    return document.getElementById('root').textContent;
  }), '');

  // No run open, or the read fails: nothing is shown.
  run = null;
  assert.equal(await open(), '');
  global.fetch = async () => { throw new Error('offline'); };
  assert.equal(await open(), '');
});

test('the owner sees numbered plain-text lines and submits an answer bound to the displayed question', async () => {
  const question = { id: 'q1', text: '  **Deploy** <b>now</b>\nhttps://example.test/' };
  let run = { id: 'r1', state: 'waiting', startedAt: '2026-11-15T10:00:00.000Z', by: 'release-a', clearable: false, question };
  const calls = [];
  global.fetch = async (url, options) => {
    if (options?.method === 'POST') {
      calls.push([url, JSON.parse(options.body)]);
      const { question: _, ...rest } = run;
      run = { ...rest, state: 'running' };
    }
    return { ok: true, json: async () => ({ run }) };
  };
  await shown(React.createElement(OpenRun, { issueId: 'i1' }), async () => {
    const lines = [...document.querySelectorAll('ol li')];
    assert.deepEqual(lines.map(line => line.textContent), question.text.split('\n'));
    assert.equal(document.querySelector('ol a, ol b, ol strong'), null);
    const buttons = [...document.querySelectorAll('button')];
    assert.deepEqual(buttons.map(button => button.textContent), ['Approve', 'Refuse']);
    await React.act(async () => buttons[1].click());
    assert.equal(document.querySelector('ol'), null);
  });
  assert.deepEqual(calls, [['/api/issues/i1/runs/r1/answer', { questionId: 'q1', decision: 'refused' }]]);
  const answer = await entry('AGENT_RUN_ANSWERED', { runId: 'r1', questionId: 'q1', decision: 'refused', answerText: '**Declined**' });
  assert.match(answer, /dev-a refused.*5 minutes ago.*\*\*Declined\*\*/);
});
