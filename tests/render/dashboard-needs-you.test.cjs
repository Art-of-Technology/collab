const { assert, test, load } = require('../security/helpers.cjs');
const React = require('react');
const jsx = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');
const { createRequire } = require('node:module');
const { JSDOM } = createRequire(require.resolve('isomorphic-dompurify'))('jsdom');

const components = 'src/app/(main)/[workspaceId]/dashboard/components/';
const dependencies = {
  react: React, 'react/jsx-runtime': jsx,
  '@/lib/utils': load('src/lib/utils.ts', { clsx: require('clsx'), 'tailwind-merge': require('tailwind-merge') }),
};
const relativeTime = load(components + 'RelativeTime.tsx', dependencies);
let refresh, request;
const panel = load(components + 'NeedsYouPanel.tsx', {
  ...dependencies,
  'next/navigation': { useRouter: () => ({ refresh: () => refresh() }) },
}, { fetch: (...args) => request(...args) });
const overview = load(components + 'WorkspaceOverview.tsx', {
  ...dependencies, './RelativeTime': relativeTime, './NeedsYouPanel': panel,
  '@/components/ui/page-layout': load('src/components/ui/page-layout.tsx', dependencies),
  '@/components/ui/page-header': load('src/components/ui/page-header.tsx', dependencies),
  ...Object.fromEntries(['DashboardRefresh', 'ProjectsPanel', 'AgentsNowPanel', 'ShippedPanel', 'DueSoonPanel']
    .map(name => ['./' + name, { default: () => null }])),
}, { URL, URLSearchParams }).default;

test('each chip is a link that keeps the scope and shows its exact count', () => {
  const now = '2026-11-21T12:00:00Z';
  const since = '2026-11-21T10:00:00.000Z';
  const item = {
    id: 'review:r1', kind: 'review', issue: { id: 'r1', issueKey: 'REL-1', title: 'Check release',
      project: { id: 'project', slug: 'release', name: 'Release', color: null } },
    seat: { id: 'seat', name: 'Developer' }, since, pullRequestUrl: 'https://forge.example.test/team/repo/pulls/7',
  };
  const document = JSDOM.fragment(renderToStaticMarkup(React.createElement(overview, {
    workspaceSlug: 'work', scope: 'mine', kind: 'review', q: 'release plans', dormant: true, page: 2, now, updatedAt: now,
    issues: { kind: 'denied' }, repositories: { kind: 'denied' }, agentsNow: null, shipped: null,
    needsYou: { kind: 'ready', counts: { question: 53, review: 24, failed: 0, due: 2 },
      items: Array.from({ length: 20 }, (_, index) => ({ ...item, id: `review:r${index}`, pullRequestUrl: index ? null : item.pullRequestUrl })), oldestQuestion: null },
  })));
  const section = document.querySelector('#needs-you');
  assert.match(section.querySelector('h2').textContent, /Needs you\s+79/);
  const chips = [...section.querySelectorAll('nav a')];
  assert.deepEqual(chips.map(link => link.textContent.trim()), ['All 79', 'Questions 53', 'Reviews 24', 'Failed runs 0', 'Due 2']);
  const urls = chips.map(link => new URL(link.getAttribute('href'), 'https://collab.example.test'));
  assert.deepEqual(urls.map(url => url.searchParams.get('kind')), [null, 'question', 'review', 'failed', 'due']);
  for (const { searchParams } of urls) {
    assert.equal(searchParams.get('scope'), 'mine');
    assert.equal(searchParams.get('q'), 'release plans');
    assert.equal(searchParams.get('dormant'), '1');
    assert.equal(searchParams.get('page'), '2');
  }
  assert.equal(chips[2].getAttribute('aria-current'), 'page');
  const [first, second] = section.querySelectorAll('li');
  assert.match(first.textContent, /Review.*Check release.*REL-1.*Release.*Developer.*2 h ago/);
  assert.equal(first.querySelector('time').getAttribute('datetime'), since);
  assert.equal(first.querySelector('time').getAttribute('title'), since);
  assert.equal(first.querySelector('a').getAttribute('href'), item.pullRequestUrl);
  assert.equal(second.querySelector('a').getAttribute('href'), '/work/issues/REL-1');
  assert.match(section.textContent, /Showing 20 of 24/);
});

