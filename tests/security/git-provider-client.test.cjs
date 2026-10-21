const { assert, test, load } = require('./helpers.cjs');
const z = require('zod');
const configurations = [
  { provider: 'github', baseUrl: 'https://git.example.test', label: 'Enterprise' },
  { provider: 'forgejo', baseUrl: 'https://forge.example.test/forge', label: 'Forgejo' },
  { provider: 'gitlab', baseUrl: 'https://lab.example.test', label: 'GitLab' },
  { provider: 'bitbucket-dc', baseUrl: 'https://bit.example.test/bitbucket', label: 'Data Center' },
];
const stamp = '2026-10-21T12:00:00Z';
function fixture(config = {}) {
  const calls = [], responses = [];
  const client = load('src/lib/git-providers/client.ts', { 'server-only': {}, zod: z }, {
    URL, Buffer, AbortSignal, process: { env: { GIT_PROVIDER_INSTANCES: JSON.stringify(config.instances || configurations) } },
    fetch: async (url, options) => { calls.push({ url, options }); if (config.error) throw Error('secret-body-token'); return config.respond ? config.respond(new URL(url)) : responses.shift() || Response.json({}); },
  });
  return { client, calls, responses, credentials: { token: 'private-token' } };
}
function data(provider, baseUrl) {
  const path = provider === 'gitlab' ? 'group/subgroup/repo' : provider === 'bitbucket-dc' ? 'PROJ/repo' : 'owner/repo';
  const url = `${baseUrl}/${path}`;
  if (provider === 'gitlab') return { path, repo: { id: 42, name: 'repo', path_with_namespace: path, web_url: url }, commit: { id: 'abc', title: 'change', web_url: url + '/-/commit/abc', committed_date: stamp }, pr: { iid: 7, title: 'Review', web_url: url + '/-/merge_requests/7', updated_at: stamp, state: 'opened' } };
  if (provider === 'bitbucket') return { path, repo: { uuid: '{repo-uuid}', full_name: path, name: 'repo', links: { html: { href: url } } }, commit: { hash: 'abc', message: 'change', date: stamp, links: { html: { href: url + '/commits/abc' } } }, pr: { id: 7, title: 'Review', updated_on: stamp, state: 'OPEN', links: { html: { href: url + '/pull-requests/7' } } } };
  if (provider === 'bitbucket-dc') return { path, repo: { id: 42, name: 'repo', slug: 'repo', project: { key: 'PROJ' }, links: { self: [{ href: url }] } }, commit: { id: 'abc', message: 'change', committerTimestamp: Date.parse(stamp) }, pr: { id: 7, title: 'Review', updatedDate: Date.parse(stamp), state: 'OPEN', links: { self: [{ href: url + '/pull-requests/7' }] } } };
  return { path, repo: { id: 42, full_name: path, name: 'repo', html_url: url }, commit: { sha: 'abc', html_url: url + '/commit/abc', commit: { message: 'change\nDetails', committer: { date: stamp } } }, pr: { number: 7, title: 'Review', html_url: url + '/pull/7', updated_at: stamp, state: 'closed', merged_at: stamp } };
}
const cases = [
  ['github', 'https://github.com', 'https://api.github.com'],
  ['github', configurations[0].baseUrl, configurations[0].baseUrl + '/api/v3'],
  ['forgejo', 'https://codeberg.org', 'https://codeberg.org/api/v1'],
  ['forgejo', configurations[1].baseUrl, configurations[1].baseUrl + '/api/v1'],
  ['gitlab', 'https://gitlab.com', 'https://gitlab.com/api/v4'],
  ['gitlab', configurations[2].baseUrl, configurations[2].baseUrl + '/api/v4'],
  ['bitbucket', 'https://bitbucket.org', 'https://api.bitbucket.org/2.0'],
  ['bitbucket-dc', configurations[3].baseUrl, configurations[3].baseUrl + '/rest/api/1.0'],
];
for (const [provider, baseUrl, api] of cases) {
  test(`${provider} ${baseUrl}: lists, verifies identity and reads commit/PR activity`, async () => {
    const f = fixture(); const instance = f.client.resolveInstance(provider, baseUrl); const d = data(provider, baseUrl);
    const envelope = value => ['bitbucket', 'bitbucket-dc'].includes(provider) ? { values: value, isLastPage: true } : value;
    f.responses.push(Response.json(envelope([d.repo])));
    const listed = await f.client.listRepositories(instance, f.credentials, 1, 'owner');
    assert.equal(listed.repositories[0].path, d.path); assert.equal(listed.nextPage, null);
    f.responses.push(Response.json(d.repo));
    const repo = await f.client.getRepository(instance, f.credentials, d.path);
    assert.equal(repo.id, provider === 'bitbucket' ? '{repo-uuid}' : '42');
    f.responses.push(Response.json(envelope([d.commit])), Response.json(envelope([d.pr])));
    const activity = await f.client.getActivity(instance, f.credentials, d.path);
    assert.equal(activity.length, 2); assert.equal(activity[0].title, 'change'); assert.equal(activity[1].id, '7');
    for (const call of f.calls) {
      assert.ok(call.url.startsWith(api + '/')); assert.equal(call.options.redirect, 'error'); assert.equal(call.options.cache, 'no-store');
      assert.equal(call.options.headers.Authorization, `${provider === 'forgejo' ? 'token' : 'Bearer'} private-token`);
      assert.equal(call.url.includes('private-token'), false);
    }
    if (provider === 'gitlab') assert.ok(f.calls[1].url.endsWith('/projects/group%2Fsubgroup%2Frepo'));
    if (provider === 'bitbucket-dc') assert.ok(f.calls[1].url.endsWith('/projects/PROJ/repos/repo'));
  });
}
test('Bitbucket email/API token uses Basic auth; repository token uses Bearer', async () => {
  const f = fixture(); f.responses.push(Response.json({ values: [] }));
  await f.client.listRepositories(f.client.resolveInstance('bitbucket', 'https://bitbucket.org'), { token: 'api-token', username: 'member@example.test' }, 1, 'team');
  assert.equal(f.calls[0].options.headers.Authorization, 'Basic ' + Buffer.from('member@example.test:api-token').toString('base64'));
});
test('Data Center pagination respects nextPageStart without following provider URLs', async () => {
  const f = fixture(); const i = f.client.resolveInstance('bitbucket-dc', configurations[3].baseUrl);
  f.responses.push(Response.json({ values: [], isLastPage: false, nextPageStart: 240 }));
  const first = await f.client.listRepositories(i, f.credentials);
  assert.equal(first.nextPage, 241);
  f.responses.push(Response.json({ values: [], isLastPage: true }));
  await f.client.listRepositories(i, f.credentials, first.nextPage);
  assert.ok(f.calls[1].url.endsWith('start=240'));
});
test('unregistered instances, traversal, header injection and malformed Bitbucket workspace do not send credentials', async () => {
  const f = fixture(); const i = f.client.resolveInstance('github', 'https://github.com');
  assert.throws(() => f.client.resolveInstance('github', 'https://evil.test'));
  await assert.rejects(f.client.getRepository({ ...i, baseUrl: 'https://evil.test' }, f.credentials, 'a/b'));
  for (const path of ['../repo', 'a/..', 'a/b?token=x', 'a/b\\c']) await assert.rejects(f.client.getRepository(i, f.credentials, path));
  await assert.rejects(f.client.getRepository(i, { token: 'x\r\nHeader: injected' }, 'a/b'));
  await assert.rejects(f.client.listRepositories(f.client.resolveInstance('bitbucket', 'https://bitbucket.org'), f.credentials, 1, '../evil'));
  assert.equal(f.calls.length, 0);
});
test('provider auth errors never leak response bodies', async () => {
  for (const status of [401, 403, 404, 500]) {
    const f = fixture(); f.responses.push(new Response('secret-body-token', { status }));
    await assert.rejects(f.client.getRepository(f.client.resolveInstance('github', 'https://github.com'), f.credentials, 'a/b'), error => !error.message.includes('secret-body-token'));
  }
});
test('network failure, invalid payload, foreign links and oversized responses fail closed', async () => {
  const network = fixture({ error: true });
  await assert.rejects(network.client.getRepository(network.client.resolveInstance('github', 'https://github.com'), network.credentials, 'a/b'), /could not be reached/);
  for (const response of [new Response('not json'), Response.json({ id: 1 }), Response.json({ ...data('github', 'https://github.com').repo, html_url: 'https://evil.test/repo' }), new Response('x'.repeat(2_000_001))]) {
    const f = fixture(); f.responses.push(response);
    await assert.rejects(f.client.getRepository(f.client.resolveInstance('github', 'https://github.com'), f.credentials, 'a/b'));
  }
});

