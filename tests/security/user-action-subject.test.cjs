const { assert, test, load, matches, workspaces } = require('./helpers.cjs');

function fixture(sessionUser) {
  const date = new Date('2026-09-27T00:00:00Z');
  const users = ['alice', 'bob'].map(id => ({ id, email: `${id}@example.test`, name: id,
    createdAt: date, updatedAt: date, avatarEyes: 4, avatarHair: 2, useCustomAvatar: true }));
  const spaces = structuredClone(workspaces);
  const calls = { reads: [], writes: [], protected: [] };
  const db = {
    user: {
      findUnique: async ({ where, select }) => {
        calls.reads.push(where);
        const row = users.find(user => matches(user, where));
        return !row ? null : select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row;
      },
      update: async ({ where, data }) => {
        calls.writes.push({ where, data });
        return { ...users.find(user => matches(user, where)), ...data };
      },
    },
    workspace: { findFirst: async ({ where }) => spaces.find(space => matches(space, where)) ?? null },
    workspaceMember: {
      findUnique: async () => { calls.protected.push('member'); return null; },
      upsert: async spec => { calls.writes.push(spec); return spec.create; },
    },
    post: { findMany: async ({ where }) => {
      calls.protected.push('posts');
      return spaces.map(workspace => ({ id: workspace.id, workspace, authorId: 'bob' })).filter(row => matches(row, where));
    } },
    comment: { count: async () => { calls.protected.push('comments'); return 0; } },
    reaction: { count: async () => { calls.protected.push('reactions'); return 0; } },
    conversation: { findFirst: async () => { calls.protected.push('conversation'); return null; } },
  };
  const actions = load('src/actions/user.ts', {
    'next-auth': { getServerSession: async () => sessionUser && { user: sessionUser } },
    '@/lib/auth-options': { authOptions: {} }, '@/lib/prisma': { prisma: db },
  });
  return { actions, calls, date };
}

for (const email of ['bob@example.test', undefined]) test(`all four actions use subject with ${email ? 'conflicting' : 'absent'} email`, async () => {
  const { actions, calls, date } = fixture({ id: 'alice', email });
  const current = await actions.getCurrentUser();
  assert.equal(current.id, 'alice');
  assert.equal(current.createdAt, date); // Keep the action's Date-valued projection.
  assert.equal(current.avatarEyes, 4);
  assert.equal('hashedPassword' in current, false);
  assert.equal('githubAccessToken' in current, false);
  const profile = await actions.getUserProfile('bob', 'joined');
  assert.equal(profile.currentUser.id, 'alice');
  assert.deepEqual(Array.from(profile.posts, post => post.id).sort(), ['joined', 'own']);
  await assert.rejects(actions.getUserProfile('alice'), /self_profile/);
  const updated = await actions.updateUserProfile({ name: 'New name' });
  assert.equal(updated.id, 'alice');
  assert.equal(updated.name, 'New name');
  const avatar = await actions.updateUserAvatar({ avatarEyes: 0, useCustomAvatar: false });
  assert.equal(avatar.id, 'alice');
  assert.equal(avatar.avatarEyes, 0);
  assert.equal(avatar.avatarHair, 2);
  assert.equal(avatar.useCustomAvatar, false);
  assert.deepEqual(calls.writes.map(write => write.where.id), ['alice', 'alice']);
});

test('missing and deleted subjects stop all four actions before protected reads or writes', async () => {
  for (const sessionUser of [null, { email: 'alice@example.test' }, { id: '', email: 'alice@example.test' }, { id: 'deleted', email: 'alice@example.test' }]) {
    const { actions, calls } = fixture(sessionUser);
    assert.equal(await actions.getCurrentUser(), null);
    const error = sessionUser?.id === 'deleted' ? /User not found/ : /Unauthorized/;
    await assert.rejects(actions.getUserProfile('bob', 'joined'), error);
    await assert.rejects(actions.updateUserProfile({ name: 'No write' }, 'joined'), error);
    await assert.rejects(actions.updateUserAvatar({ avatarEyes: 0 }), error);
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.protected.length, 0);
    assert.equal(calls.reads.length, sessionUser?.id === 'deleted' ? 4 : 0);
  }
});

test('workspace profile updates retain owner/member access, revocation denial and input validation', async () => {
  const { actions, calls } = fixture({ id: 'alice', email: 'bob@example.test' });
  for (const workspaceId of ['revoked', 'foreign', 'missing']) {
    await assert.rejects(actions.updateUserProfile({ name: 'No write' }, workspaceId), /Workspace access required/);
  }
  assert.equal(calls.writes.length, 0);
  for (const workspaceId of ['own', 'joined']) {
    const member = await actions.updateUserProfile({ name: 'Workspace name' }, workspaceId);
    assert.equal(member.userId, 'alice');
    assert.equal(member.workspaceId, workspaceId);
    assert.equal(calls.writes.at(-1).where.userId_workspaceId.userId, 'alice');
  }
  const before = calls.writes.length;
  await assert.rejects(actions.updateUserProfile({ name: 42 }), /Invalid name/);
  assert.equal(calls.writes.length, before);
});
