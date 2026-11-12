const { assert, test, load } = require('./helpers.cjs');

// Sections are looked for in the description as people see it, so the real renderer is used.
const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
const library = load('src/lib/issue-templates.ts', { '@/lib/comment-html': { commentHtml } });
const { STANDARD_TEMPLATES, TEMPLATED_TYPES, TEMPLATE_FIELDS, missingSections, missingFields, templateBody, templateFor } = library;
const BUG = STANDARD_TEMPLATES.BUG;
// The library runs in its own context, so its arrays are copied before they are compared.
const required = template => Array.from(template.sections).filter(section => section.required).map(section => section.title);
const markdown = (template, skip = []) => Array.from(template.sections).filter(section => !skip.includes(section.title))
  .map(section => `## ${section.title}\n\nDetails.\n`).join('\n');
const html = template => Array.from(template.sections).map(section => `<h2>${section.title}</h2><p>Details.</p>`).join('');

test('each templated type has a standard template, and Subtask has none', () => {
  assert.deepEqual([...TEMPLATED_TYPES], ['BUG', 'STORY', 'EPIC', 'MILESTONE', 'TASK']);
  assert.deepEqual([...TEMPLATE_FIELDS], ['priority', 'dueDate', 'startDate', 'assigneeId', 'storyPoints', 'labels']);
  assert.deepEqual(required(BUG), ['Summary', 'Steps to reproduce', 'Expected result', 'Actual result', 'Environment', 'Severity and impact']);
  assert.deepEqual(required(STANDARD_TEMPLATES.STORY), ['User story', 'Actors', 'Preconditions', 'Main flow', 'Acceptance criteria']);
  assert.deepEqual(required(STANDARD_TEMPLATES.EPIC), ['Goal', 'Background', 'Scope', 'Non-goals', 'Success measures', 'Deliverables']);
  assert.deepEqual(required(STANDARD_TEMPLATES.MILESTONE), ['Goal', 'Deliverables', 'Exit criteria', 'Target date']);
  assert.deepEqual(required(STANDARD_TEMPLATES.TASK), ['What', 'Why', 'Done when']);
  assert.deepEqual(Array.from(TEMPLATED_TYPES, type => [...STANDARD_TEMPLATES[type].requiredFields]), [['priority'], [], [], ['dueDate'], []]);
  for (const type of TEMPLATED_TYPES) assert.deepEqual([STANDARD_TEMPLATES[type].version, STANDARD_TEMPLATES[type].standard], [1, true]);
  assert.equal(templateFor(STANDARD_TEMPLATES, 'bug'), BUG);
  assert.equal(templateFor(STANDARD_TEMPLATES, 'SUBTASK'), null);
  assert.equal(templateFor(STANDARD_TEMPLATES, 'nope'), null);
});

test('a description with every required section filled is complete, as Markdown and as editor HTML', () => {
  for (const type of TEMPLATED_TYPES) {
    assert.deepEqual([...missingSections(STANDARD_TEMPLATES[type], markdown(STANDARD_TEMPLATES[type]))], [], type);
    assert.deepEqual([...missingSections(STANDARD_TEMPLATES[type], html(STANDARD_TEMPLATES[type]))], [], type);
  }
});

test('missing sections are named in the order of the template', () => {
  assert.deepEqual([...missingSections(BUG, markdown(BUG, ['Environment', 'Summary']))], ['Summary', 'Environment']);
  assert.deepEqual([...missingSections(BUG, null)], required(BUG));
  assert.deepEqual([...missingSections(BUG, 'Steps to reproduce: open the page. Expected result: it loads.')], required(BUG));
});

test('a heading matches its section whatever its case, level, spacing or trailing colon', () => {
  const body = markdown(BUG, ['Steps to reproduce', 'Summary']) + '\n### steps  to reproduce:\n\n1. Open the page.\n\n<h4>SUMMARY</h4><p>It breaks.</p>';
  assert.deepEqual([...missingSections(BUG, body)], []);
});

test('a label in bold is not a section heading', () => {
  const body = markdown(BUG, ['Summary']) + '\n**Summary**\n\nIt breaks.\n';
  assert.deepEqual([...missingSections(BUG, body)], ['Summary']);
});

test('heading attributes and hidden content follow the rendered description', () => {
  const rest = markdown(BUG, ['Summary']);
  for (const level of [1, 2, 3, 4]) {
    assert.deepEqual([...missingSections(BUG, `<h${level} title="A > B">Summary</h${level}><p>Broken</p>\n\n${rest}`)], []);
  }
  for (const content of ['<span style="display:none">placeholder</span>', '<span hidden>placeholder</span>', '<span style="visibility:hidden"><img src="https://example.test/a.png"></span>', '<span title="A > B"></span>', '&#8203;']) {
    assert.deepEqual([...missingSections(BUG, `<h2>Summary</h2><p>${content}</p>\n\n${rest}`)], ['Summary'], content);
  }
  assert.deepEqual([...missingSections(BUG, `<h2>Summary</h2><span style="display:none"><h2>Other</h2></span><p>Broken</p>\n\n${rest}`)], []);
});

