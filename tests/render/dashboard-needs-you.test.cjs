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
const panel = load(components + 'NeedsYouPanel.tsx', dependencies);
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
