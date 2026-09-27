const { assert, test, load, matches } = require('./helpers.cjs');
const copy = value => structuredClone(value);
const routes = {
  secret: 'src/app/api/apps/by-id/[id]/reveal-secret/route.ts',
  key: 'src/app/api/apps/by-id/[id]/mark-api-key-revealed/route.ts',
  rotate: 'src/app/api/apps/by-id/[id]/regenerate-api-key/route.ts',
  manifest: 'src/app/api/apps/[slug]/submit-manifest/route.ts',
  create: 'src/app/api/apps/create-draft/route.ts',
};

function fixture({ owner = 'alice', subject = 'alice', deleted = false, revealed = false, decryptFails = false, interleave } = {}) {
  const state = { app: { id: 'app', slug: 'app', name: 'App', userId: owner, publisherId: 'untrusted-label', status: 'DRAFT', versions: [], installations: [], scopes: [] },
    client: { id: 'client', appId: 'app', clientId: 'public-client', clientType: 'confidential', tokenEndpointAuthMethod: 'client_secret_basic', clientSecret: Buffer.from('encrypted-fixture'), secretRevealed: revealed, apiKey: 'fixture-key', apiKeyRevealed: revealed, redirectUris: [] },
    actorLive: !deleted };
  const calls = { decrypt: 0, generate: 0, fetch: 0, writes: 0, claim: 0 };
  const user = { id: 'alice', createdAt: new Date(), updatedAt: new Date(), emailVerified: null };
  const appMatch = where => state.actorLive && matches(state.app, where);
  const appRead = async ({ where }) => appMatch(where) ? { ...copy(state.app), oauthClient: copy(state.client) } : null;
  const clientMatch = where => Object.entries(where).every(([key, value]) => {
    if (key === 'app') return appMatch(value);
    if (key === 'clientSecret') return Buffer.from(state.client.clientSecret).equals(Buffer.from(value));
    return matches(state.client, { [key]: value });
  });
  const db = {
    user: { findUnique: async ({ where }) => state.actorLive && where.id === user.id ? user : null },
    app: {
      findUnique: appRead, findFirst: appRead,
      update: async ({ data }) => { calls.writes++; Object.assign(state.app, data); return copy(state.app); },
      updateMany: async ({ where, data }) => { interleave?.(state); if (!appMatch(where)) return { count: 0 }; calls.writes++; Object.assign(state.app, data); return { count: 1 }; },
      create: async ({ data }) => { calls.writes++; return { id: 'created', ...data }; },
    },
    appOAuthClient: {
      update: async ({ data }) => { calls.writes++; Object.assign(state.client, data); return copy(state.client); },
      updateMany: async ({ where, data }) => { calls.claim++; interleave?.(state); if (!clientMatch(where)) return { count: 0 }; calls.writes++; Object.assign(state.client, data); return { count: 1 }; },
      create: async ({ data }) => { calls.writes++; return { id: 'created-client', ...data }; },
    },
    appVersion: { create: async () => { calls.writes++; return { id: 'version', version: '1' }; } },
    appScope: { deleteMany: async () => { calls.writes++; }, createMany: async () => { calls.writes++; } },
    $transaction: async fn => {
      const before = copy(state);
      try { return await fn(db); } catch (error) { Object.assign(state, before); throw error; }
    },
  };
  const session = subject ? { user: { id: subject } } : null;
  const json = (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers ?? {} });
  const deps = { '@/lib/prisma': { prisma: db }, '@/lib/auth-options': { authOptions: {} },
    'next-auth': { getServerSession: async () => session },
    '@/lib/request-session': { getServerSession: async () => session },
    'next/server': { NextResponse: { json } }, zod: require('zod'),
    '@/lib/apps/crypto': { decryptToken: async () => { calls.decrypt++; if (decryptFails) throw new Error('bad ciphertext'); return 'fixture-secret'; },
      generateClientCredentials: async () => { calls.generate++; return { apiKey: 'new-fixture-key', clientId: 'new-client', clientSecret: 'new-fixture-secret' }; },
      encryptToken: async () => Buffer.from('encrypted-new-fixture') },
    '@/lib/apps/validation': { isReservedSlug: () => false, fetchManifest: async () => { calls.fetch++; return {}; },
      validateAppManifest: () => ({ slug: 'app', visibility: 'private', permissions: {}, version: '1', scopes: [], oauth: {} }) },
    '@prisma/client': { AppStatus: { IN_REVIEW: 'IN_REVIEW' } },
  };
  const globals = { Buffer, console: { error() {} } };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, globals);
  // The legacy source has no shared owner predicate; newer handlers load the real helper.
  try { deps['@/lib/apps/ownership'] = load('src/lib/apps/ownership.ts'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { state, calls, deps, globals,
    run: (kind, body = { manifestUrl: 'https://manifest.example.test/app.json', name: 'New app' }) => load(routes[kind], deps, globals).POST(
      { json: async () => body }, { params: Promise.resolve({ id: 'app', slug: 'app' }) }),
  };
}

for (const kind of ['secret', 'key', 'rotate', 'manifest']) {
  test(`${kind} rejects foreign and missing owners before sensitive work`, async () => {
    for (const owner of ['bob', null, '']) {
      const f = fixture({ owner }); const response = await f.run(kind);
      assert.ok([403, 404].includes(response.status));
      assert.equal(f.calls.decrypt + f.calls.generate + f.calls.fetch + f.calls.writes, 0);
      assert.equal(JSON.stringify(response.body).includes('fixture-'), false);
    }
  });
  test(`${kind} rejects absent and deleted actors before sensitive work`, async () => {
    for (const options of [{ subject: null }, { subject: 'deleted' }, { deleted: true }]) {
      const f = fixture(options); assert.equal((await f.run(kind)).status, 401);
      assert.equal(f.calls.decrypt + f.calls.generate + f.calls.fetch + f.calls.writes, 0);
    }
  });
  test(`${kind} rechecks ownership at the write boundary`, async () => {
    const f = fixture({ interleave: state => { state.app.userId = 'bob'; } });
    const result = await f.run(kind);
    assert.ok([403, 404, 409].includes(result.status)); assert.equal(f.calls.writes, 0);
    assert.equal(JSON.stringify(result.body).includes('fixture-'), false);
  });
}

for (const kind of ['secret', 'key']) {
  test(`${kind} owner gets one explicit claim and modeled competing claim gets no credential`, async () => {
    const f = fixture(); const first = await f.run(kind); assert.equal(first.status, 200);
    assert.equal(first.body[kind === 'secret' ? 'clientSecret' : 'apiKey'], kind === 'secret' ? 'fixture-secret' : 'fixture-key');
    assert.equal(first.headers['Cache-Control'], 'no-store');
    const second = await f.run(kind); assert.equal(second.status, 409); assert.equal(f.calls.writes, 1);
    const racing = fixture({ interleave: state => { state.client[kind === 'secret' ? 'secretRevealed' : 'apiKeyRevealed'] = true; } });
    const loser = await racing.run(kind); assert.equal(loser.status, 409); assert.equal(racing.calls.writes, 0);
    assert.equal(JSON.stringify(loser.body).includes('fixture-'), false);
  });
  test(`${kind} rotation between read and claim does not reveal or consume replacement`, async () => {
    const f = fixture({ interleave: state => { state.client[kind === 'secret' ? 'clientSecret' : 'apiKey'] = kind === 'secret' ? Buffer.from('rotated-ciphertext') : 'rotated-key'; } });
    const result = await f.run(kind); assert.equal(result.status, 409); assert.equal(f.calls.writes, 0);
    assert.equal(f.state.client[kind === 'secret' ? 'secretRevealed' : 'apiKeyRevealed'], false);
  });
}

test('failed secret decrypt rolls back its claim', async () => {
  const f = fixture({ decryptFails: true }); assert.equal((await f.run('secret')).status, 500);
  assert.equal(f.state.client.secretRevealed, false);
});

test('valid owner can rotate and submit a draft manifest', async () => {
  const f = fixture(); const result = await f.run('rotate'); assert.equal(result.status, 200);
  assert.equal(result.body.apiKey, 'new-fixture-key'); assert.equal(result.headers['Cache-Control'], 'no-store');
  const manifest = fixture(); assert.equal((await manifest.run('manifest')).status, 200);
  assert.equal(manifest.state.app.status, 'IN_REVIEW'); assert.equal(manifest.calls.fetch, 1);
});

test('draft publisher is current actor or omitted, never arbitrary foreign identity', async () => {
  const foreign = fixture(); const response = await foreign.run('create', { name: 'New App', publisherId: 'bob' });
  assert.equal(response.status, 403); assert.equal(foreign.calls.generate + foreign.calls.writes, 0);
  for (const publisherId of [undefined, 'alice']) {
    const f = fixture(); f.deps['@/lib/prisma'].prisma.app.findUnique = async () => null;
    const result = await f.run('create', { name: 'New App', ...(publisherId ? { publisherId } : {}) });
    assert.equal(result.status, 201); assert.equal(result.body.credentials.clientSecret, 'new-fixture-secret');
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
});

function pageFixture(options) {
  const f = fixture(options), jsx = (type, props) => ({ type, props });
  const deps = { ...f.deps, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { notFound() { throw new Error('not-found'); }, redirect(path) { throw new Error(`redirect:${path}`); } },
    'next/link': { default: 'Link' }, 'next/image': { default: 'Image' },
    'lucide-react': Object.fromEntries(['ArrowLeft', 'ExternalLink', 'Settings', 'Users', 'Code', 'Globe', 'Webhook', 'BarChart3'].map(name => [name, name])),
  };
  for (const [path, names] of [['card', ['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle']], ['badge', ['Badge']], ['button', ['Button']], ['tabs', ['Tabs', 'TabsContent', 'TabsList', 'TabsTrigger']]])
    deps[`@/components/ui/${path}`] = Object.fromEntries(names.map(name => [name, name]));
  for (const name of ['PublishToggle', 'OAuthCredentialsCard', 'ManifestSubmissionCard', 'DeleteButton', 'AppConfigEditor']) deps[`./${name}`] = { [name]: name };
  deps['@/components/apps/AppStatusBadge'] = { AppStatusBadge: 'AppStatusBadge' };
  for (const name of ['WebhookManager', 'DeveloperAnalytics']) deps[`@/components/apps/${name}`] = { default: name };
  return { ...f, page: () => load('src/app/dev/apps/[slug]/page.tsx', deps, f.globals).default({ params: Promise.resolve({ slug: 'app' }) }) };
}
const find = (tree, type) => !tree || typeof tree !== 'object' ? undefined : tree.type === type ? tree : Object.values(tree).flat().map(value => find(value, type)).find(Boolean);

test('app detail page rejects absent/deleted actors and foreign/missing ownership', async () => {
  for (const options of [{ subject: null }, { subject: 'deleted' }, { deleted: true }, { owner: 'bob' }, { owner: null }]) {
    const f = pageFixture(options); await assert.rejects(f.page(), /not-found|redirect:\/login/);
    assert.equal(f.calls.decrypt + f.calls.writes, 0);
  }
});

test('owner app detail emits a safe explicit credential-card DTO', async () => {
  const f = pageFixture(); const tree = await f.page(); const card = find(tree, 'OAuthCredentialsCard');
  assert.ok(card); assert.equal(card.props.oauthClient.clientId, 'public-client');
  assert.equal(card.props.oauthClient.hasApiKey, true);
  assert.equal('apiKey' in card.props.oauthClient, false); assert.equal('clientSecret' in card.props.oauthClient, false);
  assert.equal(JSON.stringify(tree).includes('fixture-key'), false); assert.equal(f.calls.decrypt, 0);
});

function credentialCardFixture(fetchResponse) {
  const states = [], effects = [], requests = [], copied = [], notices = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const deps = { react: {
    useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; },
    useRef: initial => { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; },
    useCallback: fn => fn, useEffect: fn => effects.push(fn),
  }, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/hooks/use-toast': { useToast: () => ({ toast: value => notices.push(value) }) },
    'lucide-react': Object.fromEntries(['Key', 'Copy', 'Eye', 'EyeOff', 'Check', 'AlertTriangle', 'Loader2', 'RotateCw'].map(name => [name, name])),
  };
  for (const [path, names] of [['card', ['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle']], ['badge', ['Badge']], ['button', ['Button']], ['input', ['Input']], ['label', ['Label']], ['alert', ['Alert', 'AlertDescription']], ['alert-dialog', ['AlertDialog', 'AlertDialogAction', 'AlertDialogCancel', 'AlertDialogContent', 'AlertDialogDescription', 'AlertDialogFooter', 'AlertDialogHeader', 'AlertDialogTitle']]])
    deps[`@/components/ui/${path}`] = Object.fromEntries(names.map(name => [name, name]));
  const component = load('src/app/dev/apps/[slug]/OAuthCredentialsCard.tsx', deps, {
    Error, console: { error() {} }, setTimeout() {}, navigator: { clipboard: { writeText: async value => copied.push(value) } },
    fetch: async url => { requests.push(url); return fetchResponse(url); },
  }).OAuthCredentialsCard;
  const render = () => { cursor = 0; return component({ appId: 'app', appStatus: 'DRAFT', oauthClient: { id: 'client', clientId: 'public-client', hasApiKey: true, secretRevealed: false, apiKeyRevealed: false } }); };
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...Object.values(tree).flat().flatMap(nodes)];
  const button = (tree, label) => nodes(tree).find(node => node.type === 'Button' && node.props['aria-label'] === label);
  return { render, nodes, button, effects, requests, copied, notices };
}