test('a due row uses the UTC day and keeps its exact timestamp', () => {
  const now = '2026-11-21T23:50:00.000Z';
  const since = '2026-11-22T00:05:00.000Z';
  const document = JSDOM.fragment(renderToStaticMarkup(React.createElement(panel.default, {
    workspaceSlug: 'work', now, kind: 'due', kindHrefs: { all: '?', due: '?kind=due' },
    data: {
      kind: 'ready', counts: { question: 0, review: 0, failed: 0, due: 1 },
      items: [{ id: 'due:d1', kind: 'due', since, seat: null, issue: {
        id: 'd1', issueKey: 'REL-1', title: 'Cut release', project: { name: 'Release' },
      } }],
    },
  })));
  const time = document.querySelector('time');
  assert.equal(time.textContent, 'due tomorrow');
  assert.equal(time.getAttribute('datetime'), since);
  assert.equal(time.getAttribute('title'), since);
});

const now = '2026-11-21T12:00:00.000Z';
const makeItem = (kind, id, extra = {}) => ({
  id: `${kind}:${id}`, kind, canAct: true, since: now,
  issue: { id, issueKey: id.toUpperCase(), title: id, project: { id: 'project', name: 'Release' } },
  seat: { id: 'seat', name: 'Developer' }, text: 'Check the result and tell me whether to continue.',
  answerRecipientId: kind === 'question' ? 'seat-user' : undefined,
  runId: kind === 'failed' ? 'old-run' : null,
  ...extra,
});

async function interact(items, exercise, respond = async () => Response.json({ authorId: 'viewer' }, { status: 201 })) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.example.test/work/dashboard' });
  const previous = { window: global.window, document: global.document, IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.getElementById('root');
  const root = require('react-dom/client').createRoot(container);
  const calls = [];
  let refreshes = 0;
  let refreshedItems = items;
  const render = rows => {
    const counts = { question: 0, review: 0, failed: 0, due: 0 };
    for (const row of rows) counts[row.kind]++;
    root.render(React.createElement(panel.default, {
      workspaceSlug: 'work', now, kindHrefs: { all: '/work/dashboard' }, data: { kind: 'ready', counts, items: rows },
    }));
  };
  refresh = () => { refreshes++; render(refreshedItems); };
  request = (...args) => { calls.push(args); return respond(...args); };
  const row = index => container.querySelectorAll('li')[index];
  const click = async (label, index = 0, repeat = 1) => {
    const button = [...row(index).querySelectorAll('button')].find(element => element.textContent === label);
    assert.ok(button, `Expected the row button "${label}"`);
    await React.act(async () => {
      for (let press = 0; press < repeat; press++) button.click();
    });
  };
  const type = async (value, index = 0) => {
    const input = row(index).querySelector('input');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    await React.act(async () => input.dispatchEvent(new window.Event('input', { bubbles: true })));
  };
  try {
    await React.act(async () => render(items));
    await exercise({ container, row, click, type, calls, refreshes: () => refreshes, refreshWith: rows => { refreshedItems = rows; } });
  } finally {
    await React.act(async () => root.unmount());
    Object.assign(global, previous);
    dom.window.close();
  }
}

test('sending an answer posts one comment and reloads the rows', async () => {
  for (const assigneeId of ['seat-user', 'different-assignee']) {
    await interact([makeItem('question', 'q1')], async ({ container, row, click, type, calls, refreshes, refreshWith }) => {
      await click('Answer');
      assert.match(row(0).textContent, /Check the result and tell me whether to continue/);
      await type('  Please continue.  ');
      refreshWith([]);
      await click('Send answer', 0, 2);
      const posts = calls.filter(([, options]) => options?.method === 'POST');
      assert.equal(posts.length, 1);
      assert.equal(posts[0][0], '/api/issues/q1/comments');
      assert.deepEqual(JSON.parse(posts[0][1].body), { content: 'Please continue.' });
      assert.equal(refreshes(), 1);
      assert.equal(row(0), undefined);
      assert.match(container.querySelector('nav').textContent, /Questions 0/);
      assert.match(container.querySelector('[role="status"]').textContent, /Answer sent/);
      assert.equal(container.querySelector('[role="status"]').textContent.includes('Developer'), assigneeId === 'seat-user');
    }, async (url, options) => {
      if (options?.method === 'POST') return Response.json({ authorId: 'viewer' }, { status: 201 });
      assert.equal(url, '/api/issues/q1');
      return Response.json({ issue: { id: 'q1', projectId: 'project', workspace: { slug: 'work' }, assigneeId } });
    });
  }
});

