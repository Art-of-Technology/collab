const { assert, test, load, matches } = require('./helpers.cjs');

function fixture(kind, subject = { id: 'alice', email: 'stale@example.test' }, interleave = () => {}) {
  const users = [{ id: 'alice', email: 'alice@example.test', createdAt: new Date(), updatedAt: new Date() }];
  const state = { invitation: { id: 'invite', token: 'test-token', email: 'alice@example.test', workspaceId: 'unjoined', status: 'pending', expiresAt: new Date('2099-01-01'), workspace: { id: 'unjoined', name: 'Workspace', slug: 'workspace' }, invitedBy: { id: 'bob', name: 'Bob', email: 'bob@example.test', image: null } }, members: [] };
  const writes = [], reads = [], options = [];
  let failCreate = false;
  const select = (row, spec) => !row ? null : spec.select ? Object.fromEntries(Object.keys(spec.select).map(key => [key, row[key]])) : structuredClone(row);
  const deferred = fn => ({ then: (resolve, reject) => Promise.resolve().then(fn).then(resolve, reject) });
  function dbFor(data) { return {
    user: { findUnique: async spec => select(users.find(row => matches(row, spec.where)), spec) },
    workspaceInvitation: {
      findUnique: async spec => { reads.push(spec); return select(data.invitation && matches(data.invitation, spec.where) ? data.invitation : null, spec); },
      updateMany: async spec => {
        interleave('claim', data, users);
        if (!data.invitation || !matches(data.invitation, spec.where)) return { count: 0 };
        Object.assign(data.invitation, spec.data); writes.push('claim'); return { count: 1 };
      },
      update: spec => deferred(() => { Object.assign(data.invitation, spec.data); writes.push('unconditional'); return data.invitation; }),
    },
    workspace: { findUnique: async () => structuredClone(data.invitation.workspace) },
    workspaceMember: {
      findFirst: async spec => data.members.find(row => matches(row, spec.where)) ?? null,
      findUnique: async spec => data.members.find(row => matches(row, spec.where.userId_workspaceId || spec.where)) ?? null,
      create: ({ data: member }) => deferred(() => {
        if (failCreate || data.members.some(row => row.userId === member.userId && row.workspaceId === member.workspaceId)) throw new Error('membership conflict');
        const row = { status: true, ...member }; data.members.push(row); writes.push('member'); return row;
      }),
    },
  }; }
  const db = dbFor(state);
  db.$transaction = async (fn, opt) => {
    options.push(opt); interleave('entry', state, users);
    if (typeof fn !== 'function') {
      const beforeState = structuredClone(state), beforeWrites = writes.length;
      try { for (const query of fn) await query; return; }
      catch (error) { Object.assign(state, beforeState); writes.splice(beforeWrites); throw error; }
    }
    const draft = structuredClone(state), before = writes.length;
    try { const result = await fn(dbFor(draft)); Object.assign(state, draft); return result; }
    catch (error) { writes.splice(before); throw error; }
  };
  const deps = { '@/lib/prisma': { prisma: db }, '@/lib/auth-options': {},
    'next-auth': { getServerSession: async () => subject && { user: subject } },
    '@/lib/auth': { getAuthSession: async () => subject && { user: subject } },
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
  };
  const globals = { console: { error() {} } };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, globals);
  Object.defineProperty(deps, '@/lib/workspace-invitations', { get: () => load('src/lib/workspace-invitations.ts', deps, globals) });
  const action = load(kind === 'action' ? 'src/actions/invitation.ts' : 'src/app/api/workspaces/invitations/[token]/route.ts', deps, globals);
  const context = { params: Promise.resolve({ token: 'test-token' }) };
  return { state, users, writes, reads, options, failCreate: () => { failCreate = true; },
    preview: async () => kind === 'action' ? action.getInvitationByToken('test-token') : action.GET({}, context),
    accept: async () => kind === 'action' ? action.acceptInvitation('test-token') : action.POST({}, context),
  };
}
const denied = (kind, result) => kind === 'action' ? result.success === false : result.status >= 400;

