const { assert, test, load } = require('../security/helpers.cjs');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { renderToStaticMarkup } = require('react-dom/server');
const jsx = require('react/jsx-runtime');

async function reference() {
  let search = '';
  const registry = await import('../../packages/cli/src/commands.mjs');
  const { CommandReference } = load('src/app/docs/command-reference.tsx', {
    react: { useState: () => [search, value => { search = value; }] },
    'react/jsx-runtime': jsx,
    'lucide-react': require('lucide-react'),
    '@/components/ui/input': { Input: 'input' },
    '../../../packages/cli/src/commands.mjs': registry,
  });
  return CommandReference;
}

function findInput(element) {
  if (!element || typeof element !== 'object') return;
  if (element.type === 'input') return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const match = findInput(child);
    if (match) return match;
  }
}

test('command reference renders the executable CLI inventory and filters through its input', async () => {
  const Reference = await reference();
  const schema = JSON.parse(execFileSync(process.execPath, [resolve('packages/cli/bin/collab.mjs'), 'schema'], { encoding: 'utf8' }));
  const html = renderToStaticMarkup(Reference());
  for (const [name, spec] of Object.entries(schema.commands)) {
    assert.ok(html.includes(`collab ${name}</code>`), name);
    for (const option of spec.options) assert.ok(html.includes(`--${option}</code>`), option);
  }
  assert.equal((html.match(/<details /g) || []).length, Object.keys(schema.commands).length);
  for (const value of ['  NoTeS  ', 'collab notes']) {
    findInput(Reference()).props.onChange({ target: { value } });
    const notes = renderToStaticMarkup(Reference());
    assert.match(notes, /collab notes create/);
    assert.doesNotMatch(notes, /collab issues get/);
  }
  for (const value of ['due-date', '--due-date']) {
    findInput(Reference()).props.onChange({ target: { value } });
    assert.match(renderToStaticMarkup(Reference()), /collab issues update/);
  }
  for (const [name, spec] of Object.entries(schema.commands)) {
    for (const value of [`collab ${name}`, ...spec.options.flatMap(option => [option, `--${option}`])]) {
      findInput(Reference()).props.onChange({ target: { value } });
      assert.ok(renderToStaticMarkup(Reference()).includes(`collab ${name}</code>`), `${name}: ${value}`);
    }
  }
  for (const [flag, names] of [
    ['yes', ['issues delete', 'relations delete', 'worklogs delete']],
    ['all', ['issues list', 'worklogs list', 'notes list']],
  ]) {
    for (const value of [flag, `--${flag}`]) {
      findInput(Reference()).props.onChange({ target: { value } });
      const matches = renderToStaticMarkup(Reference());
      assert.equal((matches.match(/<details /g) || []).length, names.length, value);
      for (const name of names) assert.ok(matches.includes(`collab ${name}</code>`), `${name}: ${value}`);
    }
  }
  findInput(Reference()).props.onChange({ target: { value: 'no-such-command' } });
  assert.match(renderToStaticMarkup(Reference()), /No commands match/);
  findInput(Reference()).props.onChange({ target: { value: 'relations delete' } });
  const deletion = renderToStaticMarkup(Reference());
  assert.match(deletion, /ID CHILD_ID --yes/);
  assert.match(deletion, /issue ID or key/);
});

test('command reference renders retrieval constraints and dispatched versus conditional defaults', async () => {
  const Reference = await reference();
  for (const [name, fields] of [
    ['search', {
      query: ['required', 'minimum length: 1', 'maximum length: 500', 'trimmed'],
      mode: ['values: exact, keyword, semantic, hybrid, fuzzy', 'CLI default: hybrid'],
      type: ['values: all, issue, note, activity', 'default: all (server default)'],
      status: ['minimum length: 1', 'maximum length: 128', 'trimmed'],
      'assignee-id': ['minimum length: 1', 'maximum length: 128', 'trimmed'],
      'project-id': ['minimum length: 1', 'maximum length: 128', 'trimmed'],
      after: ['format: date-time'], before: ['format: date-time'],
      limit: ['minimum: 1', 'maximum: 50', 'CLI default: 20'],
      offset: ['minimum: 0', 'maximum: 50000', 'CLI default: 0'],
      'max-tokens': ['minimum: 1024', 'maximum: 64000', 'CLI default: 8000'],
    }],
    ['context get', {
      'project-id': ['minimum length: 1', 'maximum length: 128', 'trimmed'],
      'include-pipeline': ['true with projectId unless includeKnowledge=true; false otherwise (CLI default)'],
      limit: ['minimum: 1', 'maximum: 50', 'default: 10 (server default; includePipeline=true only)'],
      offset: ['minimum: 0', 'maximum: 50000', 'default: 0 (server default; includePipeline=true only)'],
      since: ['format: date-time', '7 days before the server request time (server default; includePipeline=true only)'],
      'max-tokens': ['minimum: 2048', 'maximum: 64000', 'CLI default: 8000'],
    }],
  ]) {
    findInput(Reference()).props.onChange({ target: { value: `collab ${name}` } });
    const html = renderToStaticMarkup(Reference());
    for (const [flag, values] of Object.entries(fields)) {
      const renderedField = html.match(new RegExp(`<dt><code[^>]*>--${flag}</code></dt><dd[^>]*>([^<]*)</dd>`))?.[1];
      assert.ok(renderedField, `${name} --${flag}`);
      for (const value of values) assert.ok(renderedField.includes(value), `${name} --${flag}: ${value}`);
    }
    assert.match(html, name === 'search' ? /neither can be used with type=note/ : /includePipeline=false or includeKnowledge=true/);
  }
});

