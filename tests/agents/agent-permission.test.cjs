const { test } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { load, matches } = require('../security/helpers.cjs');

// Workspace `w` is the one under test. In `home` every person but the platform admin is at the Owner level, so a
// check made there always passes and the check of `w` behind it is the one that decides.
const ROLE_IN_W = { admin: 'ADMIN', keeper: 'Keeper', member: 'MEMBER', owner: 'OWNER', root: 'MEMBER' };
const ROWS = [
  { workspaceId: 'w', role: 'ADMIN', permission: 'MANAGE_AGENTS' },
  // A role that may edit the permission editor and nothing about agents.
  { workspaceId: 'w', role: 'Keeper', permission: 'MANAGE_WORKSPACE_PERMISSIONS' },
];
const PASS = ['admin', 'owner', 'primary', 'root'];
const REFUSED = ['keeper', 'member'];

function fixture() {
  const writes = [];
  const mutation = (name, result) => async () => {
    writes.push(name);
    return result;
  };
  const members = Object.entries(ROLE_IN_W).map(([userId, role]) => ({ userId, role, status: true }));
  const team = { id: 'w', slug: 'team', name: 'Team', ownerId: 'primary', members };
  const home = { id: 'home', slug: 'home', name: 'Home', ownerId: 'primary',
    members: members.filter(member => member.userId !== 'root').map(member => ({ ...member, role: 'OWNER' })) };
  const workspaces = [team, home];
  const project = { id: 'p', slug: 'p', name: 'P', workspaceId: team.id, workspace: team, agentMode: 'seats', isArchived: false, agentSeats: [] };
  const seatRow = { id: 's', workspaceId: team.id, projectId: project.id, project, userId: 'seat-account', name: 'Seat',
    retiredAt: null, role: 'developer', instructions: null, ownerId: null, owner: null, customRole: null, runs: [] };
  const lookups = rows => {
    const findFirst = async ({ where }) => rows.find(row => matches(row, where)) ?? null;
    return { findUnique: findFirst, findFirst, findMany: async ({ where }) => rows.filter(row => matches(row, where)) };
  };
  const models = {
    user: { findUnique: async ({ where, include }) => {
      const { workspaceId, status } = include.workspaceMemberships.where;
      const workspace = workspaces.find(row => row.id === workspaceId);
      return { id: where.id, role: where.id === 'root' ? 'SYSTEM_ADMIN' : 'DEVELOPER',
        workspaceMemberships: workspace?.members.filter(member => member.userId === where.id && member.status === status) ?? [],
        ownedWorkspaces: workspaces.filter(row => row.ownerId === where.id && matches(row, include.ownedWorkspaces.where)) };
    } },
    rolePermission: { findUnique: async ({ where: { workspaceId_role_permission: key } }) => ROWS.find(row => row.workspaceId === key.workspaceId && row.role === key.role && row.permission === key.permission) ?? null },
    workspace: lookups(workspaces),
    project: lookups([project]),
    agentSeat: lookups([seatRow]),
  };
  const prisma = new Proxy({}, { get: (_, model) => model === '$transaction' ? async run => run(prisma) : new Proxy({}, { get: (__, op) => async args => {
    if (/^(create|update|upsert|delete)/.test(op)) writes.push(`${String(model)}.${String(op)}`);
    const handler = models[model]?.[op];
    return handler ? handler(args) : op.startsWith('findMany') ? [] : null;
  } }) });

  let session = null;
  class HandoffError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }
  const globals = { URL, Date, process: { env: { NEXTAUTH_URL: 'https://collab.test' } }, console: { error() {}, log() {}, warn() {} } };
  const common = {
    zod: require('zod'),
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/request-session': { getServerSession: async () => session },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/session': { getCurrentUser: async () => session?.user ?? null },
    '@/lib/prisma': { prisma },
    // The real permission rule, on the stubbed database.
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }, globals),
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/agent-handoffs': { HandoffError },
    '@/lib/agent-seats': { HandoffError, SEAT_ROLES: ['developer'], MEMBER_ROLES: [], seatRoom: () => null,
      createSeat: mutation('createSeat', { seat: 's' }), retireSeat: mutation('retireSeat', { released: [] }), lockMemberSeatProject: async () => {} },
    '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent', createAgentToken: mutation('createAgentToken', { token: 't' }), revokeAgentToken: mutation('revokeAgentToken', true),
      setAgentWorkspaceAccess: mutation('setAgentWorkspaceAccess', true), listSeatOwnerChoices: async () => ({ seats: [], people: [], customRoles: [] }),
      listAgentTokens: async () => [{ id: 't', name: 'T', seat: null, workspaces: [], access: 'read', createdAt: new Date(), expiresAt: null, expired: false }] },
    '@/lib/agent-mode': { HandoffError, agentModeSchema: z.any(), agentModeState: async () => ({ mode: 'seats' }), setAgentMode: mutation('setAgentMode', {}) },
    '@/lib/agent-runners': { RUNNER_TOKEN_DAYS: 90, runnerSeats: async () => [], fetchedBy: async () => new Map(), runnerPeopleBelow: async () => new Set() },
    '@/lib/agent-runs': { inboxOf: async () => ({ items: [] }) },
    '@/lib/workspace-authority': {},
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async slug => slug },
    '@/lib/agent-repository': { holdProjectDefault: async () => {}, projectRepositoryState: async () => ({ repositories: [] }), repositoryAddress: url => ({ href: url }) },
    '@/lib/agent-custom-roles': { CUSTOM_ROLE_SELECT: {}, customRoleView: row => row },
    // The page, as the element tree it returns.
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: () => { throw new Error('NEXT_REDIRECT'); } },
    'next/link': {}, 'lucide-react': {}, '@/lib/mcp-oauth': { mcpEndpointUrl: () => '' }, '@/components/ui/button': {},
    '@/components/workspace/AgentConnectGuide': {}, '@/components/workspace/AgentTokensManager': { default: 'AgentTokensManager' },
  };
  const at = file => load(file, common, globals);
  const seats = at('src/app/api/workspaces/[workspaceId]/agent-seats/route.ts');
  const seat = at('src/app/api/workspaces/[workspaceId]/agent-seats/[seatId]/route.ts');
  const tokens = at('src/app/api/workspaces/[workspaceId]/agent-tokens/route.ts');
  const token = at('src/app/api/workspaces/[workspaceId]/agent-tokens/[tokenId]/route.ts');
  const page = at('src/app/(main)/workspaces/[workspaceId]/settings/agent-tokens/page.tsx');
  const mode = at('src/app/api/workspaces/[workspaceId]/projects/[projectSlug]/agent-mode/route.ts');
  const repository = at('src/app/api/projects/[projectId]/agent-repository/route.ts');
  const setup = at('src/lib/agent-seat-setup.ts');
  const agentsPage = at('src/lib/agents-page.ts');
  const customRoles = at('src/lib/agent-custom-roles.ts');
  const roleInstructions = at('src/lib/agent-role-instructions.ts');
  const seatInstructions = at('src/lib/agent-seat-instructions.ts');

  const body = json => ({ json: async () => json, headers: new Headers({ origin: 'https://collab.test' }), url: 'https://collab.test/api' });
  const params = value => ({ params: Promise.resolve(value) });
  const status = expected => reply => reply.status === expected ? 'passed' : reply.status === 403 ? 'refused' : `status ${reply.status}`;
  const flag = value => value === true ? 'passed' : value === false ? 'refused' : `unexpected ${value}`;
  const refusal = result => result?.error === 'forbidden' ? 'refused' : result?.error === 'not_found' ? 'passed' : `unexpected ${JSON.stringify(result)}`;
  const managerOf = tree => !tree?.props ? undefined : tree.type === 'AgentTokensManager' ? tree.props : [tree.props.children].flat().map(managerOf).find(Boolean);
  const rendered = async workspaceId => {
    try { return managerOf(await page.default(params({ workspaceId }))); } catch (error) { if (error.message === 'NEXT_NOT_FOUND') return null; throw error; }
  };

  // Each path, and what it says for the signed-in person: passed or refused.
  const paths = {
    'create a seat': () => seats.POST(body({ name: 'Dev', projectId: 'p', role: 'developer' }), params({ workspaceId: 'w' })).then(status(201)),
    'retire a seat': () => seat.DELETE(body(), params({ workspaceId: 'w', seatId: 's' })).then(status(200)),
    'mint a token': () => tokens.POST(body({ name: 'Claude' }), params({ workspaceId: 'w' })).then(status(201)),
    'revoke a token': () => token.DELETE(body(), params({ workspaceId: 'w', tokenId: 't' })).then(status(200)),
    'let a token into the workspace': () => token.PATCH(body({ workspaceId: 'w', allowed: true }), params({ workspaceId: 'home', tokenId: 't' })).then(status(200)),
    'let a workspace token into another workspace': () => token.PATCH(body({ workspaceId: 'home', allowed: true }), params({ workspaceId: 'w', tokenId: 't' })).then(status(200)),
    'withdraw a workspace token from another workspace': () => token.PATCH(body({ workspaceId: 'home', allowed: false }), params({ workspaceId: 'w', tokenId: 't' })).then(status(200)),
    'open the agent tokens page': async () => (await rendered('team')) ? 'passed' : 'refused',
    'the agent tokens page offers the workspace': async () => flag((await rendered('home')).workspaces.some(row => row.id === 'w')),
    'read agent mode': () => mode.GET(body(), params({ workspaceId: 'w', projectSlug: 'p' })).then(status(200)),
    'change agent mode': () => mode.PATCH(body({}), params({ workspaceId: 'w', projectSlug: 'p' })).then(status(200)),
    'read the agent repository': async () => flag((await repository.GET(body(), params({ projectId: 'p' }))).body.canManage),
    'set the agent repository': () => repository.PATCH(body({ url: 'https://github.com/org/repo' }), params({ projectId: 'p' })).then(status(200)),
    'set a project up with seats': () => setup.seatSetupState({ user: session.user, app: { slug: 'collab-cli' }, workspace: { id: 'w' } }, 'missing-project')
      .then(() => 'unexpected return', error => error.code === 'forbidden' ? 'refused' : error.code === 'project_not_found' ? 'passed' : error.code),
    'manage seats on the Agents page': async () => flag((await agentsPage.readSeats(session.user.id, 'team')).canManage),
    'delete a custom role': () => customRoles.deleteCustomRole(session.user.id, 'w', 'r').then(refusal),
    'edit role instructions on the Roles page': async () => flag((await roleInstructions.readRoleInstructions(session.user.id, 'team')).canEdit),
    'save role instructions': () => roleInstructions.saveRoleInstructions(session.user.id, 'w', 'developer', 'Text')
      .then(result => result.error === 'forbidden' ? 'refused' : result.role === 'developer' && result.text === 'Text' ? 'passed' : `unexpected ${JSON.stringify(result)}`),
    "edit a seat's instructions on its page": async () => flag((await seatInstructions.readSeatPage(session.user.id, 'team', 's')).canEdit),
    "save a seat's instructions": () => seatInstructions.saveSeatInstructions(session.user.id, 'w', 's', 'Text').then(result => result.seat === 's' ? 'passed' : refusal(result)),
  };
  return { paths, writes, team, as: userId => { session = { user: { id: userId } }; } };
}

