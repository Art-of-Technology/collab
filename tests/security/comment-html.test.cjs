const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { load } = require('./helpers.cjs');
const { commentHtml } = load('src/lib/comment-html.ts', {
  'isomorphic-dompurify': { default: require('isomorphic-dompurify') },
  marked: require('marked'),
});

function documentFor(content, html) {
  return new JSDOM(commentHtml(content, html)).window.document;
}

test('RichEditor schema round-trips all heading levels and existing Markdown structures', async () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { Extension, getSchema } = require('@tiptap/core');
  const { DOMParser, DOMSerializer } = require('@tiptap/pm/model');
  const stop = new Error('editor options captured');
  let options;
  const dependencies = {
    react: { ...React, default: React },
    'react-dom': require('react-dom'),
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tiptap/react': { useEditor: value => { options = value; throw stop; } },
    '@/context/WorkspaceContext': { useWorkspace: () => ({}) },
    '@/hooks/use-toast': { useToast: () => ({}) },
    '@/lib/utils': load('src/lib/utils.ts', { clsx: require('clsx'), 'tailwind-merge': require('tailwind-merge') }), '@/components/ui/button': {}, '@/components/ui/tooltip': {},
    'lucide-react': {}, './components': {}, './hooks': {}, './utils': {},
    '@/utils/html-normalizer': {},
    lowlight: await import('lowlight'),
    './extensions': Object.fromEntries(['MentionExtension', 'IssueMentionExtension', 'AIImproveExtension', 'ResizableImageExtension', 'ResizableVideoExtension', 'ImageCSSExtension'].map(name => [name, Extension.create({ name })])),
  };
  for (const name of ['starter-kit', 'extension-link', 'extension-underline', 'extension-strike', 'extension-placeholder', 'extension-text-style', 'extension-color', 'extension-code-block-lowlight']) {
    dependencies[`@tiptap/${name}`] = require(`@tiptap/${name}`);
  }
  const { RichEditor } = load('src/components/RichEditor/RichEditor.tsx', dependencies);
  assert.throws(() => renderToStaticMarkup(React.createElement(RichEditor)), error => error === stop);
  const schema = getSchema(options.extensions);
  const markdown = [1, 2, 3, 4, 5, 6].map(level => `${'#'.repeat(level)} Detail ${level}`).join('\n\n') + '\n\n**Bold** and *italic* with `code`\nNext line\n\n- Bullet\n\n1. Ordered\n\n> Quote\n\n[Link](https://example.com)\n\n```js\nconst value = 1;\n```';
  const input = commentHtml(markdown);
  for (const html of [input, commentHtml('', input)]) {
    const doc = new JSDOM(html).window.document;
    const parsed = DOMParser.fromSchema(schema).parse(doc.body);
    const output = doc.createElement('div');
    output.append(DOMSerializer.fromSchema(schema).serializeFragment(parsed.content, { document: doc }));
    for (const level of [1, 2, 3, 4, 5, 6]) {
      assert.equal(output.querySelector(`h${level}`)?.textContent, `Detail ${level}`);
    }
    for (const [selector, text] of [['strong', 'Bold'], ['em', 'italic'], ['p code', 'code'], ['ul li', 'Bullet'], ['ol li', 'Ordered'], ['blockquote', 'Quote'], ['pre code', 'const value = 1;']]) {
      assert.equal(output.querySelector(selector)?.textContent.trim(), text);
    }
    assert.equal(output.querySelectorAll('br').length, 1);
    assert.equal(output.querySelector('a')?.getAttribute('href'), 'https://example.com');
    assert.ok(DOMParser.fromSchema(schema).parse(output).eq(parsed));
  }
});

test('agent handoff Markdown renders headings, lists, links, code and paragraphs', () => {
  const doc = documentFor('## Handoff received\n\n**Completed**\n- Read the brief\n- Verified `MKT-1`\n\n### Next steps\n1. [Review source](https://example.com/repo)\n2. Run checks\n\n```sh\ncollab issues get MKT-1\n```');
  assert.equal(doc.querySelector('h2').textContent, 'Handoff received');
  assert.equal(doc.querySelector('h3').textContent, 'Next steps');
  assert.equal(doc.querySelector('strong').textContent, 'Completed');
  assert.equal(doc.querySelectorAll('ul li').length, 2);
  assert.equal(doc.querySelectorAll('ol li').length, 2);
  assert.equal(doc.querySelector('li code').textContent, 'MKT-1');
  assert.equal(doc.querySelector('pre code').textContent.trim(), 'collab issues get MKT-1');
  assert.equal(doc.querySelector('a').href, 'https://example.com/repo');
});

test('plain text keeps line breaks; rich-editor HTML and mention attributes survive', () => {
  assert.equal(documentFor('First line\nSecond line').querySelectorAll('br').length, 1);
  const rich = '<p><strong>Existing</strong> <span data-type="mention" data-id="alice">@Alice</span></p>';
  for (const doc of [documentFor(rich), documentFor('fallback', rich)]) {
    assert.equal(doc.querySelector('strong').textContent, 'Existing');
    assert.equal(doc.querySelector('[data-type="mention"]').getAttribute('data-id'), 'alice');
  }
});

test('Markdown and explicit HTML cannot introduce executable markup', () => {
  const unsafe = '<img src=x onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">unsafe</a>';
  for (const doc of [documentFor(unsafe), documentFor('', unsafe), documentFor('[unsafe](javascript:alert%281%29)')]) {
    assert.equal(doc.querySelectorAll('script,[onerror],[href^="javascript:"]').length, 0);
  }
});

