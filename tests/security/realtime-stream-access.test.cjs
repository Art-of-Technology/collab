const { assert, test, load, matches } = require('./helpers.cjs');
const { AsyncLocalStorage } = require('node:async_hooks');
const { NextResponse } = require('next/server');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const context = new AsyncLocalStorage();
  const state = { subject: 'actor', userReads: 0, callback: null, subscribed: 0, unsubscribe: 0, quit: 0, issueReads: 0 };
  const workspace = { id: 'space', ownerId: 'other', members: [{ userId: 'actor', status: true }] };
  const foreign = { id: 'foreign', ownerId: 'other', members: [] };
  const project = { id: 'project', workspace };
  const hiddenProject = { id: 'hidden-project', workspace: foreign };
  const status = { id: 'status', project };
  const rows = [{ id: 'one', workspaceId: workspace.id, workspace, project, statusId: null }, { id: 'two', workspaceId: workspace.id, workspace, project, statusId: null }];
  const view = { id: 'view', workspaceId: workspace.id, workspace, ownerId: 'other', visibility: 'WORKSPACE', sharedWith: [] };
  const db = {
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    issue: { count: async ({ where }) => { state.issueReads++; return rows.filter(row => matches(row, where)).length; } },
    project: { findFirst: async ({ where }) => [project, hiddenProject].find(row => matches(row, where)) ?? null },
    projectStatus: { findFirst: async ({ where }) => matches(status, where) ? status : null },
    view: { findFirst: async ({ where }) => {
      const { OR, ...scope } = where;
      if (!matches(view, scope)) return null;
      return OR.some(clause => clause.sharedWith ? view.visibility === clause.visibility && view.sharedWith.includes(clause.sharedWith.has) : matches(view, clause)) ? view : null;
    } },
  };
  const subscriber = { subscribe: async (_channel, cb) => { state.subscribed++; state.callback = cb; if (state.subscribeWait) await state.subscribeWait.promise; }, unsubscribe: async () => { state.unsubscribe++; }, quit: async () => { state.quit++; } };
  const dependencies = { 'node:async_hooks': { AsyncLocalStorage }, 'next/server': { NextResponse }, '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () => { state.userReads++; return context.getStore() && state.subject ? { id: state.subject } : null; } }, '@/lib/redis': { getRedisSubscriber: async () => { if (state.getWait) await state.getWait.promise; return subscriber; } } };
  dependencies['@/lib/issue-finder'] = load('src/lib/issue-finder.ts', dependencies);
  dependencies['@/lib/post-access'] = load('src/lib/post-access.ts', dependencies);
  dependencies['@/lib/view-access'] = load('src/lib/view-access.ts', dependencies);
  const intervals = new Set(), timeouts = new Set();
  const { GET } = load('src/app/api/realtime/workspace/[workspaceId]/stream/route.ts', dependencies, { Response, ReadableStream, TextEncoder, console: { log() {}, warn() {}, error() {} }, setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn), setTimeout: fn => { timeouts.add(fn); return fn; }, clearTimeout: fn => timeouts.delete(fn) });
  const controller = new AbortController();
  async function open() { const response = await context.run({ id: 'actor' }, () => GET({ signal: controller.signal }, { params: Promise.resolve({ workspaceId: 'space' }) })); await flush(); return response; }
  return { state, workspace, foreign, project, hiddenProject, status, rows, view, intervals, timeouts, controller, open };
}
async function stream(f) { const response = await f.open(); assert.equal(response.status, 200); const reader = response.body.getReader(); assert.match(new TextDecoder().decode((await reader.read()).value), /connected/); if (!f.state.getWait && !f.state.subscribeWait) assert.match(new TextDecoder().decode((await reader.read()).value), /realtime.ready/); return reader; }
const sentinel = { type: 'workspace.updated', marker: 'allowed sentinel' };
async function delivered(f, reader, event, allowed) {
  await f.state.callback(JSON.stringify(event)); await f.state.callback(JSON.stringify(sentinel));
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.equal(first, `data: ${JSON.stringify(allowed ? event : sentinel)}\n\n`);
  if (allowed) assert.equal(new TextDecoder().decode((await reader.read()).value), `data: ${JSON.stringify(sentinel)}\n\n`);
}
test('inactive membership and absent subject deny before subscribing; owner remains allowed', async () => {
  const f = fixture(); f.workspace.members[0].status = false; assert.equal((await f.open()).status, 403); assert.equal(f.state.subscribed, 0);
  f.state.subject = null; assert.equal((await f.open()).status, 401); f.state.subject = 'actor'; f.workspace.ownerId = 'actor'; const reader = await stream(f); await reader.cancel(); assert.equal(f.state.quit, 1);
});
for (const revoke of ['membership', 'mapping', 'subject']) test(`open stream rechecks ${revoke} before delivery and releases subscriber`, async () => {
  const f = fixture(), reader = await stream(f);
  if (revoke === 'membership') f.workspace.members[0].status = false;
  else f.state.subject = revoke === 'mapping' ? null : 'different-user';
  await f.state.callback(JSON.stringify({ type: 'workspace.updated', secret: 'must not deliver' }));
  assert.equal((await reader.read()).done, true); assert.equal(f.state.quit, 1); assert.equal(f.state.unsubscribe, 1); assert.equal(f.intervals.size, 0);
  await reader.cancel();
});
test('bound request context survives asynchronous delivery and owner ignores unrelated inactive membership', async () => {
  const f = fixture(); f.workspace.ownerId = 'actor'; const reader = await stream(f); f.workspace.members[0].status = false;
  await delivered(f, reader, { type: 'workspace.updated', name: 'Allowed' }, true); assert.ok(f.state.userReads >= 3); await reader.cancel();
});
test('four current producer payload shapes retain accessible issue and position events', async () => {
  const f = fixture(), reader = await stream(f);
  for (const event of [
    { type: 'issue.created', workspaceId: 'space', projectId: 'project', issueId: 'one', issueKey: 'ONE-1', statusId: 'status' },
    { type: 'issue.updated', workspaceId: 'space', projectId: 'project', issueId: 'one', statusId: 'status', updatedAt: '2026-09-27' },
    { type: 'view.issue-position.updated', workspaceId: 'space', viewId: 'view', issueId: 'one', columnId: 'done', position: 0, userId: 'actor' },
    { type: 'view.issue-position.updated', workspaceId: 'space', viewId: 'view', affectedIssues: ['one', 'two'], sequence: 1, batchId: 'batch', userId: 'actor' },
  ]) await delivered(f, reader, event, true);
  await reader.cancel();
});
test('hidden issue project or linked status and retained inaccessible references suppress payloads', async () => {
  const f = fixture(), reader = await stream(f), event = { type: 'issue.updated', workspaceId: 'space', issueId: 'one' };
  f.rows[0].project = f.hiddenProject; await delivered(f, reader, event, false); f.rows[0].project = f.project;
  f.rows[0].statusId = 'status'; f.status.project = f.hiddenProject; f.rows[0].projectStatus = f.status; await delivered(f, reader, event, false);
  f.rows[0].statusId = null; await delivered(f, reader, { ...event, statusId: 'status' }, false); await delivered(f, reader, { ...event, projectId: 'hidden-project' }, false);
  f.status.project = f.project; await delivered(f, reader, event, true); await reader.cancel();
});
test('private, unshared, foreign-workspace and missing views cannot disclose view-bearing events', async () => {
  const f = fixture(), reader = await stream(f), event = { type: 'view.issue-position.updated', workspaceId: 'space', viewId: 'view', issueId: 'one', columnId: 'private-column', position: 0 };
  f.view.visibility = 'PRIVATE'; await delivered(f, reader, event, false);
  f.view.ownerId = 'actor'; await delivered(f, reader, event, true);
  f.view.ownerId = 'other'; f.view.visibility = 'SHARED'; await delivered(f, reader, event, false); f.view.sharedWith = ['actor']; await delivered(f, reader, event, true);
  f.view.workspaceId = 'foreign'; await delivered(f, reader, event, false); f.view.workspaceId = 'space';
  await delivered(f, reader, { ...event, viewId: 'missing' }, false); await delivered(f, reader, { ...event, viewId: null }, false); const noView = { ...event }; delete noView.viewId; await delivered(f, reader, noView, false);
  await reader.cancel();
});
test('malformed IDs, mixed-access batches and mismatched workspace never forward', async () => {
  const f = fixture(), reader = await stream(f);
  for (const event of [{ type: 'issue.updated' }, { type: 'issue.updated', issueId: '' }, { type: 'issue.updated', issueId: 'one', workspaceId: 'foreign' }, { type: 'view.issue-position.updated', viewId: 'view', affectedIssues: [] }, { type: 'view.issue-position.updated', viewId: 'view', affectedIssues: ['one', null] }, { type: 'view.issue-position.updated', viewId: 'view', affectedIssues: ['one', 'missing'] }, { type: 'view.issue-position.updated', viewId: 'view', affectedIssues: 'one' }, null, [], 'raw text']) await delivered(f, reader, event, false);
  await reader.cancel();
});
test('invalid JSON closes without forwarding raw message', async () => { const f = fixture(), reader = await stream(f); await f.state.callback('private-invalid-json'); assert.equal((await reader.read()).done, true); assert.equal(f.state.quit, 1); });
test('subscriber acquired after cancellation is released without subscribing', async () => { const f = fixture(); f.state.getWait = deferred(); const reader = await stream(f); await reader.cancel(); f.state.getWait.resolve(); await flush(); assert.equal(f.state.subscribed, 0); assert.equal(f.state.quit, 1); assert.equal(f.intervals.size, 0); assert.equal(f.timeouts.size, 0); });
test('subscription completing after cancellation is released', async () => { const f = fixture(); f.state.subscribeWait = deferred(); const reader = await stream(f); await reader.cancel(); f.state.subscribeWait.resolve(); await flush(); assert.equal(f.state.unsubscribe, 1); assert.equal(f.state.quit, 1); assert.equal(f.intervals.size, 0); });