test('empty GitHub and Forgejo repositories remain connectable without hiding authorization errors', async () => {
  for (const [provider, baseUrl] of [['github', 'https://github.com'], ['forgejo', configurations[1].baseUrl]]) {
    const f = fixture(); const instance = f.client.resolveInstance(provider, baseUrl);
    f.responses.push(new Response('Git repository is empty', { status: 409 }), Response.json([]));
    assert.equal((await f.client.getActivity(instance, f.credentials, 'team/repo')).length, 0);
    f.responses.push(new Response('denied', { status: 403 }), Response.json([]));
    await assert.rejects(f.client.getActivity(instance, f.credentials, 'team/repo'), /denied access/);
  }
});

for (const [provider, baseUrl] of cases.filter(([provider]) => ['github', 'forgejo'].includes(provider))) {
  test(`${provider} ${baseUrl}: recently merged oldest PR survives the listing limit`, async () => {
    const d = data(provider, baseUrl);
    const pulls = Array.from({ length: 21 }, (_, index) => ({ ...d.pr, number: index + 1, updated_at: index === 0 ? stamp : '2026-10-20T12:00:00Z' }));
    const f = fixture({ respond: url => {
      if (url.pathname.endsWith('/commits')) return Response.json([]);
      const expectedSort = provider === 'forgejo' ? 'recentupdate' : 'updated';
      const newestFirst = url.searchParams.get('sort') === expectedSort && (provider === 'forgejo' || url.searchParams.get('direction') === 'desc');
      const sorted = newestFirst ? pulls : [...pulls].reverse();
      return Response.json(sorted.slice(0, Number(url.searchParams.get(provider === 'forgejo' ? 'limit' : 'per_page'))));
    } });
    const activity = await f.client.getActivity(f.client.resolveInstance(provider, baseUrl), f.credentials, d.path);
    assert.equal(activity.length, 20);
    assert.equal(activity[0].id, '1');
    assert.equal(activity[0].state, 'merged');
  });
}
