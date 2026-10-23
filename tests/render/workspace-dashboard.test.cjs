const { assert, test, load } = require('../security/helpers.cjs');
const React = require('react');
const jsx = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');
const { createRequire } = require('node:module');
const { JSDOM } = createRequire(require.resolve('isomorphic-dompurify'))('jsdom');

const uiDependencies = {
  react: React, 'react/jsx-runtime': jsx,
  '@/lib/utils': load('src/lib/utils.ts', { clsx: require('clsx'), 'tailwind-merge': require('tailwind-merge') }),
};
const Overview = load('src/app/(main)/[workspaceId]/dashboard/components/WorkspaceOverview.tsx', {
  'react/jsx-runtime': jsx,
  '@/components/ui/page-layout': load('src/components/ui/page-layout.tsx', uiDependencies),
  '@/components/ui/page-header': load('src/components/ui/page-header.tsx', uiDependencies),
}, { URL, URLSearchParams }).default;
const project = { id: 'private-database-id', slug: 'release & plans', name: 'Release <plans>', color: '#3b82f6' };
const issue = { id: 'issue-id', issueKey: 'CLB-7', title: 'Finish release review', project, status: 'In progress', dueDate: '2026-10-22T12:00:00Z', updatedAt: '2026-10-23T10:00:00Z' };
function issueData(changes = {}) {
  return {
    kind: 'ready', scope: 'all', generatedAt: '2026-10-23T12:00:00Z',
    summary: { visibleProjects: 52, projectsWithOpenWork: 18, openIssues: 146, overdueIssues: 7, dueSoonIssues: 12 },
    attention: [issue, { ...issue, id: 'next', issueKey: 'CLB-8', title: 'Confirm next release', dueDate: '2026-10-25T12:00:00Z' }],
    recent: [issue],
    projects: [{ ...project, openIssues: 31, overdueIssues: 3, dueSoonIssues: 2, lastIssueUpdatedAt: issue.updatedAt }],
    projectSearch: '', projectPage: 1, projectPages: 6, matchingProjects: 52,
    ...changes,
  };
}
function repoData(changes = {}) {
  return {
    kind: 'ready', connectionCount: 2, neverRefreshedCount: 0,
    items: [{ id: 'pr', project, provider: 'forgejo', repository: 'team/repo', kind: 'pull_request', title: 'Review invitation feedback', url: 'https://forge.example/team/repo/pulls/7', state: 'open', date: '2026-10-23T09:00:00Z', refreshedAt: '2026-10-23T11:00:00Z', refreshIsAttempt: false },
      { id: 'release', project, provider: 'github', repository: 'team/other', kind: 'release', title: 'Version 1.5.2', url: 'https://github.com/team/other/releases/tag/v1.5.2', state: null, date: '2026-10-23T08:00:00Z', refreshedAt: '2026-10-23T11:00:00Z', refreshIsAttempt: true }],
    ...changes,
  };
}
function render(changes = {}) {
  const html = renderToStaticMarkup(React.createElement(Overview, {
    workspaceName: 'Weezboo', workspaceSlug: 'team & workspace', scope: 'all', issues: issueData(), repositories: repoData(), ...changes,
  }));
  return { html, document: JSDOM.fragment(html) };
}

test('workspace overview renders exact counters, actionable issues and project slug links immediately', () => {
  const { document, html } = render();
  assert.equal(document.querySelector('h1').textContent, 'Workspace overview');
  assert.equal(document.querySelector('select'), null);
  assert.deepEqual([...document.querySelectorAll('dl dd > p:first-child')].map(el => el.textContent), ['18', '146', '7', '12']);
  assert.match(document.querySelector('dl').textContent, /Open Collab issues/);
  assert.equal(document.querySelector('#needs-attention a').getAttribute('href'), '/team%20%26%20workspace/issues/CLB-7');
  assert.match(document.querySelector('#needs-attention').textContent, /Overdue/);
  assert.match(document.querySelector('#needs-attention').textContent, /Due in the next 7 days/);
  assert.match(document.querySelector('#needs-attention').textContent, /Showing 2 of 19/);
  assert.equal(document.querySelector('tbody a').getAttribute('href'), '/team%20%26%20workspace/projects/release%20%26%20plans');
  assert.doesNotMatch(html, /private-database-id/);
  assert.equal(document.querySelector('tbody a').textContent, 'Release <plans>');
  assert.match(document.querySelector('#recent-issues').textContent, /In progress/);
  assert.equal(document.querySelector('time').getAttribute('datetime'), '2026-10-22T12:00:00.000Z');
  assert.match(document.querySelector('time').textContent, /UTC$/);
});

