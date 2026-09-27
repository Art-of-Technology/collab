const { assert, test, load, matches, workspaces } = require('./helpers.cjs');

function fixture(subject = { id: 'alice', email: 'bob@example.test' }, beforeProject = () => {}) {
  const users = ['alice', 'bob'].map(id => ({ id, email: `${id}@example.test`, role: 'DEVELOPER', createdAt: new Date(), updatedAt: new Date() }));
  const spaces = structuredClone(workspaces).map((row, index) => ({ ...row, slug: row.id, id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    members: row.members.map(member => ({ ...member, user: users.find(user => user.id === member.userId) })),
  }));
  const projects = spaces.map(workspace => ({ id: `p-${workspace.slug}`, slug: 'project', name: `Project ${workspace.slug}`, color: '#123456', workspaceId: workspace.id, workspace }));
  const reads = [];
  const select = (row, spec) => !row ? null : spec.select ? Object.fromEntries(Object.keys(spec.select).map(key => [key, row[key]])) : structuredClone(row);
  const db = {
    user: { findUnique: async spec => select(users.find(row => matches(row, spec.where)), spec) },
    workspace: {
      findFirst: async spec => { reads.push(['workspace', spec]); return select(spaces.find(row => matches(row, spec.where)), spec); },
      findUnique: async spec => { reads.push(['resolve', spec]); return select(spaces.find(row => matches(row, spec.where)), spec); },
    },
    project: { findFirst: async spec => { beforeProject(spaces); reads.push(['project', spec]); return select(projects.find(row => matches(row, spec.where)), spec); } },
  };
  const jsx = (type, props) => ({ type, props });
  const deps = { '@/lib/prisma': { prisma: db }, '@/lib/auth-options': {},
    '@/lib/auth': { getAuthSession: async () => subject && { user: subject }, authConfig: {} },
    'next-auth': { getServerSession: async () => subject && { user: subject } },
    'next/navigation': { redirect: location => { throw Object.assign(new Error(`redirect:${location}`), { location }); } },
    react: { default: {}, Suspense: 'Suspense' }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/link': { default: 'Link' }, 'lucide-react': { ChevronLeft: 'ChevronLeft', FileText: 'FileText', Plus: 'Plus' },
    '@/components/ui/skeleton': { Skeleton: 'Skeleton' }, '@/components/ui/button': { Button: 'Button' },
  };
  for (const name of ['providers/SidebarProvider', 'layout/LayoutWithSidebar', 'layout/PageHeader', 'notes/ProjectNotesList']) deps[`@/components/${name}`] = { default: name.split('/').at(-1) };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console });
  deps['@/lib/url-utils'] = load('src/lib/url-utils.ts');
  deps['@/lib/slug-resolvers'] = load('src/lib/slug-resolvers.ts', deps, { console });
  const layout = load('src/app/(main)/[workspaceId]/layout.tsx', deps).default;
  const notes = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/notes/page.tsx', deps);
  return { spaces, users, projects, reads,
    layout: workspaceId => layout({ children: 'protected-child', params: Promise.resolve({ workspaceId }) }),
    notes: (workspaceId, projectSlug = 'project') => notes.default({ params: Promise.resolve({ workspaceId, projectSlug }) }),
    metadata: () => notes.generateMetadata({ params: Promise.resolve({ workspaceId: 'joined', projectSlug: 'project' }) }),
  };
}
const redirectTo = location => error => error.location === location;
function find(tree, type) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === type) return tree;
  return Object.values(tree).flat().map(value => find(value, type)).find(Boolean) || null;
}

test('both pages reject missing/email-only/deleted subjects before workspace IO', async () => {
  for (const subject of [null, { email: 'alice@example.test' }, { id: 'deleted', email: 'alice@example.test' }]) {
    const f = fixture(subject);
    await assert.rejects(f.layout('own'), redirectTo('/login'));
    await assert.rejects(f.notes('joined'), redirectTo('/login'));
    assert.equal(f.reads.length, 0);
  }
});