test('credential card reveals only on explicit action and keeps successful local values for hide/copy', async () => {
  let fail = false;
  const { render, nodes, button, effects, requests, copied, notices } = credentialCardFixture(async () => ({
    ok: !fail, json: async () => fail ? { error: 'Denied' } : { success: true, clientSecret: 'fixture-secret', apiKey: 'fixture-key' },
  }));
  let tree = render(); for (const effect of effects) await effect(); assert.equal(requests.length, 0);
  await button(tree, 'Reveal client secret').props.onClick(); tree = render();
  assert.equal(requests.length, 1); assert.equal(nodes(tree).find(node => node.type === 'Input' && node.props.id === 'clientSecret').props.value, 'fixture-secret');
  button(tree, 'Hide client secret').props.onClick(); tree = render(); assert.ok(button(tree, 'Show client secret'));
  fail = true; await button(tree, 'Show API key').props.onClick(); tree = render();
  assert.equal(notices.at(-1).description, 'Denied'); assert.equal(JSON.stringify(tree).includes('fixture-key'), false);
  fail = false; await button(tree, 'Show API key').props.onClick(); tree = render();
  assert.equal(nodes(tree).find(node => node.type === 'Input' && node.props.id === 'apiKey').props.value, 'fixture-key');
  const before = requests.length; button(tree, 'Hide API key').props.onClick(); tree = render();
  assert.equal(requests.length, before); assert.ok(button(tree, 'Show API key'));
  for (const node of nodes(tree).filter(node => node.type === 'Button' && node.props.children?.type === 'Copy')) await node.props.onClick();
  assert.ok(copied.includes('fixture-secret')); assert.ok(copied.includes('fixture-key'));
});