test('issue comment display and edit form both receive formatted content, including replies', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const noOp = () => null;
  const markdown = '## Handoff\n\n- Ready for review';
  const comment = { id: 'one', content: markdown, html: null, author: { name: 'Agent' }, createdAt: new Date(), replies: [] };
  for (const editing of [false, true]) {
    let stateCall = 0;
    const { CommentItem } = load('src/components/issue/sections/comments/components/CommentItem.tsx', {
      react: { ...React, useState: value => [++stateCall === 3 ? editing : value, noOp] },
      'react/jsx-runtime': require('react/jsx-runtime'),
      'date-fns': require('date-fns'),
      '@/lib/comment-html': { commentHtml },
      '@/components/ui/custom-avatar': { CustomAvatar: noOp },
      '@/components/RichEditor': {
        RichTextRenderer: ({ content, className }) => React.createElement('div', { 'data-display': true, className, dangerouslySetInnerHTML: { __html: content } }),
        RichEditor: ({ value }) => React.createElement('textarea', { 'data-editor': true, defaultValue: value }),
      },
      '@/components/ui/button': { Button: ({ children }) => React.createElement('button', null, children) },
      '@/components/modals/ConfirmationModal': { ConfirmationModal: noOp },
      '@/hooks/use-toast': { useToast: () => ({ toast: noOp }) },
      '@/hooks/queries/useIssueComment': Object.fromEntries(['useToggleIssueCommentLike', 'useUpdateIssueComment', 'useDeleteIssueComment'].map(name => [name, () => ({})])),
      './CommentActions': { CommentActions: noOp },
      './CommentReplyForm': { CommentReplyForm: noOp },
    });
    const html = renderToStaticMarkup(React.createElement(CommentItem, { comment: { ...comment, replies: editing ? [] : [{ ...comment, id: 'reply' }] }, issueId: 'issue' }));
    const doc = new JSDOM(html).window.document;
    if (editing) {
      const editor = new JSDOM(doc.querySelector('textarea').textContent).window.document;
      assert.equal(editor.querySelector('h2')?.textContent, 'Handoff');
    } else {
      assert.equal(doc.querySelectorAll('[data-display] h2').length, 2);
      for (const display of doc.querySelectorAll('[data-display]')) {
        assert.ok(display.classList.contains('prose-base'));
        assert.ok(display.parentElement.classList.contains('break-words'));
        assert.ok(display.parentElement.classList.contains('overflow-x-auto'));
      }
    }
  }
});

test('board comments remain literal and preserve edit controls and drafts', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  const previous = { window: global.window, document: global.document, flag: global.IS_REACT_ACT_ENVIRONMENT };
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { act, createElement: h } = React;
  const root = createRoot(document.getElementById('root'));
  const fields = { title: 'Issue', description: '', status: 'backlog', priority: 'normal', owner: '', dueDate: '', followUpDate: '', nextAction: '' };
  const body = '**Bold**\n![Image](https://example.com/image)\n<script>alert(1)</script>\n' + 'long'.repeat(300);
  const view = text => ({ kind: 'ready', fields, rights: { canEdit: true, canComment: true }, snapshot: { fingerprint: 'a', issue: { title: 'Issue', state: 'open', body: '' }, comments: [
    { id: 1, user: { login: 'writer' }, body: text, fingerprint: text, canEdit: true },
    { id: 2, user: { login: 'other' }, body: 'Other comment', fingerprint: 'two', canEdit: false },
  ] } });
  let next = view(body);
  const native = tag => ({ children, ...props }) => h(tag, props, children);
  const { ForgeIssueEditor } = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/board/ForgeIssueEditor.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/components/ui/button': { Button: native('button') }, '@/components/ui/input': { Input: native('input') }, '@/components/ui/textarea': { Textarea: native('textarea') },
    '@/lib/forge/tasks': { taskStatuses: ['backlog'], taskPriorities: ['normal'] },
    './actions': { getIssue: async () => next }, './ForgeExecution': { ForgeExecution: () => null },
  });
  const button = text => [...document.querySelectorAll('button')].find(element => element.textContent === text);
  try {
    await act(async () => root.render(h(ForgeIssueEditor, { number: 1, workspaceSlug: 'ws', projectSlug: 'project', onSaved() {}, onDenied() {} })));
    const articles = document.querySelectorAll('article');
    const display = articles[0].querySelectorAll('p')[1];
    assert.equal(display.textContent, body);
    assert.equal(display.querySelectorAll('strong,img,script,a').length, 0);
    for (const name of ['text-base', 'leading-7', 'whitespace-pre-wrap', 'break-words', 'overflow-x-auto']) assert.ok(display.classList.contains(name));
    assert.equal(articles[0].querySelectorAll('button').length, 1);
    assert.equal(articles[1].querySelectorAll('button').length, 0);
    await act(async () => button('Edit shared-account comment').click());
    assert.equal(document.querySelector('section[aria-label="Issue comments"] textarea').value, body);
    next = view('Updated **literal**');
    await act(async () => button('Reload source, keep draft').click());
    assert.equal(document.querySelector('article p:nth-child(2)').textContent, 'Updated **literal**');
    assert.equal(document.querySelector('section[aria-label="Issue comments"] textarea').value, body);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.flag;
  }
});
