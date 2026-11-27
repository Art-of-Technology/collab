const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const loaded = load('src/components/issue/sections/comments/utils/commentAck.ts');
const { sinceText } = loaded;
// The module runs in its own context, so its arrays are not this realm's: compare plain copies.
const ackLine = (...args) => JSON.parse(JSON.stringify(loaded.ackLine(...args)));
const icon = name => () => React.createElement('svg', { 'data-icon': name, 'aria-hidden': 'true' });
const { CommentAck } = load('src/components/issue/sections/comments/components/CommentAck.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': { CheckCheck: icon('acked'), CircleDashed: icon('waiting'), Ban: icon('none') },
  '../utils/commentAck': loaded });

const created = '2026-11-28T10:00:00.000Z';
const at = seconds => new Date(Date.parse(created) + seconds * 1000).toISOString();
const seat = (name, seconds) => ({ userId: name, name, at: at(seconds) });

async function shown(element, then = async () => {}) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(element));
  try { return await then() ?? document.getElementById('root').innerHTML; } finally { await React.act(async () => root.unmount()); }
}
const render = (ack, updatedAt) => shown(React.createElement('div', { className: 'comment-body' }, React.createElement(CommentAck, { ack, createdAt: created, updatedAt })));

test('sinceText rounds to s, min, h and d, at least 1', () => {
  assert.equal(sinceText(0), '1 s');
  assert.equal(sinceText(45), '45 s');
  assert.equal(sinceText(59.4), '59 s');
  assert.equal(sinceText(60), '1 min');
  assert.equal(sinceText(150), '3 min');
  assert.equal(sinceText(3600), '1 h');
  assert.equal(sinceText(86400), '1 d');
  assert.equal(sinceText(86400 * 3), '3 d');
});

test('acked: the names, how long after, and one detail per seat', () => {
  const line = ackLine({ state: 'acked', seats: [seat('dev-a', 12), seat('rev-b', 200)] }, created);
  assert.deepEqual(line, { tone: 'acked', text: 'Acked by dev-a, rev-b · 12 s after', more: [], details: ['dev-a · 12 s after your comment', 'rev-b · 3 min after your comment'] });
});

test('an edit after the ack adds edited since, an edit before it does not', () => {
  const ack = { state: 'acked', seats: [seat('dev-a', 12)] };
  assert.equal(ackLine(ack, created, at(20)).text, 'Acked by dev-a · 12 s after · edited since');
  assert.equal(ackLine(ack, created, at(14)).text, 'Acked by dev-a · 12 s after');
  assert.equal(ackLine(ack, created, at(5)).text, 'Acked by dev-a · 12 s after');
  assert.equal(ackLine(ack, created, undefined).text, 'Acked by dev-a · 12 s after');
});

test('waiting: in a run, runner silent, and the seats a mention does not reach', () => {
  const inRun = ackLine({ state: 'waiting', seats: [], waitingFor: 'dev-a', reason: 'in_run' }, created);
  assert.equal(inRun.tone, 'waiting');
  assert.equal(inRun.text, 'Waiting for dev-a · it is in a run now and gets this when it next asks for comments, or in its next run');
  const silent = ackLine({ state: 'waiting', seats: [], waitingFor: 'dev-a', reason: 'runner_silent', missed: ['rev-b', 'qa-c'] }, created);
  assert.equal(silent.text, 'Waiting for dev-a · its runner has not asked for 2 minutes or more');
  assert.deepEqual(silent.more, ['rev-b does not hold this issue; a mention does not reach it', 'qa-c does not hold this issue; a mention does not reach it']);
  assert.deepEqual(silent.details, []);
});

test('none: the issue is done, or the mentioned seat does not hold it', () => {
  const done = ackLine({ state: 'none', seats: [], reason: 'issue_done', waitingFor: 'dev-a' }, created);
  assert.equal(done.tone, 'none');
  assert.equal(done.text, 'No agent will pick this up · the issue is done. Reopen it to send this to dev-a');
  const held = ackLine({ state: 'none', seats: [], reason: 'not_holder', missed: ['rev-b', 'qa-c'] }, created);
  assert.equal(held.text, 'No agent will pick this up · rev-b, qa-c does not hold this issue. Assign the issue to it to send this');
});