test('an inactive platform-admin membership hides the project and the token picker destination', async () => {
  const f = fixture();
  f.team.members.find(member => member.userId === 'root').status = false;
  f.as('root');
  assert.equal(await f.paths['open the agent tokens page'](), 'passed');
  assert.equal(await f.paths['the agent tokens page offers the workspace'](), 'refused');
  assert.equal(await f.paths['set the agent repository'](), 'status 404');
  assert.deepEqual(f.writes, []);
});

test('every seat, token, agent-mode, agent-repository and instruction path asks MANAGE_AGENTS: an Admin passes, a role with MANAGE_WORKSPACE_PERMISSIONS but without MANAGE_AGENTS is refused, a platform admin passes', async () => {
  const f = fixture();
  const seen = {};
  for (const [name, run] of Object.entries(f.paths)) {
    for (const user of [...PASS, ...REFUSED]) {
      f.as(user);
      f.writes.length = 0;
      const outcome = await run();
      // A refused call writes nothing.
      seen[`${name} / ${user}`] = REFUSED.includes(user) && f.writes.length ? `${outcome}, wrote ${f.writes}` : outcome;
    }
  }
  const expected = Object.fromEntries(Object.keys(f.paths).flatMap(name => [...PASS, ...REFUSED].map(user => [`${name} / ${user}`, PASS.includes(user) ? 'passed' : 'refused'])));
  assert.deepEqual(seen, expected);
});
