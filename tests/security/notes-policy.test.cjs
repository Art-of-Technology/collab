const { assert, test, resolve, load, matches, workspaces, matchesWorkspace, prisma, userHasWorkspaceAccess, enums, checkNoteAccess, note } = require('./helpers.cjs');

test('note scope, restriction, expiry and edit permission are enforced', async () => {
  const member = { role: 'MEMBER' };
  assert.equal((await checkNoteAccess('alice', note, null)).canAccess, false);
  assert.equal((await checkNoteAccess('bob', note, null)).canAccess, false);
  assert.equal((await checkNoteAccess('alice', note, member)).canAccess, true);
  assert.equal((await checkNoteAccess('alice', note, member)).canEdit, false);
  assert.equal((await checkNoteAccess('bob', note, member)).canEdit, true);
  const restricted = { ...note, isRestricted: true };
  assert.equal((await checkNoteAccess('alice', restricted, { role: 'ADMIN' })).canAccess, false);
  const shared = { ...restricted, sharedWith: [{ userId: 'alice', permission: 'EDIT' }] };
  assert.equal((await checkNoteAccess('alice', shared, member)).canEdit, true);
  assert.equal((await checkNoteAccess('alice', shared, null)).canAccess, false);
  assert.equal((await checkNoteAccess('alice', { ...shared, expiresAt: new Date(0) }, member)).canAccess, false);
  assert.equal((await checkNoteAccess('alice', { ...note, scope: 'PERSONAL' }, member)).canAccess, false);
  assert.equal((await checkNoteAccess('alice', { ...note, scope: 'PUBLIC', isEncrypted: false }, null)).canAccess, true);
});

test('denied note requests stop before database content, history or decryption', async () => {
  const denied = new Proxy({}, { get() { throw new Error('Content accessed before authorization'); } });
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/prisma': { prisma: denied }, '@prisma/client': enums,
    '@/lib/secrets/access': { canAccessNote: async () => ({ canAccess: false, canEdit: false, canDelete: false }) },
    'zod': require('zod'), '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/secrets/crypto': denied, '@/lib/versioning': denied, '@/lib/event-bus': denied,
  };
  for (const [file, methods] of [
    ['route.ts', ['GET', 'PATCH', 'DELETE']],
    ['versions/route.ts', ['GET']],
    ['versions/[version]/route.ts', ['GET', 'POST']],
    ['versions/compare/route.ts', ['GET']],
    ['pin/route.ts', ['POST']],
    ['comments/[commentId]/route.ts', ['GET', 'PATCH', 'DELETE']],
    ['share/route.ts', ['GET', 'POST', 'DELETE']],
    ['save-as-template/route.ts', ['POST']],
    ['secrets/audit-log/route.ts', ['GET']],
  ]) {
    const route = load(`src/app/api/notes/[id]/${file}`, dependencies);
    for (const method of methods) {
      const response = await route[method](new Request('https://example.test/notes?from=1&to=2'), {
        params: Promise.resolve({ id: 'note', version: '1' }),
      });
      assert.equal(response.status, 404, `${file} ${method}`);
    }
  }
});