test('layout preserves owner/active-member slug and ID paths but denies foreign/revoked', async () => {
  const f = fixture();
  for (const space of f.spaces) for (const selector of [space.slug, space.id]) {
    if (['own', 'joined'].includes(space.slug)) {
      const tree = await f.layout(selector); const content = find(tree, 'LayoutWithSidebar');
      assert.equal(content.props.pathname, `/${selector}`); assert.equal(content.props.children, 'protected-child');
    } else await assert.rejects(f.layout(selector), redirectTo('/welcome'));
  }
  f.users[0].role = 'SYSTEM_ADMIN';
  await assert.rejects(f.layout('foreign'), redirectTo('/welcome'));
  await assert.rejects(f.layout('missing'), redirectTo('/welcome'));
});

test('Notes landing renders current subject and own/active project on slug and real ID paths', async () => {
  const f = fixture();
  for (const space of f.spaces.filter(row => ['own', 'joined'].includes(row.slug))) for (const selector of [space.slug, space.id]) {
    const tree = await f.notes(selector); const list = find(tree, 'ProjectNotesList');
    assert.equal(list.props.currentUserId, 'alice'); assert.equal(list.props.projectId, `p-${space.slug}`);
    assert.equal(list.props.workspaceSlug, space.slug);
    const header = find(tree, 'PageHeader'); assert.equal(header.props.title, 'Project Context');
    assert.equal(header.props.subtitle, `Documentation and context for Project ${space.slug}`);
    assert.ok(JSON.stringify(tree).includes(`/${selector}/projects/project/notes/memory`));
  }
  assert.equal((await f.metadata()).title, 'Context - project');
});

test('Notes landing rejects inactive/foreign membership before project payload, including role-only admin', async () => {
  const f = fixture({ id: 'alice', email: 'alice@example.test' });
  f.users[0].role = 'SYSTEM_ADMIN';
  for (const slug of ['revoked', 'foreign', 'missing']) await assert.rejects(f.notes(slug), redirectTo('/'));
  assert.equal(f.reads.filter(([kind]) => kind === 'project').length, 0);
});

test('Notes project lookup preserves missing/mismatched project redirects', async () => {
  const f = fixture({ id: 'alice', email: 'alice@example.test' });
  await assert.rejects(f.notes('joined', 'missing'), redirectTo('/joined/projects'));
  f.projects.find(row => row.id === 'p-joined').slug = 'changed';
  await assert.rejects(f.notes('joined'), redirectTo('/joined/projects'));
});

test('Notes payload rechecks membership lost after workspace preflight', async () => {
  const f = fixture({ id: 'alice', email: 'alice@example.test' }, spaces => { spaces.find(row => row.slug === 'joined').members[0].status = false; });
  await assert.rejects(f.notes('joined'), redirectTo('/joined/projects'));
});

