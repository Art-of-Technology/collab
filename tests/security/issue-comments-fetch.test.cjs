const { assert, test, load } = require('./helpers.cjs');
// Exercise QueryObserver's browser polling path without a live server or Redis.
global.window = { addEventListener() {}, removeEventListener() {} };
const { QueryClient, QueryObserver, focusManager, onlineManager } = require('@tanstack/query-core');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const comment = id => ({ id, content: id, createdAt: '2026-11-19', author: { id: 'u' }, reactions: [] });
function fixture(t, fetch) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60000, refetchOnWindowFocus: false, retry: false, gcTime: Infinity } } });
  client.mount();
  const { useIssueComments } = load('src/hooks/queries/useIssueComment.ts', {
    react: { useEffect() {} },
    '@tanstack/react-query': { useQuery: options => options, useQueryClient: () => client },
    '@/lib/workspace-event-source': {}, 'next-auth/react': {}, '@/actions/issueComment': {}, '@/hooks/use-toast': {},
  }, { fetch });
  const observer = new QueryObserver(client, useIssueComments('i'));
  const results = [];
  let unsubscribe;
  t.after(() => { unsubscribe?.(); observer.destroy(); client.unmount(); client.clear(); focusManager.setFocused(undefined); onlineManager.setOnline(true); });
  return { client, observer, options: useIssueComments, start(initial) {
    observer.setOptions(useIssueComments('i', initial));
    unsubscribe = observer.subscribe(result => results.push(result));
    return results;
  }, stop() { unsubscribe?.(); unsubscribe = undefined; } };
}
const response = data => ({ ok: true, json: async () => data });

test('HTTP first load works without workspace or stream and reports loading until the response', async t => {
  const pending = deferred(); let reads = 0;
  const f = fixture(t, (url, options) => { reads++; assert.equal(url, '/api/issues/i/comments'); assert.equal(options.cache, 'no-store'); assert.ok(options.signal); return pending.promise; });
  f.start();
  assert.equal(f.observer.getCurrentResult().isLoading, true);
  assert.equal(reads, 1);
  pending.resolve(response([comment('new')])); await flush();
  assert.equal(f.observer.getCurrentResult().isLoading, false);
  assert.equal(f.observer.getCurrentResult().data[0].id, 'new');
});

test('preloaded comments show immediately but HTTP replaces them, including an authoritative empty list', async t => {
  const pending = deferred(); let reads = 0;
  const f = fixture(t, () => { reads++; return pending.promise; });
  f.start([comment('old')]);
  assert.equal(f.observer.getCurrentResult().data[0].id, 'old');
  assert.equal(f.observer.getCurrentResult().isLoading, false);
  assert.equal(reads, 1);
  pending.resolve(response([])); await flush();
  assert.equal(f.observer.getCurrentResult().data.length, 0);
});

test('empty initial comments still fetch and reopening a recently cached thread fetches again', async t => {
  let reads = 0;
  const f = fixture(t, async () => response([comment(`read-${++reads}`)]));
  f.start([]); await flush();
  assert.equal(reads, 1);
  f.stop(); f.start([comment('stale issue payload')]); await flush();
  assert.equal(reads, 2);
  assert.equal(f.observer.getCurrentResult().data[0].id, 'read-2');
});

test('failed HTTP refresh preserves cached comments and a manual retry recovers', async t => {
  let fail = true;
  const f = fixture(t, async () => fail ? { ok: false } : response([comment('recovered')]));
  f.start([comment('cached')]); await flush();
  assert.equal(f.observer.getCurrentResult().isError, true);
  assert.equal(f.observer.getCurrentResult().data[0].id, 'cached');
  fail = false; await f.observer.refetch();
  assert.equal(f.observer.getCurrentResult().isError, false);
  assert.equal(f.observer.getCurrentResult().data[0].id, 'recovered');
});

test('failed initial HTTP fetch exposes an error without pretending the list is empty', async t => {
  const f = fixture(t, async () => ({ ok: false }));
  f.start(); await flush();
  assert.equal(f.observer.getCurrentResult().isError, true);
  assert.equal(f.observer.getCurrentResult().data, undefined);
});

test('switching issues aborts the previous HTTP fetch and cannot show its late response', async t => {
  const old = deferred(); let oldSignal;
  const f = fixture(t, (url, options) => {
    if (url === '/api/issues/i/comments') { oldSignal = options.signal; return old.promise; }
    return Promise.resolve(response([comment('other issue')]));
  });
  f.start();
  f.observer.setOptions(f.options('other'));
  await flush();
  assert.equal(oldSignal.aborted, true);
  old.resolve(response([comment('late old issue')])); await flush();
  assert.equal(f.observer.getCurrentResult().data[0].id, 'other issue');
});

