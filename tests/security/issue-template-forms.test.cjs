const { test, assert, load, readFileSync, ts } = require('./helpers.cjs');
const React = require('react');
const { JSDOM } = require('jsdom');

const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
const library = load('src/lib/issue-templates.ts', { '@/lib/comment-html': { commentHtml } });
const { STANDARD_TEMPLATES, TEMPLATED_TYPES, templateBody } = library;
const headings = type => templateBody(STANDARD_TEMPLATES[type], 'html');

// Mounts one of the two forms that create issues, with the real template library, hook and checklist.
// The editor is a plain text box holding the description's HTML; the selectors are buttons.
async function mounted(file, name, props, run, templates = TEMPLATED_TYPES.map(type => STANDARD_TEMPLATES[type])) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test' });
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const created = [];
  const empty = () => null;
  const container = ({ children }) => React.createElement('div', null, children);
  const editor = ({ value, onChange }) => React.createElement('textarea', { 'aria-label': 'Description', value, onChange: event => onChange(event.target.value) });
  const choices = (label, values) => ({ onChange }) => values.map(value =>
    React.createElement('button', { key: value, 'aria-label': `${label} ${value}`, onClick: () => onChange(value) }, value));
  const query = { useQueryClient: () => ({ invalidateQueries() {} }), useQuery: options => ({ data: options.enabled && templates ? { enforced: false, canManage: false, templates } : undefined }) };
  const utils = { cn: (...parts) => parts.filter(part => typeof part === 'string').join(' ') };
  const shared = { react: { ...React, default: React }, 'react/jsx-runtime': require('react/jsx-runtime'), 'lucide-react': require('lucide-react'), '@/lib/utils': utils };
  const deps = Object.fromEntries(ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles.map(({ fileName }) => [fileName,
    new Proxy({}, { get: (_, key) => (key === '__esModule' ? false : empty) })]));
  Object.assign(deps, shared, {
    '@tanstack/react-query': query,
    '@/lib/issue-templates': library,
    '@/hooks/queries/useIssueTemplates': load('src/hooks/queries/useIssueTemplates.ts', { ...shared, '@tanstack/react-query': query, '@/lib/issue-templates': library }, { fetch: async () => Response.json({}) }),
    './IssueTemplateChecklist': load('src/components/issue/IssueTemplateChecklist.tsx', shared),
    '@/hooks/queries/useIssues': { useCreateIssue: () => ({ isPending: false, mutateAsync: async data => { created.push(data); return { issue: { id: 'new', issueKey: 'P-2' } }; } }) },
    '@/hooks/use-toast': { useToast: () => ({ toast() {} }) },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/components/ui/dialog': { Dialog: container, DialogContent: container, DialogTitle: container },
    '@radix-ui/react-visually-hidden': { VisuallyHidden: container },
    '@/components/ui/button': { Button: ({ children, variant, size, ...rest }) => React.createElement('button', rest, children) },
    '@/components/RichEditor/IssueRichEditor': { IssueRichEditor: editor },
    '@/components/RichEditor': { RichEditor: editor },
    './IssueTitleInput': { IssueTitleInput: React.forwardRef(({ value, onChange }, ref) =>
      React.createElement('input', { ref, 'aria-label': 'Title', value, onChange: event => onChange(event.target.value) })) },
    './selectors/IssueTypeSelector': { IssueTypeSelector: choices('Type', ['TASK', 'BUG', 'STORY', 'SUBTASK']) },
    './selectors/IssuePrioritySelector': { IssuePrioritySelector: choices('Priority', ['HIGH']) },
  });
  const Component = load(file, deps, { console, setTimeout: () => 0, fetch: async () => Response.json({}) })[name];
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  const document = dom.window.document;
  const page = {
    created,
    description: () => document.querySelector('[aria-label="Description"]').value,
    missing: () => [...document.querySelectorAll('[aria-label="Issue template"] [data-state="missing"]')].map(item => item.textContent.split(' (missing)')[0]),
    checklist: () => document.querySelector('[aria-label="Issue template"]'),
    button: text => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text || item.getAttribute('aria-label') === text),
    setTemplates: value => { templates = value; },
    render: async changes => { props = { ...props, ...changes }; await React.act(async () => root.render(React.createElement(Component, props))); },
    click: async text => { assert.ok(page.button(text), `button "${text}"`); await React.act(async () => page.button(text).click()); },
    type: async (label, value) => {
      const field = document.querySelector(`[aria-label="${label}"], [placeholder="${label}"]`);
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, value);
        field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
    },
  };
  try {
    await React.act(async () => root.render(React.createElement(Component, props)));
    await run(page);
  } finally {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, original] of originals) { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; }
  }
}

const modal = (run, templates, open = true) => mounted('src/components/issue/NewIssueModal.tsx', 'default',
  { open, onOpenChange() {}, workspaceId: 'workspace', projectId: 'project', currentUserId: 'me' }, run, templates);

