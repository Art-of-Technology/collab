const { assert, test, load, matches } = require('./helpers.cjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { Extension, getSchema } = require('@tiptap/core');
const { DOMParser, DOMSerializer } = require('@tiptap/pm/model');
const { commentHtml } = load('src/lib/comment-html.ts', {
  'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked'),
});
const { MentionExtension } = load('src/components/RichEditor/extensions/mention-extension.ts', {
  '@tiptap/core': require('@tiptap/core'),
});

function activityApi(activities, {
  session = { user: { id: 'reader' } },
  issue = { id: 'issue', workspaceId: 'workspace' },
  member = { userId: 'reader', workspaceId: 'workspace' },
} = {}) {
  const rows = activities.map(row => ({ itemId: 'issue', ...row,
    createdAt: new Date(row.createdAt), details: row.details ? JSON.stringify(row.details) : null,
  }));
  const { GET } = load('src/app/api/issues/[issueId]/activities/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/auth': { getAuthSession: async () => session },
    '@/lib/prisma': { prisma: {
      issue: { findUnique: async ({ where }) => issue?.id === where.id ? issue : null },
      workspaceMember: { findUnique: async ({ where: { userId_workspaceId: key } }) =>
        member?.userId === key.userId && member?.workspaceId === key.workspaceId ? member : null },
      issueActivity: { findMany: async ({ where, orderBy, take }) => rows.filter(row => matches(row, where))
        .sort((a, b) => orderBy.createdAt === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt)
        .slice(0, take) },
    } },
  }, { URL, console });
  return url => GET(new Request(url), { params: Promise.resolve({ issueId: new URL(url).pathname.split('/')[3] }) });
}

function dependencies(RichEditor, activities = [], globals = {}) {
  const empty = () => null;
  const ui = ({ children }) => React.createElement('div', null, children);
  const deps = {
    react: { ...React, default: React }, 'react/jsx-runtime': require('react/jsx-runtime'),
    './RichEditor': { RichEditor }, '../RichEditor': { RichEditor },
    './components': { FloatingSelectionMenu: empty, SlashCommandMenu: empty, AIImprovePopover: empty },
    './extensions': Object.fromEntries(['SlashCommandsExtension', 'SubIssueCreationExtension', 'AIImproveExtension', 'LinkPreviewExtension'].map(name => [name, Extension.create({ name })])),
    './utils/ai-improve': {}, 'lucide-react': require('lucide-react'),
    '@/utils/slash-command-utils': {}, '@/lib/collaboration/provider': {},
    '@/lib/collaboration/utils': { createCollaborationUser: () => ({}) },
    'next-auth/react': { useSession: () => ({}) }, '@/hooks/queries/useUser': { useCurrentUser: () => ({}) },
    '@/components/ui/button': { Button: ({ children, onClick }) => React.createElement('button', { onClick }, children) },
    '@/components/ui/dialog': { Dialog: ({ open, children }) => open ? ui({ children }) : null, DialogContent: ui, DialogHeader: ui, DialogTitle: ui },
    '@/components/ui/scroll-area': { ScrollArea: ui },
    'isomorphic-dompurify': { default: require('isomorphic-dompurify') },
    '@/lib/comment-html': { commentHtml }, '@/lib/utils': { cn: () => '' },
    '@/components/issue/sections/activity/hooks/useIssueActivities': load('src/components/issue/sections/activity/hooks/useIssueActivities.ts', {
      react: React,
      '../utils/activityHelpers': load('src/components/issue/sections/activity/utils/activityHelpers.ts'),
    }, { window: globals.window, URL, fetch: activityApi(activities), console }),
    '@/components/ui/custom-avatar': { CustomAvatar: empty }, 'date-fns': require('date-fns'),
    '@/hooks/use-toast': { useToast: () => ({ toast: empty }) }, '@/lib/featureFlags': { IS_COLLABORATIVE_EDITING_ENABLED: false },
  };
  for (const name of ['table', 'table-row', 'table-cell', 'table-header']) deps[`@tiptap/extension-${name}`] = require(`@tiptap/extension-${name}`);
  return deps;
}

function parseEditor(props) {
  const schema = getSchema([require('@tiptap/starter-kit').default, require('@tiptap/extension-link').default, MentionExtension, ...props.additionalExtensions]);
  const document = new JSDOM(props.value).window.document;
  const parsed = DOMParser.fromSchema(schema).parse(document.body);
  const output = document.createElement('div');
  output.append(DOMSerializer.fromSchema(schema).serializeFragment(parsed.content, { document }));
  return { output, source: props.value, schema };
}

