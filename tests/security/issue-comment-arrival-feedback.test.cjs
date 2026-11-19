const { assert, test, load } = require('./helpers.cjs');
const React = require('react');
const { act, createElement: h } = React;
const file = 'src/components/issue/sections/comments/';
const comment = (id, author = 'other', replies = []) => ({ id, author: { id: author }, replies });

test('arrival detection deduplicates nested replies and ignores edits, likes, own writes and optimistic IDs', () => {
  const { findCommentArrivals } = load(file + 'utils/commentArrivals.ts');
  const seen = new Set(['existing']);
  const reply = comment('reply');
  const result = findCommentArrivals(seen, [comment('existing', 'other', [reply]), reply, comment('own', 'me'), comment('temp-1')], 'me');
  assert.equal(JSON.stringify(result), JSON.stringify(['reply']));
  assert.equal(findCommentArrivals(seen, [comment('existing'), reply], 'me').length, 0);
  assert.equal(findCommentArrivals(seen, [], 'me').length, 0);
  assert.equal(findCommentArrivals(seen, [reply], 'me').length, 0);
});

test('scroll geometry respects nested modal clipping and keeps the beginning of long comments visible', () => {
  const { commentNeedsScroll } = load(file + 'utils/commentArrivals.ts', {}, {
    window: { innerHeight: 900 }, getComputedStyle: parent => ({ overflowY: parent.overflow }),
  });
  const outer = { overflow: 'auto', clientTop: 0, clientHeight: 600, getBoundingClientRect: () => ({ top: 100 }), parentElement: null };
  const inner = { overflow: 'auto', clientTop: 0, clientHeight: 300, getBoundingClientRect: () => ({ top: 200 }), parentElement: outer };
  const item = (top, height) => ({ parentElement: inner, getBoundingClientRect: () => ({ top, bottom: top + height, height }) });
  assert.equal(commentNeedsScroll(item(250, 100)), false);
  assert.equal(commentNeedsScroll(item(450, 100)), true);
  assert.equal(commentNeedsScroll(item(550, 1500)), true);
  assert.equal(commentNeedsScroll(item(220, 1500)), false);
  assert.equal(commentNeedsScroll(item(190, 1500)), true);
});

async function fixture(t, { reducedMotion = false, blockedAudio = false } = {}) {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  const old = { window: global.window, document: global.document, flag: global.IS_REACT_ACT_ENVIRONMENT };
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  let output, plays = 0, pauses = 0, scrolls = [], next = 0, audioUrl;
  const frames = new Map(), timers = new Map();
  const helpers = load(file + 'utils/commentArrivals.ts', {}, { window: dom.window, getComputedStyle: element => dom.window.getComputedStyle(element) });
  dom.window.matchMedia = () => ({ matches: reducedMotion });
  class Audio {
    constructor(url) { audioUrl = url; }
    play() { plays++; return blockedAudio ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); }
    pause() { pauses++; }
  }
  const { useCommentArrivalFeedback } = load(file + 'hooks/useCommentArrivalFeedback.ts', {
    react: React, '../utils/commentArrivals': helpers,
  }, {
    window: dom.window, Audio,
    requestAnimationFrame: fn => { frames.set(++next, fn); return next; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, ms) => { assert.equal(ms, 800); timers.set(++next, fn); return next; },
    clearTimeout: id => timers.delete(id),
  });
  function Harness({ issue = 'i', comments, ready }) {
    output = useCommentArrivalFeedback(issue, comments, ready, 'me');
    return h('div', { ref: output.containerRef }, comments.map(c => h('div', {
      key: c.id, 'data-comment-id': c.id,
      ref: element => {
        if (element) {
          element.getBoundingClientRect = () => ({ top: 1200, bottom: 2800, height: 1600 });
          element.scrollIntoView = options => scrolls.push({ id: c.id, ...options });
        }
      },
    }, c.id)));
  }
  t.after(async () => {
    await act(() => root.unmount()); dom.window.close();
    global.window = old.window; global.document = old.document; global.IS_REACT_ACT_ENVIRONMENT = old.flag;
  });
  return {
    render: props => act(() => root.render(h(Harness, props))),
    frame: () => act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); await Promise.resolve(); }),
    expire: () => act(() => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }),
    get state() { return { plays, pauses, scrolls, audioUrl, ids: [...output.highlightedIds], frames: frames.size, timers: timers.size }; },
  };
}