test('acked line is a button that opens the details, with the exact time as its title', async () => {
  const ack = { state: 'acked', seats: [seat('dev-a', 12), seat('rev-b', 200)] };
  const root = document.getElementById('root');
  await shown(React.createElement(CommentAck, { ack, createdAt: created }), async () => {
    const button = root.querySelector('button');
    assert.equal(button.getAttribute('type'), 'button');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.getAttribute('title'), new Date(ack.seats[0].at).toLocaleString());
    assert.ok(!root.textContent.includes('after your comment'));
    await React.act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    assert.equal(root.querySelector('button').getAttribute('aria-expanded'), 'true');
    assert.deepEqual([...root.querySelectorAll('li')].map(li => li.textContent), ['dev-a · 12 s after your comment', 'rev-b · 3 min after your comment']);
    assert.equal(root.querySelector('button svg').getAttribute('aria-hidden'), 'true');
  });
});

test('the acked button carries the time of the first ack as its title, in the viewer\'s local format', async () => {
  const ack = { state: 'acked', seats: [seat('dev-a', 12), seat('rev-b', 200)] };
  await shown(React.createElement(CommentAck, { ack, createdAt: created }), async () => {
    const title = document.querySelector('button').getAttribute('title');
    assert.equal(title, new Date(ack.seats[0].at).toLocaleString());
    assert.notEqual(title, new Date(ack.seats[1].at).toLocaleString());
    assert.ok(title.includes('2026'), title);
  });
});

test('waiting and none lines are plain text, not buttons', async () => {
  for (const ack of [{ state: 'waiting', seats: [], waitingFor: 'dev-a', reason: 'in_run', missed: ['rev-b'] }, { state: 'none', seats: [], reason: 'issue_done', waitingFor: 'dev-a' }]) {
    await shown(React.createElement(CommentAck, { ack, createdAt: created }), async () => {
      assert.equal(document.querySelector('button'), null);
      assert.ok(document.querySelector('svg[aria-hidden="true"]'));
    });
  }
  const html = await render({ state: 'waiting', seats: [], waitingFor: 'dev-a', reason: 'in_run', missed: ['rev-b'] });
  assert.ok(html.includes('rev-b does not hold this issue; a mention does not reach it'), html);
});

test('a comment with no ack renders no line and no wrapper', async () => {
  for (const ack of [null, undefined]) assert.equal(await render(ack), '<div class="comment-body"></div>');
});

test('the line is outside the hover-only action row', async () => {
  for (const ack of [{ state: 'acked', seats: [seat('dev-a', 12)] }, { state: 'waiting', seats: [], waitingFor: 'dev-a', reason: 'in_run' }, { state: 'none', seats: [], reason: 'issue_done', waitingFor: 'dev-a' }]) {
    await render(ack);
    const root = document.getElementById('root');
    await shown(React.createElement('div', { className: 'comment-body' }, React.createElement(CommentAck, { ack, createdAt: created })), async () => {
      assert.ok(!root.innerHTML.includes('group-hover'));
      assert.ok(!root.innerHTML.includes('opacity-0'));
      assert.ok(root.querySelector('.text-\\[11px\\]'));
    });
  }
});

test('a seat name is rendered as text', async () => {
  const name = '<b>x</b>';
  const html = await render({ state: 'acked', seats: [seat(name, 12)] });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'), html);
  assert.ok(!html.includes('<b>'), html);
  const root = document.getElementById('root');
  await shown(React.createElement(CommentAck, { ack: { state: 'waiting', seats: [], waitingFor: name, reason: 'in_run' }, createdAt: created }), async () => assert.equal(root.querySelector('b'), null));
});