test('docs render installation, navigable sections, commands, and credential limitations', async () => {
  const { CodeBlock } = load('src/components/dev/docs/CodeBlock.tsx', {
    react: require('react'), 'react/jsx-runtime': jsx,
    '@/components/ui/button': { Button: 'button' },
  });
  const { default: Page } = load('src/app/docs/page.tsx', {
    'react/jsx-runtime': jsx,
    'next/link': require('next/link'), 'next/image': require('next/image'),
    'lucide-react': require('lucide-react'),
    '@/components/dev/docs/CodeBlock': { CodeBlock },
    './command-reference': { CommandReference: await reference() },
    '../../../packages/cli/package.json': { default: require('../../packages/cli/package.json') },
  });
  const html = renderToStaticMarkup(Page());
  assert.match(html, /npm install --global .\/packages\/cli/);
  assert.match(html, /Node.js 22/);
  const { version } = require('../../packages/cli/package.json');
  for (const platform of ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'windows-x64']) {
    const url = `https://github.com/Art-of-Technology/collab/releases/download/cli-v${version}/collab-${platform}.${platform === 'windows-x64' ? 'zip' : 'tar.gz'}`;
    assert.ok(html.includes(`href="${url}"`), platform);
    assert.ok(html.includes(`href="${url}.sha256"`), `${platform} checksum`);
  }
  assert.match(html, /curl -fsSL https:\/\/collab\.weez\.boo\/install\.sh/);
  assert.match(html, /irm https:\/\/collab\.weez\.boo\/install\.ps1/);
  assert.match(html, /No Node.js, npm, Bun, or terminal restart needed/);
  assert.match(html, /Logout removes local credentials only/);
  assert.match(html, /collab-cli/);
  assert.match(html, /href="\/dev\/docs"/);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'section IDs must be unique');
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(target), target);
});

test('docs stay readable while session or workspace loads without changing workspace loading', () => {
  let pathname = '/docs';
  let status = 'loading';
  let isLoading = true;
  const { WorkspaceLoadingWrapper: Wrapper } = load('src/components/layout/WorkspaceLoadingWrapper.tsx', {
    'react/jsx-runtime': jsx,
    '@/context/WorkspaceContext': { useWorkspace: () => ({ isLoading }) },
    'next-auth/react': { useSession: () => ({ status }) },
    'next/navigation': { usePathname: () => pathname },
    '@/components/ui/global-loading': { GlobalLoading: () => jsx.jsx('div', { children: 'Loading workspace' }) },
  });
  for (status of ['loading', 'authenticated', 'unauthenticated']) {
    for (isLoading of [true, false]) {
      pathname = '/docs';
      assert.equal(renderToStaticMarkup(Wrapper({ children: 'Documentation' })), 'Documentation');
      for (pathname of ['/docs/notes', '/docs/dashboard', '/docs/cli', '/docs-team/dashboard', '/workspace/dashboard']) {
        const html = renderToStaticMarkup(Wrapper({ children: 'Workspace page' }));
        if (status === 'loading' || (status === 'authenticated' && isLoading)) {
          assert.match(html, /Loading workspace/, `${pathname}: ${status}, loading=${isLoading}`);
        } else {
          assert.equal(html, 'Workspace page', `${pathname}: ${status}, loading=${isLoading}`);
        }
      }
    }
  }
});

test('workspace URL selection takes priority over saved workspace outside the exact docs page', () => {
  const docsWorkspace = { id: 'docs-workspace', slug: 'docs' };
  const savedWorkspace = { id: 'saved-workspace', slug: 'saved' };
  const teamWorkspace = { id: 'team-workspace', slug: 'docs-team' };
  let pathname = '/docs';
  let currentWorkspace = savedWorkspace;
  const stored = new Map([['currentWorkspaceId', savedWorkspace.id]]);
  const effects = [];
  const document = { cookie: '' };
  const { WorkspaceProvider } = load('src/context/WorkspaceContext.tsx', {
    react: {
      createContext: require('react').createContext,
      useState: () => [currentWorkspace, value => { currentWorkspace = value; }],
      useCallback: callback => callback,
      useEffect: callback => effects.push(callback),
    },
    'react/jsx-runtime': jsx,
    'next-auth/react': { useSession: () => ({ data: { user: { id: 'user' } }, status: 'authenticated' }) },
    'next/navigation': { usePathname: () => pathname, useRouter: () => ({}) },
    '@/hooks/queries/useWorkspace': { useWorkspaces: () => ({ data: [docsWorkspace, savedWorkspace, teamWorkspace], isLoading: false }) },
  }, {
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    document,
    window: { location: { protocol: 'https:' } },
  });
  for (const [route, expected] of [
    ['/docs', savedWorkspace],
    ['/docs/notes', docsWorkspace],
    ['/docs/dashboard', docsWorkspace],
    ['/docs/projects/project/notes', docsWorkspace],
    ['/docs-workspace/notes', docsWorkspace],
    ['/docs-team/dashboard', teamWorkspace],
    ['/saved/notes', savedWorkspace],
    ['/home', savedWorkspace],
  ]) {
    pathname = route;
    currentWorkspace = savedWorkspace;
    stored.set('currentWorkspaceId', savedWorkspace.id);
    effects.length = 0;
    WorkspaceProvider({ children: 'Workspace page' });
    for (const effect of effects.splice(0)) effect();
    const context = WorkspaceProvider({ children: 'Workspace page' }).props.value;
    assert.equal(context.currentWorkspace, expected, route);
    assert.equal(stored.get('currentWorkspaceId'), expected.id, route);
    assert.ok(document.cookie.startsWith(`currentWorkspaceId=${expected.id};`), route);
  }
});