for (const kind of ['action', 'rest']) {
  test(`${kind}: token preview requires live current recipient, not workspace membership`, async () => {
    for (const subject of [null, { email: 'alice@example.test' }, { id: 'deleted', email: 'alice@example.test' }, { id: 'alice', email: 'alice@example.test' }]) {
      const f = fixture(kind, subject);
      if (subject?.id === 'alice') f.users[0].email = 'other@example.test';
      if (kind === 'action') await assert.rejects(f.preview()); else assert.ok((await f.preview()).status >= 400);
      assert.equal(f.reads.filter(spec => spec.include).length, 0);
    }
    const f = fixture(kind); const response = await f.preview(); const invitation = kind === 'action' ? response : response.body;
    assert.equal(invitation.id, 'invite'); assert.equal(invitation.workspace.id, 'unjoined');
    assert.equal(invitation.invitedBy.id, 'bob'); assert.equal(f.state.members.length, 0);
    for (const mutation of [row => { row.status = 'accepted'; }, row => { row.expiresAt = new Date('2000-01-01'); }]) {
      const invalid = fixture(kind); mutation(invalid.state.invitation);
      if (kind === 'action') await assert.rejects(invalid.preview()); else assert.equal((await invalid.preview()).status, 400);
    }
  });
  test(`${kind}: acceptance uses current subject email, grants MEMBER once and rejects replay`, async () => {
    const f = fixture(kind); const result = await f.accept();
    assert.equal(denied(kind, result), false);
    assert.equal(f.state.members.length, 1); assert.equal(f.state.members[0].userId, 'alice');
    assert.equal(f.state.members[0].role, 'MEMBER'); assert.equal(f.state.members[0].status, true);
    assert.equal(f.state.invitation.status, 'accepted');
    assert.equal(f.options[0].isolationLevel, 'Serializable');
    const before = JSON.stringify(f.state), writes = f.writes.length;
    assert.equal(denied(kind, await f.accept()), true);
    assert.equal(JSON.stringify(f.state), before); assert.equal(f.writes.length, writes);
  });
  test(`${kind}: missing/deleted/wrong recipient and expired/processed invitation cannot write`, async () => {
    for (const subject of [null, { email: 'alice@example.test' }, { id: 'deleted', email: 'alice@example.test' }, { id: 'alice', email: 'alice@example.test' }]) {
      const f = fixture(kind, subject); if (subject?.id === 'alice') f.users[0].email = 'other@example.test';
      const before = JSON.stringify(f.state); assert.equal(denied(kind, await f.accept()), true);
      assert.equal(f.writes.length, 0); assert.equal(JSON.stringify(f.state), before);
    }
    for (const mutation of [f => { f.state.invitation = null; }, f => { f.state.invitation.status = 'accepted'; }, f => { f.state.invitation.expiresAt = new Date('2000-01-01'); }]) {
      const f = fixture(kind); mutation(f); const before = JSON.stringify(f.state);
      assert.equal(denied(kind, await f.accept()), true); assert.equal(f.writes.length, 0); assert.equal(JSON.stringify(f.state), before);
    }
  });
  test(`${kind}: transaction entry rechecks recipient existence/email`, async () => {
    for (const revoke of [(users) => { users.length = 0; }, users => { users[0].email = 'changed@example.test'; }]) {
      const f = fixture(kind, { id: 'alice', email: 'alice@example.test' }, phase => { if (phase === 'entry') revoke(f.users); });
      assert.equal(denied(kind, await f.accept()), true); assert.equal(f.writes.length, 0); assert.equal(f.state.members.length, 0);
    }
  });
  test(`${kind}: lost pending/expiry claim and create failure leave no partial grant`, async () => {
    for (const mutate of [row => { row.status = 'accepted'; }, row => { row.expiresAt = new Date('2000-01-01'); }, row => { row.email = 'changed@example.test'; }]) {
      const f = fixture(kind, { id: 'alice', email: 'alice@example.test' }, (phase, data) => { if (phase === 'claim') mutate(data.invitation); });
      assert.equal(denied(kind, await f.accept()), true); assert.equal(f.writes.length, 0); assert.equal(f.state.members.length, 0);
    }
    const f = fixture(kind, { id: 'alice', email: 'alice@example.test' }); f.failCreate(); const before = JSON.stringify(f.state);
    assert.equal(denied(kind, await f.accept()), true); assert.equal(f.writes.length, 0); assert.equal(JSON.stringify(f.state), before);
  });
  test(`${kind}: active member behavior preserved and inactive role never restored`, async () => {
    for (const active of [true, false]) {
      const f = fixture(kind, { id: 'alice', email: 'alice@example.test' });
      f.state.members.push({ userId: 'alice', workspaceId: 'unjoined', role: 'ADMIN', status: active, user: { email: 'alice@example.test' } });
      const result = await f.accept();
      assert.equal(denied(kind, result), kind === 'action' || !active);
      assert.equal(f.state.members.length, 1); assert.equal(f.state.members[0].role, 'ADMIN'); assert.equal(f.state.members[0].status, active);
      assert.equal(f.state.invitation.status, kind === 'rest' && active ? 'accepted' : 'pending');
      if (kind === 'action' || !active) assert.equal(f.writes.length, 0);
    }
  });
}
