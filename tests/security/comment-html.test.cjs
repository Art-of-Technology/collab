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
        RichTextRenderer: ({ content }) => React.createElement('div', { 'data-display': true, dangerouslySetInnerHTML: { __html: content } }),
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
    }
  }
});
