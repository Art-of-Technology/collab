const { assert, test, load } = require('./helpers.cjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { Extension, getSchema } = require('@tiptap/core');
const { DOMParser, DOMSerializer } = require('@tiptap/pm/model');
const { commentHtml } = load('src/lib/comment-html.ts', {
  'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked'),
});

function renderDescription(value) {
  let props;
  let changes = 0;
  const empty = () => null;
  const dependencies = {
    react: { ...React, default: React }, 'react/jsx-runtime': require('react/jsx-runtime'),
    './RichEditor': { RichEditor: input => { props = input; return null; } },
    './components': { FloatingSelectionMenu: empty, SlashCommandMenu: empty, AIImprovePopover: empty },
    './extensions': Object.fromEntries(['SlashCommandsExtension', 'SubIssueCreationExtension', 'AIImproveExtension', 'LinkPreviewExtension'].map(name => [name, Extension.create({ name })])),
    './utils/ai-improve': {}, 'lucide-react': require('lucide-react'),
    '@/utils/slash-command-utils': {}, '@/lib/collaboration/provider': {},
    '@/lib/collaboration/utils': { createCollaborationUser: () => ({}) },
    'next-auth/react': { useSession: () => ({}) }, '@/hooks/queries/useUser': { useCurrentUser: () => ({}) },
    '@/components/ui/button': { Button: empty }, '@/components/ui/dialog': { Dialog: empty, DialogContent: empty, DialogHeader: empty, DialogTitle: empty }, '@/components/ui/scroll-area': { ScrollArea: empty },
    'isomorphic-dompurify': { default: require('isomorphic-dompurify') },
    '@/lib/comment-html': { commentHtml }, '@/lib/utils': { cn: () => '' },
    '@/components/issue/sections/activity/hooks/useIssueActivities': { useIssueActivities: () => ({ activities: [] }) },
    '@/components/ui/custom-avatar': {}, 'date-fns': require('date-fns'),
    '@/hooks/use-toast': { useToast: () => ({}) }, '@/lib/featureFlags': { IS_COLLABORATIVE_EDITING_ENABLED: false },
  };
  for (const name of ['table', 'table-row', 'table-cell', 'table-header']) dependencies[`@tiptap/extension-${name}`] = require(`@tiptap/extension-${name}`);
  const { IssueRichEditor } = load('src/components/RichEditor/IssueRichEditor.tsx', dependencies);
  renderToStaticMarkup(React.createElement(IssueRichEditor, { value, onChange: () => { changes++; } }));
  const schema = getSchema([require('@tiptap/starter-kit').default, require('@tiptap/extension-link').default, ...props.additionalExtensions]);
  const document = new JSDOM(props.value).window.document;
  const parsed = DOMParser.fromSchema(schema).parse(document.body);
  const output = document.createElement('div');
  output.append(DOMSerializer.fromSchema(schema).serializeFragment(parsed.content, { document }));
  assert.equal(changes, 0, 'reading an issue must not save a converted description');
  return { output, source: props.value };
}

test('issue descriptions load Markdown as editable headings, lists, code, links and tables', () => {
  const { output } = renderDescription('## Handoff\n\n**Ready** for [review](https://example.com)\n\n- First\n- Second\n\n```sh\ncollab issues get CLB-1\n```\n\n| Agent | State |\n| --- | --- |\n| Navy | Done |');
  assert.equal(output.querySelector('h2')?.textContent, 'Handoff');
  assert.equal(output.querySelector('strong')?.textContent, 'Ready');
  assert.equal(output.querySelector('a')?.getAttribute('href'), 'https://example.com');
  assert.equal(output.querySelectorAll('ul li').length, 2);
  assert.equal(output.querySelector('pre code')?.textContent.trim(), 'collab issues get CLB-1');
  assert.equal(output.querySelectorAll('th').length, 2);
  assert.equal(output.querySelectorAll('td').length, 2);
});

test('issue description conversion preserves rich HTML and literal Markdown in code', () => {
  const html = '<h2>Existing</h2><p><strong>Bold</strong> <span data-type="mention" data-id="alice">@Alice</span></p><pre><code>## literal\n**unchanged**</code></pre>';
  const { source } = renderDescription(html);
  const document = new JSDOM(source).window.document;
  assert.equal(document.querySelector('[data-id="alice"]')?.textContent, '@Alice');
  assert.equal(document.querySelector('pre code')?.textContent, '## literal\n**unchanged**');
  assert.equal(document.querySelector('strong')?.textContent, 'Bold');
});

test('issue descriptions sanitize executable HTML and keep empty input empty', () => {
  const { source } = renderDescription('## Safe\n\n<img src=x onerror="alert(1)"><script>alert(1)</script>\n\n[bad](javascript:alert%281%29)');
  const document = new JSDOM(source).window.document;
  assert.equal(document.querySelectorAll('script,[onerror],[href^="javascript:"]').length, 0);
  assert.equal(renderDescription('').source, '');
});