function renderDescription(value, isIssueDescription = true) {
  let props;
  let changes = 0;
  const { IssueRichEditor } = load('src/components/RichEditor/IssueRichEditor.tsx', dependencies(input => { props = input; return null; }));
  renderToStaticMarkup(React.createElement(IssueRichEditor, { value, isIssueDescription, onChange: () => { changes++; } }));
  assert.equal(changes, 0, 'reading an issue must not save a converted description');
  return parseEditor(props);
}

async function withEditor(run, { activities = [], isIssueDescription, value = '## Stored' } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  const names = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const original = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  const ref = React.createRef();
  const state = { changes: [], restored: [], closed: 0 };
  const editor = { view: { dom: dom.window.document.createElement('div') }, commands: { setContent: html => state.restored.push(html) } };
  const RichEditor = React.forwardRef((props, childRef) => {
    state[props.readOnly ? 'preview' : 'editor'] = props;
    React.useImperativeHandle(childRef, () => ({ setContent: editor.commands.setContent, getEditor: () => editor }), []);
    return null;
  });
  const globals = { window: dom.window, document: dom.window.document, setTimeout, clearTimeout };
  const deps = dependencies(RichEditor, activities, globals);
  const { IssueRichEditor } = load('src/components/RichEditor/IssueRichEditor.tsx', deps, globals);
  const { EditorHistoryModal } = load('src/components/RichEditor/components/EditorHistoryModal.tsx', deps, globals);
  const props = { value, isIssueDescription, onChange: html => state.changes.push(html), ref };
  const render = async (updates = {}) => {
    Object.assign(props, updates);
    await React.act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(IssueRichEditor, props),
      React.createElement(EditorHistoryModal, { isOpen: true, onClose: () => { state.closed++; }, collabDocumentId: 'issue.description', issueId: 'issue', editorRef: ref }))));
  };
  const buttons = () => [...dom.window.document.querySelectorAll('button')];
  const click = async text => {
    const button = buttons().find(button => button.textContent.trim() === text);
    assert.ok(button, `button exists: ${text}`);
    await React.act(async () => button.click());
  };
  try {
    await render();
    await run({ state, ref, render, click, buttons });
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

function activity(id, fields) {
  return { id, action: 'DESCRIPTION_UPDATED', createdAt: '2026-10-17T12:00:00Z', user: { id, name: id }, ...fields };
}

async function webDescription(value) {
  let saved;
  const { compareObjects, trackFieldChanges } = load('src/lib/board-item-activity-service.ts', {
    '@/lib/prisma': { prisma: { issueActivity: { create: async ({ data }) => { saved = data; return data; } } } },
  });
  await trackFieldChanges({ itemType: 'ISSUE', itemId: 'issue', userId: 'web-user', workspaceId: 'workspace',
    changes: compareObjects({ description: 'Old description' }, { description: value }, ['description']),
  });
  assert.equal(saved.action, 'DESCRIPTION_CHANGED');
  assert.equal(saved.newValue, value);
  return activity('Web', saved);
}

const markdown = '## Handoff\n\n**Ready** for [review](https://example.com)\n\n- First\n- Second\n\n```sh\ncollab issues get CLB-1\n```\n\n| Agent | State |\n| --- | --- |\n| Navy | Done |';
function assertMarkdown(output) {
  assert.equal(output.querySelector('h2')?.textContent, 'Handoff');
  assert.equal(output.querySelector('strong')?.textContent, 'Ready');
  assert.equal(output.querySelector('a')?.getAttribute('href'), 'https://example.com');
  assert.equal(output.querySelectorAll('ul li').length, 2);
  assert.equal(output.querySelector('pre code')?.textContent.trim(), 'collab issues get CLB-1');
  assert.equal(output.querySelectorAll('th').length, 2);
  assert.equal(output.querySelectorAll('td').length, 2);
}

const richHtml = '<h2>Existing</h2><p><strong>Bold</strong> <span data-type="mention" data-id="alice" data-label="Alice">@Alice</span></p><pre><code>## literal\n**unchanged**</code></pre>';
function assertRichHtml(output) {
  assert.ok(output.querySelector('[data-id="alice"]'));
  assert.equal(output.querySelector('pre code')?.textContent, '## literal\n**unchanged**');
  assert.equal(output.querySelector('strong')?.textContent, 'Bold');
}

test('issue descriptions load Markdown as editable headings, lists, code, links and tables', () => {
  assertMarkdown(renderDescription(markdown).output);
});

test('issue description conversion preserves rich HTML, mentions and literal Markdown in code', () => {
  assertRichHtml(renderDescription(richHtml).output);
});

test('issue descriptions sanitize executable HTML and keep empty input empty', () => {
  const { source } = renderDescription('## Safe\n\n<img src=x onerror="alert(1)"><script>alert(1)</script>\n\n[bad](javascript:alert%281%29)');
  const document = new JSDOM(source).window.document;
  assert.equal(document.querySelectorAll('script,[onerror],[href^="javascript:"]').length, 0);
  assert.equal(renderDescription('').source, '');
});

test('issue external updates and imperative restore convert without saving until an edit', async () => {
  await withEditor(async ({ state, ref, render }) => {
    assert.equal(parseEditor(state.editor).output.querySelector('h2')?.textContent, 'Stored');
    await render({ value: markdown });
    assertMarkdown(parseEditor(state.editor).output);
    await React.act(async () => ref.current.setContent(markdown));
    assertMarkdown(parseEditor({ ...state.editor, value: state.restored.at(-1) }).output);
    assert.deepEqual(state.changes, []);
    state.editor.onChange('<h2>Edited</h2>');
    assert.deepEqual(state.changes, ['<h2>Edited</h2>']);
  }, { isIssueDescription: true });
});

test('Notes preserve literal Markdown for initial, external and imperative input', async () => {
  await withEditor(async ({ state, ref, render }) => {
    assert.equal(state.editor.value, '## Stored');
    assert.ok(parseEditor(state.editor).schema.nodes.table);
    await render({ value: markdown });
    assert.equal(state.editor.value, markdown);
    await React.act(async () => ref.current.setContent(markdown));
    assert.equal(state.restored.at(-1), markdown);
    assert.deepEqual(state.changes, []);
    state.editor.onChange('<p>## Edited note</p>');
    assert.deepEqual(state.changes, ['<p>## Edited note</p>']);
  });
});

test('Note HTML tables retain separate headers, cells, links and merged cells across load, edit and reload', async () => {
  const html = '<h2>Recommended topology</h2><table><thead><tr><th>Layer</th><th>Proposed design</th><th>Failure addressed</th></tr></thead><tbody><tr><td>Entry point</td><td><a href="https://example.com">Managed load balancer</a></td><td>One target fails</td></tr><tr><td colspan="2"><strong>Database</strong></td><td>One host fails</td></tr></tbody></table>';
  function check(output) {
    assert.equal(output.querySelectorAll('table').length, 1);
    assert.equal(output.querySelectorAll('tr').length, 3);
    assert.deepEqual([...output.querySelectorAll('th')].map(cell => cell.textContent), ['Layer', 'Proposed design', 'Failure addressed']);
    assert.deepEqual([...output.querySelectorAll('td')].map(cell => cell.textContent), ['Entry point', 'Managed load balancer', 'One target fails', 'Database', 'One host fails']);
    assert.equal(output.querySelector('td[colspan="2"] strong')?.textContent, 'Database');
    assert.equal(output.querySelector('a')?.getAttribute('href'), 'https://example.com');
  }
  await withEditor(async ({ state, ref, render }) => {
    check(parseEditor(state.editor).output);
    await render({ value: '<p>Other note</p>' });
    await render({ value: html });
    check(parseEditor(state.editor).output);
    await React.act(async () => ref.current.setContent(html));
    check(parseEditor({ ...state.editor, value: state.restored.at(-1) }).output);
    assert.deepEqual(state.changes, [], 'loading/restoring a table must not save it');
    const edited = parseEditor(state.editor).output;
    edited.querySelector('h2').textContent = 'Updated topology';
    state.editor.onChange(edited.innerHTML);
    await render({ value: state.changes.at(-1) });
    check(parseEditor(state.editor).output);
    assert.equal(parseEditor(state.editor).output.querySelector('h2').textContent, 'Updated topology');
  }, { value: html });
});

test('history restores web, CLI and legacy descriptions despite over 100 newer unrelated activities', async () => {
  const entries = [
    await webDescription(commentHtml(markdown)),
    activity('CLI', { action: 'UPDATED', fieldName: 'description', newValue: markdown }),
    activity('Legacy display', { details: { displayNewValue: markdown, newValue: 'older' } }),
    activity('Legacy details', { details: { newValue: markdown } }),
    activity('Legacy field', { newValue: markdown }),
    ...['displayNewValue', 'newValue', 'description'].map(field => activity(`Snapshot ${field}`, { newValue: { [field]: markdown } })),
  ];
  await withEditor(async ({ state, click, buttons }) => {
    assert.equal(buttons().filter(button => button.textContent.includes('made changes')).length, entries.length);
    for (const entry of entries) {
      await click(buttons().find(b => b.textContent.startsWith(`${entry.user.name} made changes`)).textContent);
      assertMarkdown(parseEditor(state.preview).output);
      assert.equal(state.preview.readOnly, true);
      assert.equal(state.restored.length, state.closed, 'preview alone must not restore content');
      await click('Revert to this version');
      assertMarkdown(parseEditor({ ...state.editor, value: state.restored.at(-1) }).output);
    }
    assert.equal(state.closed, entries.length);
    assert.deepEqual(state.changes, []);
  }, { isIssueDescription: true, activities: [...entries,
    ...Array.from({ length: 120 }, (_, i) => activity(`Title ${i}`, {
      action: i % 2 ? 'UPDATED' : 'TITLE_CHANGED', fieldName: 'title', newValue: 'New title', createdAt: '2026-10-18T12:00:00Z',
    })),
    activity('Created', { action: 'CREATED', fieldName: 'description', newValue: markdown, createdAt: '2026-10-18T12:00:00Z' }),
    activity('Foreign issue', { action: 'DESCRIPTION_CHANGED', itemId: 'other-issue', newValue: markdown, createdAt: '2026-10-18T12:00:00Z' }),
  ] });
});

test('description activity API applies its scope before the limit and retains ordinary query behavior', async () => {
  const descriptions = Array.from({ length: 105 }, (_, i) => activity(`Description ${i}`, {
    action: ['DESCRIPTION_CHANGED', 'DESCRIPTION_UPDATED', 'UPDATED'][i % 3],
    ...(i % 3 === 2 ? { fieldName: 'description' } : {}), newValue: markdown,
    createdAt: new Date(Date.UTC(2026, 9, 17, 12, 0, 105 - i)).toISOString(),
  }));
  const title = activity('Title', { action: 'UPDATED', fieldName: 'title', createdAt: '2026-10-18T12:00:00Z' });
  const api = activityApi([title, ...descriptions]);
  const query = async params => {
    const response = await api(`https://fixture.invalid/api/issues/issue/activities?${params}`);
    assert.equal(response.status, 200);
    return (await response.json()).map(row => row.id);
  };
  assert.deepEqual(await query('descriptionOnly=true&limit=100'), descriptions.slice(0, 100).map(row => row.id));
  assert.deepEqual(await query(''), [title, ...descriptions].slice(0, 50).map(row => row.id));
  assert.deepEqual(await query('descriptionOnly=false&limit=1'), [title.id]);
  assert.deepEqual(await query('action=DESCRIPTION_UPDATED&limit=2'), descriptions.filter(row => row.action === 'DESCRIPTION_UPDATED').slice(0, 2).map(row => row.id));
  assert.deepEqual(await query('action=UPDATED&descriptionOnly=true&limit=2'), descriptions.filter(row => row.action === 'UPDATED').slice(0, 2).map(row => row.id));
});

test('description activity queries preserve session, issue and workspace access checks', async () => {
  for (const [access, status] of [[{ session: null }, 401], [{ issue: null }, 404], [{ member: null }, 403]]) {
    const api = activityApi([activity('Private', { newValue: markdown })], access);
    const response = await api('https://fixture.invalid/api/issues/issue/activities?descriptionOnly=true&limit=100');
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('history sanitizes previews and both restore interfaces while preserving rich content', async () => {
  const unsafe = richHtml + '<img src=x onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">bad</a>';
  await withEditor(async ({ state, ref, click, buttons }) => {
    for (const fallback of [false, true]) {
      await click(buttons().find(b => b.textContent.startsWith('HTML made changes')).textContent);
      const { source, output } = parseEditor(state.preview);
      assertRichHtml(output);
      assert.equal(new JSDOM(source).window.document.querySelectorAll('script,[onerror],[href^="javascript:"]').length, 0);
      if (fallback) ref.current = { getEditor: () => ({ commands: { setContent: html => state.restored.push(html) } }) };
      await click('Revert to this version');
      assert.equal(state.restored.at(-1), source);
      assertRichHtml(parseEditor({ ...state.editor, value: state.restored.at(-1) }).output);
    }
  }, { isIssueDescription: true, activities: [activity('HTML', { newValue: unsafe })] });
});

test('history restores empty descriptions without falling back to older snapshot values', async () => {
  const entries = [
    activity('Empty display', { details: { displayNewValue: '', newValue: 'older' }, newValue: 'older' }),
    activity('Empty details', { details: { newValue: '' }, newValue: 'older' }),
    activity('Empty field', { action: 'UPDATED', fieldName: 'description', newValue: '' }),
    activity('Null field', { action: 'UPDATED', fieldName: 'description', newValue: null }),
    activity('Empty snapshot', { newValue: { displayNewValue: '', newValue: 'older', description: 'older' } }),
  ];
  await withEditor(async ({ state, click, buttons }) => {
    for (const entry of entries) {
      await click(buttons().find(b => b.textContent.startsWith(`${entry.user.name} made changes`)).textContent);
      assert.equal(state.preview.value, '');
      await click('Revert to this version');
      assert.equal(state.restored.at(-1), '');
    }
  }, { isIssueDescription: true, activities: entries });
});