test('initial HTTP/cached loads stay silent; remote arrival scrolls to the start, highlights briefly and plays once', async t => {
  const f = await fixture(t);
  await f.render({ comments: [comment('cached')], ready: false });
  await f.render({ comments: [comment('cached'), comment('initial-http')], ready: true });
  await f.frame(); assert.equal(f.state.plays, 0); assert.equal(f.state.scrolls.length, 0);
  const comments = [comment('cached'), comment('initial-http'), comment('new')];
  await f.render({ comments, ready: true }); await f.frame();
  assert.deepEqual(f.state.ids, ['new']);
  assert.equal(f.state.plays, 1); assert.equal(f.state.audioUrl, '/sounds/new-comment.mp3');
  assert.deepEqual(f.state.scrolls, [{ id: 'new', block: 'start', inline: 'nearest', behavior: 'smooth' }]);
  await f.expire(); assert.deepEqual(f.state.ids, []);
  await f.render({ comments: [...comments], ready: true }); await f.frame(); assert.equal(f.state.plays, 1);
});

test('a batch has one sound/scroll; own persisted comments never beep; reduced motion and blocked playback remain safe', async t => {
  const f = await fixture(t, { reducedMotion: true, blockedAudio: true });
  await f.render({ comments: [], ready: true });
  await f.render({ comments: [comment('temp-1', 'me'), comment('own', 'me')], ready: true }); await f.frame();
  assert.equal(f.state.plays, 0);
  await f.render({ comments: [comment('own', 'me'), comment('one'), comment('two')], ready: true }); await f.frame();
  assert.equal(f.state.plays, 1); assert.equal(f.state.scrolls.length, 1);
  assert.equal(f.state.scrolls[0].behavior, 'auto');
  assert.deepEqual(f.state.ids, ['one', 'two']);
});

test('switching issues cancels pending cues and establishes a new silent baseline', async t => {
  const f = await fixture(t);
  await f.render({ comments: [], ready: true });
  await f.render({ comments: [comment('new')], ready: true });
  assert.equal(f.state.frames, 1);
  await f.render({ issue: 'other', comments: [comment('other-existing')], ready: true });
  await f.frame(); assert.equal(f.state.plays, 0); assert.deepEqual(f.state.ids, []);
  await f.render({ issue: 'other', comments: [comment('other-existing'), comment('other-new')], ready: true });
  await f.frame(); assert.equal(f.state.plays, 1);
  await f.render({ issue: 'third', comments: [], ready: false });
  assert.equal(f.state.pauses, 1); assert.equal(f.state.timers, 0);
});

test('incoming replies expand collapsed ancestors and stay open after the highlight ends', async t => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<div id="root"></div>');
  const old = { window: global.window, document: global.document, flag: global.IS_REACT_ACT_ENVIRONMENT };
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(() => root.unmount()); dom.window.close(); global.window = old.window; global.document = old.document; global.IS_REACT_ACT_ENVIRONMENT = old.flag; });
  const noOp = () => null;
  const { CommentItem } = load(file + 'components/CommentItem.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'date-fns': require('date-fns'),
    '@/lib/comment-html': { commentHtml: content => content },
    '@/components/ui/custom-avatar': { CustomAvatar: noOp },
    '@/components/RichEditor': { RichTextRenderer: ({ content }) => h('span', {}, content), RichEditor: noOp },
    '@/components/ui/button': { Button: noOp }, '@/components/modals/ConfirmationModal': { ConfirmationModal: noOp },
    '@/hooks/use-toast': { useToast: () => ({ toast: noOp }) },
    '@/hooks/queries/useIssueComment': Object.fromEntries(['useToggleIssueCommentLike', 'useUpdateIssueComment', 'useDeleteIssueComment'].map(name => [name, () => ({})])),
    '../utils/commentArrivals': load(file + 'utils/commentArrivals.ts'),
    './CommentActions': { CommentActions: ({ onToggleReplies }) => h('button', { onClick: onToggleReplies }, 'Toggle replies') },
    './CommentReplyForm': { CommentReplyForm: noOp },
  });
  const c = (id, replies = []) => ({ ...comment(id, 'other', replies), content: id, createdAt: new Date().toISOString(), reactions: [] });
  const render = (replies, ids) => act(() => root.render(h(CommentItem, { comment: c('parent', replies), issueId: 'i', highlightedIds: new Set(ids) })));
  await render([c('existing-reply')], []);
  await act(() => document.querySelector('button').click());
  assert.equal(document.querySelector('[data-comment-id="existing-reply"]'), null);
  await render([c('existing-reply'), c('new-reply')], ['new-reply']);
  assert.ok(document.querySelector('[data-comment-id="new-reply"] .comment-arrival-highlight'));
  await render([c('existing-reply'), c('new-reply')], []);
  assert.ok(document.querySelector('[data-comment-id="new-reply"]'));
  assert.equal(document.querySelector('.comment-arrival-highlight'), null);
});