test('a section holding only a comment, blank space or an empty paragraph is empty; an image or a short answer fills it', () => {
  const rest = markdown(BUG, ['Summary']);
  for (const empty of ['## Summary\n\n<!-- what is wrong -->\n', '## Summary\n\n   \n', '<h2>Summary</h2><p></p>', '<h2>Summary</h2><p>&nbsp;</p>']) {
    assert.deepEqual([...missingSections(BUG, `${empty}\n\n${rest}`)], ['Summary'], empty);
  }
  for (const filled of ['## Summary\n\nN/A\n', '## Summary\n\n![screen](https://example.test/a.png)\n', '<h2>Summary</h2><ul><li>It breaks</li></ul>']) {
    assert.deepEqual([...missingSections(BUG, `${filled}\n\n${rest}`)], [], filled);
  }
});

test('a required field is missing when it is absent, empty or an empty list', () => {
  assert.deepEqual([...missingFields(BUG, {})], ['priority']);
  assert.deepEqual([...missingFields(BUG, { priority: '' })], ['priority']);
  assert.deepEqual([...missingFields(BUG, { priority: null })], ['priority']);
  assert.deepEqual([...missingFields(BUG, { priority: 'high' })], []);
  assert.deepEqual([...missingFields(STANDARD_TEMPLATES.MILESTONE, { dueDate: '2026-12-01T00:00:00.000Z' })], []);
  assert.deepEqual([...missingFields({ ...BUG, requiredFields: ['labels', 'storyPoints'] }, { labels: [], storyPoints: 3 })], ['labels']);
  assert.deepEqual([...missingFields(STANDARD_TEMPLATES.TASK, {})], []);
});

test('the Markdown body gives every section as a heading with its guidance in a comment, and counts as unfilled', () => {
  const body = templateBody(BUG, 'markdown');
  for (const section of BUG.sections) assert.ok(body.includes(`## ${section.title}\n\n<!-- ${section.guidance}`), section.title);
  assert.deepEqual([...missingSections(BUG, body)], required(BUG));
  assert.equal(commentHtml(body).includes('numbered steps'), false);
});

test('the HTML body is headings only, and counts as unfilled', () => {
  const body = templateBody(BUG, 'html');
  assert.equal(body, Array.from(BUG.sections).map(section => `<h2>${section.title}</h2>`).join(''));
  assert.deepEqual([...missingSections(BUG, body)], required(BUG));
});

test('guidance cannot close its own comment or break out of a heading', () => {
  const odd = { ...BUG, sections: [{ title: 'A <b>title</b> & more', required: true, guidance: 'stop --> here' }] };
  assert.equal(templateBody(odd, 'markdown').includes('--> here'), false);
  assert.equal(templateBody(odd, 'html'), '<h2>A &lt;b&gt;title&lt;/b&gt; &amp; more</h2>');
});

// The read routes for agents. The store has no database yet: every workspace gets the standards.
function routes({ scopes = ['issues:read'], access = true } = {}) {
  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/issue-templates': library,
    '@/lib/issue-finder': { userHasWorkspaceAccess: async () => access },
    '@/lib/apps/auth-middleware': { withAppAuth: (handler, options) => (request, params) =>
      options.requiredScopes.every(scope => scopes.includes(scope))
        ? handler(request, { user: { id: 'agent-user' }, workspace: { id: 'workspace-one' } }, params)
        : Response.json({ error: 'insufficient_scope' }, { status: 403 }) },
  };
  dependencies['@/lib/issue-template-store'] = load('src/lib/issue-template-store.ts', dependencies);
  const request = new Request('https://example.test/api');
  return {
    list: () => load('src/app/api/apps/auth/issue-templates/route.ts', dependencies, { console }).GET(request),
    one: type => load('src/app/api/apps/auth/issue-templates/[type]/route.ts', dependencies, { console })
      .GET(request, { params: Promise.resolve({ type }) }),
  };
}

test('an agent can list the workspace templates, each with a Markdown body to fill in', async () => {
  const response = await routes().list();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.enforced, false);
  assert.deepEqual(body.templates.map(template => template.type), ['BUG', 'STORY', 'EPIC', 'MILESTONE', 'TASK']);
  assert.deepEqual(body.templates[0].requiredFields, ['priority']);
  assert.ok(body.templates.every(template => template.standard && template.version === 1 && template.body.startsWith(`## ${template.sections[0].title}\n`)));
});

test('an agent can read one template by type, in any letter case', async () => {
  const response = await routes().one('bug');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual([body.type, body.enforced, body.sections[1].title, body.sections[1].required], ['BUG', false, 'Steps to reproduce', true]);
  assert.ok(body.body.includes('## Steps to reproduce\n\n<!-- Numbered steps'));
});

test('there is no template to read for Subtask or an unknown type', async () => {
  for (const type of ['subtask', 'SUBTASK', 'nope']) {
    const response = await routes().one(type);
    assert.equal(response.status, 404, type);
    assert.equal((await response.json()).error, 'template_not_found');
  }
});

test('templates need the issues read scope and current access to the workspace', async () => {
  assert.equal((await routes({ scopes: ['context:read'] }).list()).status, 403);
  assert.equal((await routes({ scopes: ['context:read'] }).one('bug')).status, 403);
  const denied = await routes({ access: false }).list();
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error, 'workspace_access_denied');
  assert.equal((await routes({ access: false }).one('bug')).status, 403);
});
