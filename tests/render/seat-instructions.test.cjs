const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/team/agents/seats/seat-dev' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const jsx = require('react/jsx-runtime');
const { createRoot } = require('react-dom/client');
const { renderToStaticMarkup } = require('react-dom/server');

const calls = [], notices = [];
let answers = [];
const ui = {
  react: React, 'react/jsx-runtime': jsx,
  '@/components/ui/button': { Button: ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children) },
  '@/components/ui/textarea': { Textarea: props => React.createElement('textarea', props) },
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
};
const { SeatInstructions } = load('src/components/agents/SeatInstructions.tsx', ui, { fetch: async (url, options = {}) => {
  calls.push([url, options.method ?? 'GET', options.body ? JSON.parse(options.body) : undefined]);
  const [status, body] = answers.shift();
  return { ok: status < 400, status, json: async () => body };
} });

const seat = { id: 'seat-dev', name: 'Dev-1', role: 'developer', project: 'Collab', owner: 'Cem', instructions: 'You own the billing module.' };
const button = text => [...document.querySelectorAll('button')].find(candidate => candidate.textContent === text);
const click = target => React.act(async () => target.click());
const type = (field, value) => React.act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(field, value);
  field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
async function render(canEdit, shown = seat) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(SeatInstructions, { workspaceId: 'ws', canEdit, seat: shown })));
  return root;
}

test('"Instructions for this seat": a box with the saved text and the warning about passwords and tokens', async () => {
  const root = await render(true);
  try {
    const box = document.querySelector('section[aria-label="Instructions for this seat"]');
    assert.ok(box, 'the box is labelled');
    assert.match(box.textContent, /Instructions for this seat/);
    assert.match(box.textContent, /Do not put a password, a token or any other secret here/);
    assert.equal(box.querySelector('textarea').value, 'You own the billing module.');
    assert.equal(box.querySelector('textarea').getAttribute('aria-label'), 'Instructions for Dev-1');
  } finally { await React.act(async () => root.unmount()); }
});

test("someone who may manage seats saves the seat's instructions", async () => {
  const root = await render(true);
  try {
    assert.equal(button('Save').disabled, true, 'nothing to save yet');
    // Only spaces around the saved text: still nothing to save.
    await type(document.querySelector('textarea'), '  You own the billing module.  ');
    assert.equal(button('Save').disabled, true, 'the trimmed text is what is saved');
    await type(document.querySelector('textarea'), 'You own billing.');
    answers = [[200, { seat: 'seat-dev', text: 'You own billing.' }]];
    await click(button('Save'));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/ws/agent-seats/seat-dev/instructions', 'PUT', { text: 'You own billing.' }]);
    assert.equal(notices.at(-1).title, 'Saved');
    assert.match(notices.at(-1).description, /next run of Dev-1/);
    assert.equal(button('Save').disabled, true, 'saved');

    // A refusal keeps the text and says why.
    await type(document.querySelector('textarea'), 'x');
    answers = [[400, { error: 'The seat instructions hold at most 16000 characters' }]];
    await click(button('Save'));
    assert.equal(notices.at(-1).variant, 'destructive');
    assert.equal(notices.at(-1).description, 'The seat instructions hold at most 16000 characters');
    assert.equal(document.querySelector('textarea').value, 'x');
  } finally { await React.act(async () => root.unmount()); }
});

test('someone who may not manage seats reads the text and cannot change it', async () => {
  const before = calls.length;
  let root = await render(false);
  try {
    assert.equal(document.querySelector('textarea'), null);
    assert.equal(button('Save'), undefined);
    const box = document.querySelector('section[aria-label="Instructions for this seat"]');
    assert.match(box.textContent, /You own the billing module\./);
    assert.match(box.textContent, /Do not put a password, a token or any other secret here/);
  } finally { await React.act(async () => root.unmount()); }
  root = await render(false, { ...seat, instructions: '' });
  try {
    assert.match(document.body.textContent, /Nothing added for this seat/);
    assert.equal(calls.length, before);
  } finally { await React.act(async () => root.unmount()); }
});

const link = { default: ({ children, ...props }) => React.createElement('a', props, children) };
function page({ user = 'alice', view } = {}) {
  const calls = [];
  const Page = load('src/app/(main)/[workspaceId]/agents/seats/[seatId]/page.tsx', {
    'react/jsx-runtime': jsx, 'next/link': link,
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error('404'); } },
    '@/lib/request-session': { getServerSession: async () => user ? { user: { id: user } } : null },
    '@/lib/auth': { authOptions: {} },
    '@/lib/agent-seat-instructions': { readSeatPage: async (...args) => { calls.push(args); return view; } },
    '@/components/agents/SeatInstructions': { SeatInstructions: props => React.createElement('section', null, `Box for ${props.seat.id} in ${props.workspaceId}, edit: ${props.canEdit}`) },
  }).default;
  return { calls, open: async seatId => renderToStaticMarkup(await Page({ params: Promise.resolve({ workspaceId: 'team', seatId }) })) };
}

test("the seat's page names the seat, its role, project and owner, with the box; a visitor or someone who cannot see the seat gets nothing", async () => {
  const view = { workspace: { id: 'ws', slug: 'team' }, canEdit: true, seat };
  const shown = page({ view });
  const html = await shown.open('seat-dev');
  assert.deepEqual(shown.calls, [['alice', 'team', 'seat-dev']]);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Dev-1/);
  assert.match(text, /Developer seat of Collab · owner Cem/);
  assert.match(text, /Box for seat-dev in ws, edit: true/);
  assert.match(html, /href="\/team\/agents"/);
  assert.match(html, /href="\/workspaces\/ws\/settings\/roles"/);
  assert.match((await page({ view: { ...view, seat: { ...seat, owner: null } } }).open('seat-dev')).replace(/<[^>]+>/g, ' '), /Developer seat of Collab · no owner \(API key\)/);
  const anonymous = page({ user: null, view });
  await assert.rejects(anonymous.open('seat-dev'), /redirect:\/login/);
  assert.deepEqual(anonymous.calls, []);
  await assert.rejects(page({ view: null }).open('seat-dev'), /404/);
});