test('My work uses GET navigation and search, and keeps repository activity explicitly workspace-wide', () => {
  const { document } = render({ scope: 'mine', issues: issueData({ scope: 'mine', projectSearch: 'release & plans', projectPage: 2 }) });
  const nav = document.querySelector('nav[aria-label="Work scope"]');
  assert.equal(nav.querySelector('[aria-current="page"]').textContent, 'My work');
  assert.equal(nav.querySelector('a').getAttribute('href'), '/team%20%26%20workspace/dashboard?q=release+%26+plans');
  const form = document.querySelector('form');
  assert.equal(form.getAttribute('method'), 'get');
  assert.equal(form.getAttribute('action'), '/team%20%26%20workspace/dashboard');
  assert.equal(form.querySelector('[name="scope"]').getAttribute('value'), 'mine');
  assert.equal(form.querySelector('[name="q"]').getAttribute('value'), 'release & plans');
  assert.equal(document.querySelector('nav[aria-label="Project pages"] a:last-child').getAttribute('href'), '/team%20%26%20workspace/dashboard?scope=mine&q=release+%26+plans&page=3#project-overview');
  assert.match(document.querySelector('#repository-activity').textContent, /across the workspace\. My work does not filter this section/);
  assert.match(document.querySelector('#repository-activity').textContent, /Forgejo/);
  assert.match(document.querySelector('#repository-activity').textContent, /Updated 23 Oct 2026, 09:00 UTC/);
  assert.match(document.querySelector('#repository-activity').textContent, /Published 23 Oct 2026, 08:00 UTC/);
  assert.match(document.querySelector('#repository-activity').textContent, /Last refresh attempt:/);
  assert.match(document.querySelector('#repository-activity').textContent, /not a live or complete list of open PRs/);
});

test('legacy GitHub pull requests label provider updates separately from refresh attempts', () => {
  const legacy = { ...repoData().items[0], provider: 'github', refreshIsAttempt: true };
  const { document } = render({ repositories: repoData({ items: [legacy] }) });
  const activity = document.querySelector('#repository-activity');
  assert.match(activity.textContent, /Updated 23 Oct 2026, 09:00 UTC/);
  assert.match(activity.textContent, /Last refresh attempt: 23 Oct 2026, 11:00 UTC/);
  assert.doesNotMatch(activity.textContent, /Recorded 23 Oct 2026, 09:00 UTC/);
});

test('repository links reject unsafe and credential-bearing URLs while retaining readable activity', () => {
  const base = repoData().items[0];
  const items = ['javascript:alert(1)', 'data:text/html,test', '//evil.test/path', 'https://secret:password@forge.test/repo', 'not a URL', 'https://forge.example/repo/pulls/7'].map((url, i) => ({ ...base, id: `item-${i}`, url }));
  const { document, html } = render({ repositories: repoData({ items }) });
  const links = [...document.querySelectorAll('#repository-activity a')];
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), items[5].url);
  assert.equal(links[0].getAttribute('target'), '_blank');
  assert.equal(links[0].getAttribute('rel'), 'noopener noreferrer');
  assert.equal(document.querySelectorAll('#repository-activity li').length, 6);
  assert.doesNotMatch(html, /javascript:|password@|data:text/);
});

test('no connections, never refreshed and empty caches have different messages', () => {
  const states = [
    [{ connectionCount: 0, neverRefreshedCount: 0 }, 'No connected repositories'],
    [{ connectionCount: 2, neverRefreshedCount: 2 }, 'Repository activity has not been refreshed yet'],
    [{ connectionCount: 2, neverRefreshedCount: 0 }, 'No recent repository activity recorded'],
  ];
  for (const [values, message] of states) {
    const { document } = render({ repositories: repoData({ items: [], ...values }) });
    assert.ok(document.querySelector('#repository-activity').textContent.includes(message));
    assert.match(document.querySelector('dl').textContent, /146/);
  }
  const { document } = render({ scope: 'mine', issues: issueData({ scope: 'mine', attention: [], recent: [], projects: [], projectPages: 0, matchingProjects: 0, projectSearch: 'nothing' }) });
  assert.match(document.querySelector('#needs-attention').textContent, /No issues assigned to you are overdue/);
  assert.match(document.querySelector('#project-overview').textContent, /No projects match your search/);
  assert.match(document.querySelector('#recent-issues').textContent, /No issues assigned to you yet/);
});

test('each failed section keeps the other usable and preserves My work on reload', () => {
  const unavailableIssues = render({ scope: 'mine', issues: { kind: 'unavailable' } }).document;
  assert.equal(unavailableIssues.querySelector('dl'), null);
  assert.match(unavailableIssues.querySelector('#issue-summary').textContent, /temporarily unavailable/);
  assert.equal(unavailableIssues.querySelector('#issue-summary a').getAttribute('href'), '/team%20%26%20workspace/dashboard?scope=mine#issues-overview');
  assert.match(unavailableIssues.querySelector('#repository-activity').textContent, /Review invitation feedback/);
  const unavailableRepos = render({ scope: 'mine', issues: issueData({ scope: 'mine', projectSearch: 'plans', projectPage: 2 }), repositories: { kind: 'unavailable' } }).document;
  assert.equal(unavailableRepos.querySelectorAll('dl dd').length, 4);
  assert.equal(unavailableRepos.querySelector('#repository-activity a').getAttribute('href'), '/team%20%26%20workspace/dashboard?scope=mine&q=plans&page=2#repository-activity');
  assert.match(unavailableRepos.querySelector('#project-overview').textContent, /Release <plans>/);
  const denied = render({ issues: { kind: 'denied' }, repositories: { kind: 'denied' } }).document;
  assert.match(denied.querySelector('#issue-summary').textContent, /don't have permission/);
  assert.match(denied.querySelector('#repository-activity').textContent, /don't have permission/);
  assert.equal(denied.querySelector('#repository-activity a'), null);
  assert.equal(denied.querySelector('#issue-summary a'), null);
});
