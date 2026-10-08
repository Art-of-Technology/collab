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
  findInput(Reference()).props.onChange({ target: { value: '  NoTeS  ' } });
  const notes = renderToStaticMarkup(Reference());
  assert.match(notes, /collab notes create/);
  assert.doesNotMatch(notes, /collab issues get/);
  findInput(Reference()).props.onChange({ target: { value: 'due-date' } });
  assert.match(renderToStaticMarkup(Reference()), /collab issues update/);
  findInput(Reference()).props.onChange({ target: { value: 'no-such-command' } });
  assert.match(renderToStaticMarkup(Reference()), /No commands match/);
  findInput(Reference()).props.onChange({ target: { value: 'relations delete' } });
  const deletion = renderToStaticMarkup(Reference());
  assert.match(deletion, /ID CHILD_ID --yes/);
  assert.match(deletion, /issue ID or key/);
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
  });
  const html = renderToStaticMarkup(Page());
  assert.match(html, /npm install --global .\/packages\/cli/);
  assert.match(html, /Node.js 22/);
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
  const { WorkspaceLoadingWrapper: Wrapper } = load('src/components/layout/WorkspaceLoadingWrapper.tsx', {
    'react/jsx-runtime': jsx,
    '@/context/WorkspaceContext': { useWorkspace: () => ({ isLoading: true }) },
    'next-auth/react': { useSession: () => ({ status }) },
    'next/navigation': { usePathname: () => pathname },
    '@/components/ui/global-loading': { GlobalLoading: () => jsx.jsx('div', { children: 'Loading workspace' }) },
  });
  for (status of ['loading', 'authenticated', 'unauthenticated']) {
    for (pathname of ['/docs', '/docs/cli']) {
      assert.equal(renderToStaticMarkup(Wrapper({ children: 'Documentation' })), 'Documentation');
    }
  }
  status = 'loading';
  for (pathname of ['/docs-team/dashboard', '/workspace/dashboard']) {
    assert.match(renderToStaticMarkup(Wrapper({ children: 'Private page' })), /Loading workspace/);
  }
});
