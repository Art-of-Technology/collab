const { assert, test, load } = require('./helpers.cjs');


test('feature pages preserve Next.js missing-feature and wrong-project navigation', async () => {
  const session = { user: { id: 'alice', email: 'alice@example.test' } };
  let feature;
  let fetchError;
  const dependencies = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': require('next/navigation'),
    'next/link': { default: 'a' },
    'lucide-react': { ChevronLeft: 'span' },
    'next-auth': { getServerSession: async () => session },
    '@/lib/auth': { getAuthSession: async () => session, authConfig: {} },
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async () => 'workspace' },
    '@/lib/prisma': { prisma: {
      workspace: { findFirst: async () => ({ id: 'workspace' }) },
      project: { findFirst: async () => ({ id: 'project', name: 'Project' }) },
      user: { findUnique: async () => session.user },
    } },
    '@/components/ui/button': { Button: 'button' },
    '@/components/features/FeatureRequestDetail': { default: 'article' },
    '@/components/features/FeatureRequestComments': { default: 'section' },
    '@/actions/feature': { getFeatureRequestById: async (id, workspaceId) => {
      assert.equal(id, 'feature');
      assert.equal(workspaceId, 'workspace');
      if (fetchError) throw fetchError;
      return feature;
    } },
  };
  const props = { params: Promise.resolve({ workspaceId: 'workspace', projectSlug: 'project', id: 'feature' }) };
  for (const route of ['features/[id]', 'projects/[projectSlug]/features/[id]']) {
    const page = load(`src/app/(main)/[workspaceId]/${route}/page.tsx`, dependencies, {
      console: { error() {} },
    }).default;
    feature = null;
    await assert.rejects(page(props), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    if (route.startsWith('projects/')) {
      feature = { projectId: 'another-project' };
      await assert.rejects(page(props), {
        digest: 'NEXT_REDIRECT;replace;/workspace/projects/project/features;307;',
      });
    }
    feature = { projectId: 'project', comments: [], userVote: null, isAdmin: false };
    assert.equal(require('react').isValidElement(await page(props)), true);
    fetchError = new Error('Feature storage unavailable');
    const fallback = await page(props);
    assert.equal(fallback.type, 'div');
    assert.equal(fallback.props.children, 'Something went wrong');
    fetchError = undefined;
  }
});

test('error page renders the resolved search message and fallback', async () => {
  const { default: ErrorPage } = load('src/app/error/page.tsx', {
    react: require('react'),
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    '@/components/ui/card': Object.fromEntries(
      ['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle'].map(name => [name, 'div'])
    ),
    '@/components/ui/button': { Button: ({ children }) => children },
    'lucide-react': { AlertTriangle: 'span', Home: 'span', ArrowLeft: 'span' },
  });
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const [searchParams, message] of [
    [{ message: 'Access denied' }, 'Access denied'],
    [{}, 'An unexpected error occurred'],
  ]) {
    const page = await ErrorPage({ searchParams: Promise.resolve(searchParams) });
    assert.ok(renderToStaticMarkup(page).includes(message));
  }
});

test('planning activity conversion and child relations preserve IDs, statuses and timestamps', () => {
  const { activityToMovement } = load('src/utils/teamSyncAnalyzer.ts');
  const base = { issueId: 'issue', action: 'STATUS_CHANGED', userId: 'alice', createdAt: '2026-09-23T10:00:00Z',
    oldValue: 'backlog', newValue: 'done', issue: { issueKey: 'P-1', title: 'Title', type: 'TASK', priority: 'high' } };
  const movement = activityToMovement(base);
  assert.equal(movement.movementType, 'completed');
  assert.equal(movement.timestamp.toISOString(), new Date(base.createdAt).toISOString());
  assert.equal(movement.issueKey, 'P-1');
  assert.equal(activityToMovement({ ...base, action: 'CREATED' }).movementType, 'created');
  assert.equal(activityToMovement({ ...base, action: 'ASSIGNED' }).movementType, 'assigned');
  const { organizeRelationsData } = load('src/components/issue/sections/relations/utils/relationHelpers.ts');
  const result = organizeRelationsData([{ relationType: 'child', relatedItem: { id: 'child' } }]);
  assert.equal(result.children[0].dbId, 'child');
});

test('issue modal state follows URL and navigation clears stale parent context', () => {
  let params = new URLSearchParams('selectedIssue=old&parentTitle=Parent&parentKey=P-1&keep=yes');
  let pushed;
  const { useIssueModalUrlState } = load('src/hooks/useIssueModalUrlState.ts', {
    react: { useMemo: fn => fn(), useCallback: fn => fn },
    'next/navigation': {
      useSearchParams: () => params, usePathname: () => '/workspace/issues',
      useRouter: () => ({ push: url => { pushed = url; } }),
    },
  }, { URLSearchParams });
  const state = useIssueModalUrlState();
  assert.equal(state.selectedIssueId, 'old');
  assert.equal(state.parentIssueInfo.key, 'P-1');
  state.setSelectedIssueId('new');
  const next = new URL(pushed, 'https://example.test');
  assert.equal(next.searchParams.get('selectedIssue'), 'new');
  assert.equal(next.searchParams.has('parentKey'), false);
  assert.equal(next.searchParams.get('keep'), 'yes');
  state.closeModal();
  assert.equal(new URL(pushed, 'https://example.test').searchParams.has('selectedIssue'), false);
  params = new URLSearchParams('selectedIssue=back');
  assert.equal(useIssueModalUrlState().selectedIssueId, 'back');
});