test('the new issue form starts with the headings of the chosen type and lists what is missing', async () => {
  await modal(async page => {
    assert.equal(page.description(), headings('TASK'));
    assert.deepEqual(page.missing(), ['What', 'Why', 'Done when']);
    assert.ok(page.button('Create anyway'));

    await page.click('Type BUG');
    assert.equal(page.description(), headings('BUG'));
    assert.deepEqual(page.missing(), ['Summary', 'Steps to reproduce', 'Expected result', 'Actual result', 'Environment', 'Severity and impact', 'Priority']);

    await page.type('Description', headings('BUG').replace('</h2>', '</h2><p>It crashes on save.</p>'));
    assert.equal(page.missing().includes('Summary'), false);
    assert.equal(page.missing().length, 6);
    // A priority counts once the person has chosen one; the default does not.
    await page.click('Priority HIGH');
    assert.equal(page.missing().includes('Priority'), false);
  });
});

test('what a person has typed survives a change of type, and untouched headings do not', async () => {
  await modal(async page => {
    await page.click('Type STORY');
    assert.equal(page.description(), headings('STORY'));
    await page.click('Type SUBTASK');
    assert.equal(page.description(), '');
    assert.equal(page.checklist(), null);
    assert.ok(page.button('Create issue'));

    await page.type('Description', '<p>My own words.</p>');
    await page.click('Type BUG');
    assert.equal(page.description(), '<p>My own words.</p>');
    assert.equal(page.missing().length, 7);
  });
});

test('a quick issue with untouched headings is stored without a description', async () => {
  await modal(async page => {
    await page.type('Title', 'Quick one');
    await page.click('Create anyway');
    assert.equal(page.created.length, 1);
    assert.deepEqual([page.created[0].title, page.created[0].type, page.created[0].description, page.created[0].priority], ['Quick one', 'TASK', undefined, 'MEDIUM']);
  });
});

test('a complete issue is created under the usual button, with its description', async () => {
  await modal(async page => {
    const complete = headings('TASK').replaceAll('</h2>', '</h2><p>Something real.</p>');
    await page.type('Title', 'Thorough one');
    await page.type('Description', complete);
    assert.deepEqual(page.missing(), []);
    await page.click('Create issue');
    assert.equal(page.created[0].description, complete);
  });
});

test('without templates the form behaves as before', async () => {
  await modal(async page => {
    assert.equal(page.description(), '');
    assert.equal(page.checklist(), null);
    await page.type('Title', 'Plain');
    await page.click('Create issue');
    assert.equal(page.created[0].description, undefined);
  }, null);
});

test('a form that is not open does not read the templates', async () => {
  await modal(async page => {
    assert.equal(page.description(), '');
    assert.equal(page.checklist(), null);
  }, undefined, false);
  await mounted('src/components/issue/InlineIssueCreator.tsx', 'InlineIssueCreator', { workspaceId: 'workspace', projectId: 'project' }, async page => {
    await page.click('Add sub-issue');
    assert.equal(page.description(), headings('TASK'));
  });
});

test('the inline creator pre-fills, guides and stores the same way', async () => {
  await mounted('src/components/issue/InlineIssueCreator.tsx', 'InlineIssueCreator', { workspaceId: 'workspace', projectId: 'project', autoFocus: true }, async page => {
    assert.equal(page.description(), headings('TASK'));
    assert.deepEqual(page.missing(), ['What', 'Why', 'Done when']);
    await page.click('Type BUG');
    assert.equal(page.missing().at(-1), 'Priority');
    await page.type('Issue title', 'Sub-issue');
    await page.click('Create anyway');
    assert.deepEqual([page.created[0].type, page.created[0].description, page.created[0].priority], ['BUG', undefined, 'MEDIUM']);
    // The form stays open for the next one, cleared back to a Task with its headings.
    assert.equal(page.description(), headings('TASK'));
  });
});

test('closed forms do not retain headings when templates become unavailable', async () => {
  await modal(async page => {
    await page.render({ onOpenChange: open => page.render({ open }) });
    await page.click('Type BUG');
    await page.type('Title', 'First');
    await page.click('Create anyway');
    page.setTemplates(null);
    await page.render({ open: true });
    assert.equal(page.description(), '');
    await page.type('Title', 'Second');
    await page.click('Create issue');
    assert.equal(page.created[1].description, undefined);
  });
  await mounted('src/components/issue/InlineIssueCreator.tsx', 'InlineIssueCreator', { workspaceId: 'workspace', projectId: 'project', autoFocus: true }, async page => {
    await page.click('Type BUG');
    await page.click('Cancel');
    page.setTemplates(null);
    await page.click('Add sub-issue');
    assert.equal(page.description(), '');
    await page.type('Issue title', 'Second');
    await page.click('Create');
    assert.equal(page.created[0].description, undefined);
  });
});
