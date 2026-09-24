const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(resolve(__dirname, '../../', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, {
    exports, Error, console,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(clause => matches(row, clause));
    if (value === null || typeof value !== 'object') return row?.[key] === value;
    if ('some' in value) return row?.[key]?.some(item => matches(item, value.some)) ?? false;
    return matches(row?.[key], value);
  });
}

test('comment reads require a current user and active membership or ownership before querying content', async () => {
  let session = null;
  let postReads = 0;
  let commentReads = 0;
  const workspaces = [
    { id: 'own', ownerId: 'alice', members: [] },
    { id: 'joined', ownerId: 'bob', members: [{ userId: 'alice', status: true }] },
    { id: 'revoked', ownerId: 'bob', members: [{ userId: 'alice', status: false }] },
    { id: 'foreign', ownerId: 'bob', members: [{ userId: 'charlie', status: true }] },
  ];
  const author = { id: 'bob', name: 'Bob', image: null };
  const comments = workspaces.flatMap(({ id }) => [
    { id: `${id}-comment`, postId: id, parentId: null, message: `${id} private comment`, author, reactions: [] },
    { id: `${id}-reply`, postId: id, parentId: `${id}-comment`, message: `${id} private reply`, author, reactions: [] },
  ]);
  const db = {
    user: { findUnique: async ({ where }) => where.email === 'alice@example.test'
      ? { id: 'alice', createdAt: new Date(), updatedAt: new Date() } : null },
    post: { findUnique: async ({ where, select }) => {
      postReads++;
      const row = workspaces.find(workspace => workspace.id === where.id);
      if (!row) return null;
      const post = { id: row.id, workspaceId: row.id };
      return Object.fromEntries(Object.keys(select).map(key => [key, post[key]]));
    } },
    workspace: { findFirst: async ({ where }) => workspaces.find(row => matches(row, where)) ?? null },
    comment: { findMany: async ({ where }) => {
      commentReads++;
      return comments.filter(row => row.postId === where.postId &&
        (where.NOT ? row.parentId !== where.NOT.parentId : row.parentId === where.parentId));
    } },
  };
  const dependencies = {
    'server-only': {}, '@/lib/prisma': { prisma: db }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: async () => session },
    '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts'),
    '@/utils/mentions': {}, '@/lib/notification-service': {}, '@/lib/html-sanitizer': {},
    'next/server': { NextResponse: Response },
  };
  dependencies['@/lib/session'] = load('src/lib/session.ts', dependencies);
  dependencies['@/lib/issue-finder'] = load('src/lib/issue-finder.ts', dependencies);
  dependencies['@/lib/post-access'] = load('src/lib/post-access.ts', dependencies);
  const { getComments } = load('src/actions/comment.ts', dependencies);
  const { GET } = load('src/app/api/posts/[postId]/comments/route.ts', dependencies);
  const get = id => GET(new Request('https://example.test/api/posts/' + id + '/comments'), {
    params: Promise.resolve({ postId: id }),
  });
  for (const current of [null, { user: { email: 'deleted@example.test' } }]) {
    session = current;
    assert.equal((await get('joined')).status, 401);
    await assert.rejects(getComments('joined'), /Unauthorized/);
    assert.equal(postReads, 0);
    assert.equal(commentReads, 0);
  }
  session = { user: { email: 'alice@example.test' } };
  for (const id of ['revoked', 'foreign', 'missing', '', undefined]) {
    const response = await get(id);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Post not found');
    await assert.rejects(getComments(id), /Post not found/);
    assert.equal(commentReads, 0);
  }
  for (const id of ['joined', 'own']) {
    const response = await get(id);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.comments.length, 1);
    assert.equal(result.comments[0].message, `${id} private comment`);
    assert.deepEqual(result.comments[0].author, author);
    assert.equal(result.comments[0].replies[0].message, `${id} private reply`);
    const action = await getComments(id);
    assert.equal(action.topLevelComments.length, 1);
    assert.equal(action.topLevelComments[0].message, `${id} private comment`);
    assert.equal(action.repliesByParentId[`${id}-comment`][0].message, `${id} private reply`);
  }
  assert.equal(commentReads, 8);
  workspaces.find(row => row.id === 'joined').members[0].status = false;
  assert.equal((await get('joined')).status, 404);
  await assert.rejects(getComments('joined'), /Post not found/);
  assert.equal(commentReads, 8);
});