for (const page of ['features', 'changelog']) {
  test(`${page} page uses mapped gateway identity and preserves redirects, props and legacy mode`, async () => {
    const before = { mode: process.env.COLLAB_AUTH_MODE, issuer: process.env.COLLAB_GATEWAY_ISSUER };
    const issuer = 'https://identity.example.test/realms/company';
    const encode = value => Buffer.from(value).toString('base64url');
    let headers = new Headers({ 'x-collab-issuer': encode(issuer), 'x-collab-subject': encode('subject'),
      'x-collab-email': encode('alex@weezboo.com'), 'x-collab-email-verified': 'true' });
    let mapped = true, legacy = 0, workspaceReads = 0, projectExists = true, repositoryExists = true;
    const user = { id: 'mapped', email: 'alex@weezboo.com', accounts: [{ id: 'mapping' }] };
    const prisma = {
      account: { findUnique: async () => mapped ? { user } : null },
      workspace: { findFirst: async ({ where }) => {
        workspaceReads++;
        const expectedEmail = process.env.COLLAB_AUTH_MODE === 'gateway' ? user.email : 'legacy@weezboo.com';
        return where.id === 'workspace' && where.members.some.user.email === expectedEmail ? { id: 'workspace' } : null;
      } },
      project: { findFirst: async () => projectExists ? { id: 'project', name: 'Project', slug: 'project',
        repository: repositoryExists ? { id: 'repository' } : null } : null },
      user: { findUnique: async ({ where }) => ({ id: where.email === user.email ? 'mapped' : 'legacy' }) },
    };
    const nextAuth = { getServerSession: async () => { legacy++; return { user: { id: 'legacy', email: 'legacy@weezboo.com' } }; } };
    const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process, Buffer, TextDecoder, URL });
    const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
      'next-auth': nextAuth, 'next/headers': { headers: async () => headers }, '@/lib/prisma': { prisma } }, { process });
    const jsx = (type, props) => ({ type, props });
    const deps = { '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth': { authConfig: {} },
      '@/lib/prisma': { prisma }, '@/lib/slug-resolvers': { resolveWorkspaceSlug: async value => value === 'missing' ? null : 'workspace' },
      'next/navigation': { redirect: location => { throw Object.assign(new Error('redirect'), { location }); } },
      'react/jsx-runtime': { jsx, jsxs: jsx }, react: { Suspense: 'Suspense' },
      'next/link': { default: 'Link' }, 'lucide-react': { ChevronLeft: 'ChevronLeft' },
      '@/components/features/FeatureRequestsList': { default: 'FeatureRequestsList' },
      '@/components/features/CreateFeatureRequestButton': { default: 'CreateFeatureRequestButton' },
      '@/components/ui/skeleton': { Skeleton: 'Skeleton' }, '@/components/ui/button': { Button: 'Button' },
      '@/components/layout/PageHeader': { default: 'PageHeader' },
      './ChangelogPageClient': { ChangelogPageClient: 'ChangelogPageClient' },
    };
    const Page = load(`src/app/(main)/[workspaceId]/projects/[projectSlug]/${page}/page.tsx`, deps).default;
    const render = (workspaceId = 'workspace-slug') => Page({ params: Promise.resolve({ workspaceId, projectSlug: 'project' }) });
    try {
      process.env.COLLAB_AUTH_MODE = 'gateway'; process.env.COLLAB_GATEWAY_ISSUER = issuer;
      const tree = await render();
      if (page === 'features') {
        assert.equal(find(tree, 'FeatureRequestsList').props.currentUserId, 'mapped');
        assert.equal(find(tree, 'FeatureRequestsList').props.projectId, 'project');
        assert.equal(find(tree, 'PageHeader').props.title, 'Feature Requests');
      } else {
        assert.equal(tree.props.repositoryId, 'repository'); assert.equal(tree.props.projectName, 'Project');
        assert.equal(tree.props.workspaceId, 'workspace'); assert.equal(tree.props.projectSlug, 'project');
      }
      assert.equal(legacy, 0);
      await assert.rejects(render('missing'), redirectTo('/'));
      projectExists = false; await assert.rejects(render(), redirectTo('/workspace-slug/projects')); projectExists = true;
      if (page === 'changelog') {
        repositoryExists = false; await assert.rejects(render(), redirectTo('/workspace-slug/projects/project/settings')); repositoryExists = true;
      }
      mapped = false; const reads = workspaceReads;
      await assert.rejects(render(), redirectTo('/login')); assert.equal(workspaceReads, reads); mapped = true;
      headers = new Headers({ cookie: 'legacy=present' });
      await assert.rejects(render(), redirectTo('/login')); assert.equal(workspaceReads, reads); assert.equal(legacy, 0);
      process.env.COLLAB_AUTH_MODE = 'nextauth';
      const legacyTree = await render();
      if (page === 'features') assert.equal(find(legacyTree, 'FeatureRequestsList').props.currentUserId, 'legacy');
      else assert.equal(legacyTree.props.repositoryId, 'repository');
      assert.equal(legacy, 1);
    } finally {
      for (const [name, value] of [['COLLAB_AUTH_MODE', before.mode], ['COLLAB_GATEWAY_ISSUER', before.issuer]])
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
}