test('slash menu commands preserve paragraphs, formatting and inline atoms', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'Event', 'CustomEvent', 'NodeFilter', 'HTMLInputElement', 'KeyboardEvent', 'FocusEvent'];
  const original = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { Editor, Node: TiptapNode } = require('@tiptap/core');
  const StarterKit = require('@tiptap/starter-kit').default;
  const atom = TiptapNode.create({ name: 'testAtom', group: 'inline', inline: true, atom: true,
    parseHTML: () => [{ tag: 'span[data-test-atom]' }], renderHTML: () => ['span', { 'data-test-atom': '' }, 'Existing mention'] });
  const editor = new Editor({ extensions: [StarterKit, atom], content: '<p>Initial</p>' });
  editor.view.coordsAtPos = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
  const ui = ({ children }) => React.createElement('div', null, children);
  const dependencies = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@tiptap/react': { useEditor: () => editor, EditorContent: () => null },
    '@/lib/utils': { cn: () => '' }, 'next-auth/react': { useSession: () => ({}) },
    '@/utils/cloudinary': {}, '@/context/WorkspaceContext': { useWorkspace: () => ({}) },
    '@/hooks/queries/useUser': { useCurrentUser: () => ({}) },
    '@/lib/collaboration': { createCollaborationUser: () => ({}) },
    '@/components/ui/command': { Command: ui, CommandInput: ui, CommandList: ui,
      CommandItem: ({ children, onSelect }) => React.createElement('button', { onClick: onSelect }, children) },
  };
  for (const [file, exports] of Object.entries({
    button: ['Button'], tooltip: ['Tooltip', 'TooltipContent', 'TooltipProvider', 'TooltipTrigger'], separator: ['Separator'],
    popover: ['Popover', 'PopoverContent', 'PopoverTrigger'], input: ['Input'],
    'mention-suggestion': ['MentionSuggestion'], 'task-mention-suggestion': ['TaskMentionSuggestion'],
    'epic-mention-suggestion': ['EpicMentionSuggestion'], 'story-mention-suggestion': ['StoryMentionSuggestion'],
    'milestone-mention-suggestion': ['MilestoneMentionSuggestion'],
  })) dependencies[`@/components/ui/${file}`] = Object.fromEntries(exports.map(name => [name, ui]));
  for (const name of ['@tiptap/core', '@tiptap/starter-kit', 'lucide-react', ...['link', 'image', 'underline', 'placeholder', 'text-style', 'heading', 'color'].map(name => `@tiptap/extension-${name}`)]) {
    dependencies[name] = require(name);
  }
  const { MarkdownEditor } = load('src/components/ui/markdown-editor.tsx', dependencies, {
    document: dom.window.document, window: dom.window, console, setTimeout, clearTimeout,
  });
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(MarkdownEditor, { compact: true, content: editor.getHTML() })));
    const cases = [
      ['<p>Alpha</p><p>Beta </p>', 13],
      ['<p><strong>Alpha</strong></p><p><em>Beta</em> </p>', 13],
      ['<p>Alpha</p><blockquote><p><strong>Beta</strong> <span data-test-atom></span> </p></blockquote>', 16],
    ];
    for (const [html, position] of cases) {
      for (const [type, trigger] of [['user', '@'], ['task', '#'], ['epic', '~'], ['story', '^'], ['milestone', '!']]) {
        await React.act(async () => {
          editor.commands.setContent(html, false, { preserveWhitespace: 'full' });
          editor.commands.setTextSelection(position);
          editor.commands.insertContent('/');
        });
        const before = editor.getJSON();
        const button = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === `Mention ${type}`);
        assert.ok(button, `Menu opens for ${type}`);
        await React.act(async () => button.click());
        const expected = structuredClone(before);
        function replaceSlash(node) {
          if (node.text?.endsWith('/')) node.text = node.text.slice(0, -1) + trigger;
          node.content?.forEach(replaceSlash);
        }
        replaceSlash(expected);
        assert.deepEqual(editor.getJSON(), expected, `${type}: ${html}`);
      }
    }

    // Escape in the menu must not dismiss a parent Radix dialog or discard the draft.
    const Dialog = require('@radix-ui/react-dialog');
    let dialogOpen = true;
    const renderDialog = () => root.render(React.createElement(Dialog.Root, { open: dialogOpen, onOpenChange: open => { dialogOpen = open; renderDialog(); } },
      dialogOpen && React.createElement(Dialog.Content, { 'aria-describedby': undefined },
        React.createElement(Dialog.Title, null, 'Edit Feature Request'),
        React.createElement(MarkdownEditor, { compact: true, content: editor.getHTML() }))));
    await React.act(async () => renderDialog());
    await React.act(async () => {
      editor.commands.setContent('<p>Draft </p>', false, { preserveWhitespace: 'full' });
      editor.commands.setTextSelection(7);
      editor.commands.insertContent('/');
    });
    const menuItem = () => [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === 'Mention user');
    assert.ok(menuItem(), 'Menu opens inside dialog');
    await React.act(async () => {
      menuItem().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.equal(dialogOpen, true, 'Escape keeps the dialog open');
    assert.equal(menuItem(), undefined, 'Escape closes the menu');
    assert.equal(editor.getText(), 'Draft /');
    await React.act(async () => {
      dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.equal(dialogOpen, false, 'Escape without the menu still dismisses the dialog');
  } finally {
    await React.act(async () => root.unmount());
    editor.destroy();
    dom.window.close();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