test('30-second foreground HTTP polling works without SSE, pauses in background and catches up on focus', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let reads = 0;
  const f = fixture(t, async () => response([comment(`read-${++reads}`)]));
  focusManager.setFocused(true);
  f.start(); await flush(); assert.equal(reads, 1);
  t.mock.timers.tick(30000); await flush(); assert.equal(reads, 2);
  focusManager.setFocused(false);
  t.mock.timers.tick(60000); await flush(); assert.equal(reads, 2);
  focusManager.setFocused(true); await flush(); assert.equal(reads, 3);
});

test('network recovery refetches comments through HTTP', async t => {
  let reads = 0;
  const f = fixture(t, async () => response([comment(`read-${++reads}`)]));
  f.start(); await flush();
  onlineManager.setOnline(false); await flush();
  onlineManager.setOnline(true); await flush();
  assert.equal(reads, 2);
});

test('missing EventSource or a constructor failure leaves HTTP fallback usable', () => {
  const absent = load('src/lib/workspace-event-source.ts');
  assert.doesNotThrow(() => absent.subscribeWorkspaceEvents('w', () => {})());
  const failed = load('src/lib/workspace-event-source.ts', {}, { EventSource: class { constructor() { throw new Error('unavailable'); } } });
  assert.doesNotThrow(() => failed.subscribeWorkspaceEvents('w', () => {})());
});

test('comment section renders loading, authoritative empty results, and retryable errors without restoring stale props', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  let state;
  let soundError = null;
  const { IssueCommentsSection } = load('src/components/issue/sections/comments/IssueCommentsSection.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    react: { useMemo: fn => fn(), useCallback: fn => fn },
    '@/hooks/queries/useUser': { useCurrentUser: () => ({ data: { id: 'user' } }) },
    '@/hooks/queries/useIssueComment': { useIssueComments: () => state, useAddIssueComment: () => ({}) },
    './hooks/useCommentArrivalFeedback': { useCommentArrivalFeedback: () => ({ containerRef: { current: null }, highlightedIds: new Set(), soundError, playSound() {} }) },
    './utils/commentHelpers': { organizeCommentsIntoTree: comments => comments },
    './components/CommentItem': { CommentItem: ({ comment }) => React.createElement('p', {}, comment.content) },
    './components/CommentForm': { CommentForm: () => React.createElement('textarea', { 'aria-label': 'New comment' }) },
    './components/EmptyCommentsState': { EmptyCommentsState: () => React.createElement('p', {}, 'No comments') },
    './components/CommentsSkeleton': { CommentsSkeleton: () => React.createElement('p', {}, 'Loading comments') },
  });
  const render = () => renderToStaticMarkup(React.createElement(IssueCommentsSection, { issueId: 'i', initialComments: [comment('STALE')] }));
  state = { isLoading: true };
  assert.match(render(), /Loading comments/);
  state = { data: [], isLoading: false };
  assert.match(render(), /No comments/);
  assert.match(render(), /<button[^>]*>Test sound<\/button>/);
  soundError = 'blocked';
  assert.match(render(), /Your browser blocked comment sound/);
  assert.match(render(), /<button[^>]*>Enable sound<\/button>/);
  soundError = 'unavailable';
  assert.match(render(), /Comment sound could not play/);
  assert.match(render(), /Retry sound/);
  assert.match(render(), /<button[^>]*>Retry sound<\/button>/);
  soundError = null;
  assert.doesNotMatch(render(), /STALE/);
  state = { isLoading: false, isError: true, refetch() {} };
  assert.match(render(), /role="alert"/);
  assert.match(render(), /Try again/);
  assert.doesNotMatch(render(), /No comments|STALE/);
  state = { data: [comment('cached')], isError: true, refetch() {} };
  assert.match(render(), /cached/);
  assert.match(render(), /Try again/);
});

test('closing a thread stops HTTP polling and a missing issue ID never fetches', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let reads = 0;
  const f = fixture(t, async () => { reads++; return response([]); });
  f.start(); await flush(); assert.equal(reads, 1);
  f.stop();
  t.mock.timers.tick(90000); await flush(); assert.equal(reads, 1);
  const disabled = new QueryObserver(f.client, f.options(''));
  const unsubscribe = disabled.subscribe(() => {});
  t.mock.timers.tick(90000); await flush(); assert.equal(reads, 1);
  unsubscribe(); disabled.destroy();
});