test('note history sanitizes stored HTML before rendering while retaining normal text', () => {
  const version = {
    content: '<p>Keep this note</p><img src=x onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">link</a>',
    createdAt: new Date().toISOString(), author: { name: 'Alice' }, version: 1,
  };
  let stateIndex = 0;
  const dependencies = {
    'react': { useState: () => [[true, version, null, null][stateIndex++], () => {}] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tanstack/react-query': { useQuery: () => ({ data: undefined }) },
    'date-fns': { format: () => '', formatDistanceToNow: () => '' },
    'isomorphic-dompurify': { default: require('isomorphic-dompurify') },
    'lucide-react': {},
    '@/lib/utils': { cn: (...values) => values.join(' ') },
    '@/lib/html-sanitizer': load('src/lib/html-sanitizer.ts'),
  };
  for (const [path, names] of [
    ['ui/button', ['Button']], ['ui/scroll-area', ['ScrollArea']],
    ['ui/sheet', ['Sheet', 'SheetContent', 'SheetHeader', 'SheetTitle', 'SheetTrigger']],
    ['notes/VersionBadge', ['VersionBadge']], ['notes/VersionDiff', ['VersionDiff']],
    ['notes/RestoreVersionDialog', ['RestoreVersionDialog']], ['ui/user-avatar', ['UserAvatar']],
  ]) dependencies[`@/components/${path}`] = Object.fromEntries(names.map(name => [name, name]));
  const { VersionHistoryPanel } = load('src/components/notes/VersionHistoryPanel.tsx', dependencies);
  const html = [];
  function visit(element) {
    if (Array.isArray(element)) return element.forEach(visit);
    if (!element?.props) return;
    if (element.props.dangerouslySetInnerHTML) html.push(element.props.dangerouslySetInnerHTML.__html);
    visit(element.props.children);
  }
  visit(VersionHistoryPanel({ noteId: 'note' }));
  assert.equal(html.length, 1);
  assert.match(html[0], /<p>Keep this note<\/p>/);
  assert.doesNotMatch(html[0], /onerror|<script|javascript:/i);
});

test('note authorization resolves project workspace and requires active membership', async () => {
  for (const workspace of workspaces) {
    const db = {
      note: { findUnique: async () => ({ ...note, workspaceId: null, projectId: 'project', project: { workspaceId: workspace.id } }) },
      workspace: { findFirst: async ({ where, select }) => {
        if (!matchesWorkspace(workspace, where)) return null;
        return {
          ownerId: workspace.ownerId,
          members: workspace.members.filter(member => member.userId === select.members.where.userId &&
            (!select.members.where.status || member.status)).map(() => ({ role: 'MEMBER' })),
        };
      } },
    };
    const { canAccessNote } = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma: db }, '@prisma/client': enums, '@/lib/issue-finder': { userHasWorkspaceAccess } });
    assert.equal((await canAccessNote('alice', 'note')).canAccess, ['own', 'joined'].includes(workspace.id));
  }
});

test('protected notes cannot publish their content as workspace templates', async () => {
  for (const flags of [{ isEncrypted: true }, { isRestricted: true }]) {
    const { POST } = load('src/app/api/notes/[id]/save-as-template/route.ts', {
      'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
      'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
      '@/lib/auth-options': { authOptions: {} },
      '@/lib/secrets/access': { canAccessNote: async () => ({ canAccess: true }) },
      '@/lib/issue-finder': { userHasWorkspaceAccess },
      '@/lib/prisma': { prisma: { note: { findUnique: async () => ({ ...note, isEncrypted: false, isRestricted: false, ...flags }) } } },
      '@prisma/client': enums, 'zod': require('zod'),
    });
    const response = await POST(new Request('https://example.test/template', {
      method: 'POST', body: JSON.stringify({ name: 'Template' }),
    }), { params: Promise.resolve({ id: 'note' }) });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /Protected notes/);
  }
});

test('collection predicates match the single-note read policy across scope and membership', async () => {
  const { noteAccessWhere } = load('src/lib/secrets/access.ts', {
    '@/lib/prisma': { prisma }, '@prisma/client': enums, '@/lib/issue-finder': { userHasWorkspaceAccess },
  });
  for (const scope of Object.values(enums.NoteScope))
  for (const role of [null, 'MEMBER', 'ADMIN', 'OWNER'])
  for (const isRestricted of [false, true])
  for (const isEncrypted of [false, true])
  for (const authorId of ['alice', 'bob'])
  for (const shared of [false, true])
  for (const expired of [false, true])
  for (const projectFallback of [false, true]) {
    const workspace = { ownerId: role === 'OWNER' ? 'alice' : 'bob', members: [
      { userId: 'alice', status: !!role, role: role || 'ADMIN' },
    ] };
    const row = { ...note, scope, isRestricted, isEncrypted, authorId,
      workspaceId: projectFallback ? null : 'joined',
      projectId: projectFallback ? 'project' : null,
      workspace: projectFallback ? null : workspace,
      project: projectFallback ? { workspace } : null,
      sharedWith: shared ? [{ userId: 'alice', permission: 'EDIT' }] : [],
      expiresAt: expired ? new Date(0) : null,
    };
    const expected = (await checkNoteAccess('alice', row, role ? { role } : null)).canAccess;
    assert.equal(matches(row, noteAccessWhere('alice')), expected, JSON.stringify({ scope, role, isRestricted, isEncrypted, authorId, shared, expired, projectFallback }));
  }
  assert.equal(matches(note, noteAccessWhere('')), false);
});