for (const rotationResult of ['success', 'denied', 'network-error']) {
  for (const revealFirst of [false, true]) {
    test(`credential card preserves the valid key: rotation ${rotationResult}, reveal finishes ${revealFirst ? 'first' : 'last'}`, async () => {
      const pending = {};
      const { render, nodes, button, effects, requests, copied, notices } = credentialCardFixture(url =>
        new Promise((resolve, reject) => { pending[url.split('/').at(-1)] = { resolve, reject }; }));
      const input = tree => nodes(tree).find(node => node.type === 'Input' && node.props.id === 'apiKey').props;
      const copyKey = async tree => {
        const row = nodes(tree).find(node => node.type === 'div' &&
          Array.isArray(node.props.children) && node.props.children.some(child => find(child, 'Input')?.props.id === 'apiKey') &&
          node.props.children.some(child => child?.type === 'Button'));
        await row.props.children.find(child => child?.type === 'Button').props.onClick();
      };
      const oldKey = 'old-fixture-api-key-1111', newKey = 'new-fixture-api-key-2222';
      let tree = render();
      for (const effect of effects) await effect();
      assert.equal(requests.length, 0);
      const reveal = button(tree, 'Show API key').props.onClick();
      tree = render();
      nodes(tree).find(node => node.type === 'Button' && find(node.props.children, 'RotateCw')).props.onClick();
      tree = render();
      assert.equal(find(tree, 'AlertDialog').props.open, true);
      const rotate = find(tree, 'AlertDialogAction').props.onClick();
      assert.deepEqual(requests, ['/api/apps/by-id/app/mark-api-key-revealed', '/api/apps/by-id/app/regenerate-api-key']);
      const finishReveal = async () => {
        pending['mark-api-key-revealed'].resolve({ ok: true, json: async () => ({ success: true, apiKey: oldKey }) });
        await reveal;
      };
      if (revealFirst) {
        await finishReveal();
        tree = render();
        assert.equal(input(tree).value, oldKey);
        await copyKey(tree);
        assert.equal(copied.at(-1), oldKey);
      }
      if (rotationResult === 'network-error') pending['regenerate-api-key'].reject(new Error('Network unavailable'));
      else pending['regenerate-api-key'].resolve({ ok: rotationResult === 'success', json: async () =>
        rotationResult === 'success' ? { success: true, apiKey: newKey } : { error: 'Denied' } });
      await rotate;
      tree = render();
      if (rotationResult === 'success') {
        assert.equal(input(tree).value, newKey);
        assert.equal(find(tree, 'AlertDialog').props.open, false);
        await button(tree, 'Hide API key').props.onClick();
      } else {
        assert.equal(notices.at(-1).description, rotationResult === 'denied' ? 'Denied' : 'Network unavailable');
        assert.equal(notices.at(-1).variant, 'destructive');
      }
      if (!revealFirst) await finishReveal();
      tree = render();
      const expectedKey = rotationResult === 'success' ? newKey : oldKey;
      await copyKey(tree);
      assert.equal(copied.at(-1), expectedKey);
      assert.equal(input(tree).type, rotationResult === 'success' ? 'password' : 'text');
      if (rotationResult === 'success') assert.notEqual(input(tree).value, expectedKey);
      else assert.equal(input(tree).value, expectedKey);
      if (rotationResult !== 'success') await button(tree, 'Hide API key').props.onClick();
      tree = render();
      assert.equal(input(tree).type, 'password');
      await button(tree, 'Show API key').props.onClick();
      tree = render();
      assert.equal(input(tree).value, expectedKey);
      assert.equal(input(tree).type, 'text');
      assert.equal(requests.length, 2);
    });
  }
}