test('developer dashboard passes mapped identity to data readers and keeps legacy redirects and props', async () => {
  const prior = { mode: process.env.COLLAB_AUTH_MODE, issuer: process.env.COLLAB_GATEWAY_ISSUER };
  const issuer = 'https://identity.example.test/realms/company';
  const encode = value => Buffer.from(value).toString('base64url');
  let headers = new Headers({ 'x-collab-issuer': encode(issuer), 'x-collab-subject': encode('subject'),
    'x-collab-email': encode('alex@weezboo.com'), 'x-collab-email-verified': 'true' });
  let mapped = true, legacy = 0;
  const calls = [];
  const user = { id: 'mapped', email: 'alex@weezboo.com', accounts: [{ id: 'mapping' }] };
  const nextAuth = { getServerSession: async () => { legacy++; return { user: { id: 'legacy' } }; } };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process, Buffer, TextDecoder, URL });
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
    'next-auth': nextAuth, 'next/headers': { headers: async () => headers },
    '@/lib/prisma': { prisma: { account: { findUnique: async () => mapped ? { user } : null } } } }, { process });
  const jsx = (type, props) => ({ type, props });
  const stats = { totalApps: 5, draftApps: 1, inReviewApps: 2, publishedApps: 2, totalInstallations: 9 };
  const { default: Page } = load('src/app/dev/page.tsx', {
    '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: {} },
    'next/navigation': { redirect: location => { throw Object.assign(new Error('redirect'), { location }); } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': { Package: 'Package', FileText: 'FileText', CheckCircle: 'CheckCircle', Download: 'Download' },
    './dashboard/QuickActions': { default: 'QuickActions' }, './dashboard/SummaryCards': { default: 'SummaryCards' },
    './dashboard/RecentActivityFeed': { default: 'RecentActivityFeed' },
    './dashboard/data': {
      getDashboardStats: async id => { calls.push(['stats', id]); return stats; },
      getRecentActivities: async (id, limit) => { calls.push(['activity', id, limit]); return ['activity']; },
    },
  });
  try {
    process.env.COLLAB_AUTH_MODE = 'gateway'; process.env.COLLAB_GATEWAY_ISSUER = issuer;
    const tree = await Page();
    assert.deepEqual(calls, [['stats', 'mapped'], ['activity', 'mapped', 10]]);
    assert.equal(find(tree, 'SummaryCards').props.cards.length, 5);
    assert.equal(find(tree, 'SummaryCards').props.cards[0].value, 5);
    assert.equal(find(tree, 'RecentActivityFeed').props.activities[0], 'activity');
    assert.equal(legacy, 0);
    mapped = false; await assert.rejects(Page(), redirectTo('/login')); mapped = true;
    headers = new Headers({ cookie: 'legacy=present' }); await assert.rejects(Page(), redirectTo('/login'));
    process.env.COLLAB_AUTH_MODE = 'invalid'; await assert.rejects(Page(), redirectTo('/login'));
    assert.equal(calls.length, 2); assert.equal(legacy, 0);
    for (const mode of ['nextauth', undefined]) {
      if (mode) process.env.COLLAB_AUTH_MODE = mode; else delete process.env.COLLAB_AUTH_MODE;
      await Page(); assert.equal(calls.at(-1)[1], 'legacy');
    }
    assert.equal(legacy, 2);
  } finally {
    for (const [name, value] of [['COLLAB_AUTH_MODE', prior.mode], ['COLLAB_GATEWAY_ISSUER', prior.issuer]])
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