test('all Notes collections constrain both result reads and search counts', async () => {
  for (const [file, query] of [
    ['route.ts', 'scope=WORKSPACE&workspace=foreign'],
    ['route.ts', 'sharedWithMe=true'],
    ['pinned/route.ts', 'workspaceId=foreign'],
    ['search/route.ts', 'workspaceId=foreign&q=secret'],
    ['shared-with-me/route.ts', 'workspace=foreign'],
  ]) {
    let reads = 0;
    const boundary = { id: { in: [] } };
    const check = ({ where }) => {
      reads++;
      assert.ok(where.AND.includes(boundary), `${file} omitted its access boundary`);
    };
    const { GET } = load(`src/app/api/notes/${file}`, {
      'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
      'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
      '@/lib/auth-options': { authOptions: {} },
      '@/lib/prisma': { prisma: { note: {
        findMany: async args => { check(args); return []; },
        count: async args => { check(args); return 0; },
      } } },
      '@/lib/secrets/access': { noteAccessWhere: () => boundary },
      '@/lib/secrets/crypto': {}, '@/lib/versioning': {}, '@/lib/event-bus': {},
      '@prisma/client': enums,
    }, { URL, console });
    const response = await GET(new Request(`https://example.test/notes?${query}`));
    assert.equal(response.status, 200, file);
    assert.equal(reads, file === 'search/route.ts' ? 2 : 1);
  }
});

test('template use requires workspace access and scopes custom template reads', async () => {
  let templateReads = 0;
  const { POST } = load('src/app/api/notes/templates/[id]/use/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => ({ name: 'Alice' }) },
      workspace: { findUnique: async () => ({ name: 'Workspace' }) },
      noteTemplate: { findFirst: async ({ where }) => {
        templateReads++;
        assert.equal(where.workspaceId, 'joined');
        return null;
      } },
    } },
    'zod': require('zod'), '@/lib/note-templates': { BUILT_IN_TEMPLATES: [] },
    '@/lib/template-placeholders': {},
  });
  for (const workspaceId of ['foreign', 'revoked', 'joined']) {
    const response = await POST(new Request('https://example.test/template', {
      method: 'POST', body: JSON.stringify({ workspaceId }),
    }), { params: Promise.resolve({ id: 'custom-template' }) });
    assert.equal(response.status, workspaceId === 'joined' ? 404 : 403);
  }
  assert.equal(templateReads, 1);
});

test('note destinations reject foreign/revoked workspaces and mismatched projects', async () => {
  const { canWriteNoteDestination } = load('src/lib/secrets/access.ts', {
    '@/lib/issue-finder': { userHasWorkspaceAccess }, '@prisma/client': enums,
    '@/lib/prisma': { prisma: { project: { findUnique: async ({ where }) =>
      workspaces.some(w => w.id === where.id) ? { workspaceId: where.id } : null } } },
  });
  for (const workspace of workspaces) {
    const allowed = ['own', 'joined'].includes(workspace.id);
    assert.equal(await canWriteNoteDestination('alice', workspace.id, null), allowed);
    assert.equal(await canWriteNoteDestination('alice', null, workspace.id), allowed);
    assert.equal(await canWriteNoteDestination('alice', workspace.id, workspace.id), allowed);
  }
  assert.equal(await canWriteNoteDestination('alice', 'joined', 'own'), false);
  assert.equal(await canWriteNoteDestination('alice', 'joined', 'missing'), false);
  assert.equal(await canWriteNoteDestination('alice', null, null), true);
  assert.equal(await canWriteNoteDestination('', null, null), false);
});

test('note creation and project reassignment reject inaccessible destinations before writes', async () => {
  let checked = 0;
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => ({ id: 'alice' }) },
      note: {
        findFirst: async () => ({ ...note, authorId: 'alice' }),
        findUnique: async () => ({ versioningEnabled: false }),
      },
    } },
    '@/lib/secrets/access': {
      canAccessNote: async () => ({ canEdit: true }),
      canWriteNoteDestination: async (_, workspace, project) => {
        assert.equal(project, 'foreign'); checked++; return false;
      },
    },
    '@/lib/secrets/crypto': { isSecretNoteType: () => false },
    '@/lib/versioning': {}, '@/lib/event-bus': {}, '@prisma/client': enums,
  };
  for (const [file, method] of [['route.ts', 'POST'], ['[id]/route.ts', 'PATCH']]) {
    const route = load(`src/app/api/notes/${file}`, dependencies);
    const response = await route[method](new Request('https://example.test/note', {
      method, body: JSON.stringify({ title: 'Title', content: 'Content', projectId: 'foreign' }),
    }), { params: Promise.resolve({ id: 'note' }) });
    assert.equal(response.status, 403, file);
  }
  assert.equal(checked, 2);
});
