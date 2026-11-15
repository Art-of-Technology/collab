const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const base = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'date-fns': { formatDistanceToNow: () => '5 minutes ago' } };
const helpers = load('src/components/issue/sections/activity/utils/activityHelpers.ts');
const { ActivityItem } = load('src/components/issue/sections/activity/components/ActivityItem.tsx', { ...base,
  '@/components/ui/custom-avatar': { CustomAvatar: () => null }, './ActivityIcon': { ActivityIcon: () => null },
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
  assert.ok(finished.includes(`Exit note${note}`), finished);
  const late = await entry('AGENT_RUN_LATE', { runId: 'r1', outcome: 'done', content: note });
  assert.ok(late.startsWith('dev-a sent an exit note after the run on this issue had ended; nothing else changed'), late);
  assert.ok(late.includes(`Exit note${note}`), late);
  // A handoff's note keeps its own label.
  assert.ok((await entry('AGENT_PROGRESS', { agent: { name: 'navy' }, content: 'Half way' })).includes('Handoff detailsHalf way'));
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
