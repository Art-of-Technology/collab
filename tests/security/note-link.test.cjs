const { assert, test, load, matches } = require('./helpers.cjs');

// A Note's own address opens the Note in Context, where it is kept: in its folder, at the top of its
// project or workspace, or in the reader's personal or shared list. Where a Note is kept is told only
// to someone who may read it.
function fixture(user = { id: 'alice' }) {
  const workspace = { id: 'joined', ownerId: 'bob', members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  const notes = [];
  const addNote = (id, fields = {}) => {
    const row = { id, scope: 'WORKSPACE', authorId: 'bob', workspaceId: 'joined', workspace, projectId: null, project: null,
      folderId: null, folder: null, isRestricted: false, isEncrypted: false, expiresAt: null, sharedWith: [], ...fields };
    notes.push(row);
  };
  const dependencies = {
    'next/navigation': { redirect: location => { throw Object.assign(new Error(`redirect:${location}`), { location }); } },
    '@/lib/session': { getCurrentUser: async () => user },
    '@prisma/client': require('@prisma/client'),
    '@/lib/prisma': { prisma: { note: { findFirst: async ({ where }) => notes.find(row => matches(row, where)) ?? null } } },
  };
  dependencies['@/lib/secrets/access'] = load('src/lib/secrets/access.ts', dependencies, { console, process: { env: {} }, Buffer });
  const page = load('src/app/(main)/[workspaceId]/notes/[id]/page.tsx', dependencies, { URLSearchParams }).default;
  const open = id => page({ params: Promise.resolve({ workspaceId: 'weezboo', id }) }).then(
    () => assert.fail('the address always sends the reader on'), error => error.location);
  return { addNote, open };
}

test('a Note link opens the Note where it is kept', async () => {
  const f = fixture();
  f.addNote('loose');
  f.addNote('in-project', { scope: 'PROJECT', projectId: 'p1' });
  f.addNote('filed', { scope: 'PROJECT', projectId: 'p1', folderId: 'f1' });
  f.addNote('mine', { scope: 'PERSONAL', authorId: 'alice' });
  f.addNote('for-me', { scope: 'SHARED', sharedWith: [{ userId: 'alice' }] });
  // Someone else's personal Note is read because it was shared, so it is found in the shared list.
  f.addNote('theirs-for-me', { scope: 'PERSONAL', sharedWith: [{ userId: 'alice' }] });

  assert.equal(await f.open('loose'), '/weezboo/context?note=loose');
  assert.equal(await f.open('in-project'), '/weezboo/context?project=p1&note=in-project');
  assert.equal(await f.open('filed'), '/weezboo/context?project=p1&folder=f1&note=filed');
  assert.equal(await f.open('mine'), '/weezboo/context?view=personal&note=mine');
  assert.equal(await f.open('for-me'), '/weezboo/context?view=shared&note=for-me');
  assert.equal(await f.open('theirs-for-me'), '/weezboo/context?view=shared&note=theirs-for-me');
});

test('a Note the reader may not read is not located, and a visitor is sent to sign in', async () => {
  const f = fixture();
  f.addNote('private', { scope: 'PROJECT', projectId: 'secret-project', folderId: 'secret-folder', isRestricted: true });
  assert.equal(await f.open('private'), '/weezboo/context?note=private');
  assert.equal(await f.open('missing'), '/weezboo/context?note=missing');
  assert.equal(await fixture(null).open('private'), '/login');
});