test('an empty answer is refused in the row', async () => {
  await interact([makeItem('question', 'q1')], async ({ row, click, type, calls, refreshes }) => {
    await click('Answer');
    await click('Send answer');
    assert.equal(row(0).querySelector('[role="alert"]').textContent, 'Type an answer first.');
    await type('   ');
    await click('Send answer');
    assert.equal(row(0).querySelector('[role="alert"]').textContent, 'Type an answer first.');
    assert.deepEqual(calls, []);
    assert.equal(refreshes(), 0);
  });
});

test('an answer draft survives opening another row and a refused comment', async () => {
  await interact([makeItem('question', 'q1'), makeItem('question', 'q2')], async ({ row, click, type, refreshes }) => {
    await click('Answer');
    await type('Draft answer');
    await click('Answer', 1);
    assert.equal(row(0).querySelector('input'), null);
    assert.equal(row(1).querySelector('input').value, '');
    await click('Answer');
    assert.equal(row(0).querySelector('input').value, 'Draft answer');
    await click('Send answer');
    assert.equal(row(0).querySelector('input').value, 'Draft answer');
    assert.equal(row(0).querySelector('[role="alert"]').textContent, 'Issue not found');
    assert.equal(refreshes(), 0);
  }, async () => Response.json({ error: 'Issue not found' }, { status: 404 }));
});

test('the clear request is sent only after the person confirms the session has stopped', async () => {
  let refusal = true;
  await interact([makeItem('failed', 'f1')], async ({ container, row, click, calls, refreshes, refreshWith }) => {
    const clear = 'Session has stopped: clear run';
    await click(clear);
    assert.match(row(0).textContent, /checked that the old session has stopped/i);
    assert.deepEqual(calls, []);
    await click('Cancel');
    assert.doesNotMatch(row(0).textContent, /checked that the old session has stopped/i);
    assert.deepEqual(calls, []);
    await click(clear);
    await click('Confirm clear run');
    assert.equal(row(0).querySelector('[role="alert"]').textContent, 'The run is no longer lost.');
    assert.equal(refreshes(), 0);
    assert.equal(calls.length, 1);

    refusal = false;
    refreshWith([]);
    await click('Confirm clear run');
    assert.equal(calls.length, 2);
    for (const [url, { method }] of calls) {
      assert.equal(url, '/api/issues/f1/runs/old-run/clear');
      assert.equal(method, 'POST');
    }
    assert.equal(refreshes(), 1);
    assert.equal(row(0), undefined);
    assert.match(container.querySelector('nav').textContent, /Failed runs 0/);
  }, async () => refusal
    ? Response.json({ error: 'not_lost', error_description: 'The run is no longer lost.' }, { status: 409 })
    : Response.json({ run: { id: 'old-run', state: 'stopped' } }));
});

test('actions fall back to links for rows the viewer cannot act on', async () => {
  await interact([
    makeItem('question', 'q1', { canAct: false }), makeItem('failed', 'f1', { canAct: false }),
    makeItem('review', 'r1', { canAct: false, pullRequestUrl: 'https://forge.example.test/team/repo/pulls/1' }),
    makeItem('due', 'd1', { canAct: false }),
  ], async ({ container }) => {
    assert.equal(container.querySelector('li button'), null);
    assert.deepEqual([...container.querySelectorAll('li a')].map(link => link.textContent),
      ['Open issue', 'Open issue', 'Open pull request', 'Open issue']);
  });
});
