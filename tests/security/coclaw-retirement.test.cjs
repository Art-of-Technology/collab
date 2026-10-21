const { test, assert, load } = require('./helpers.cjs');
const { readdirSync } = require('node:fs');
const { join, relative } = require('node:path');
const root = process.env.SECURITY_TEST_ROOT || join(__dirname, '../..');
function routes(dir) { return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? routes(join(dir, e.name)) : e.name === 'route.ts' ? [join(dir, e.name)] : []); }
const retired = [...routes('src/app/api/coclaw'), ...routes('src/app/api/apps/auth/coclaw'), ...routes('src/app/api/workspaces/[workspaceId]/coclaw'), 'src/app/api/apps/auth/github/token/route.ts'];
const deps = { 'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } } };
for (const file of retired) test(`retired capability cannot read credentials, invoke a provider or mutate data: ${file}`, async () => {
  const retiredHandler = () => ({ status: 410, body: { error: 'coclaw_retired' } });
  const handlers = load(file, { ...deps, '@/lib/coclaw-retired': { coclawRetired: retiredHandler } });
  for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
    if (handlers[method]) { const result = await handlers[method](); assert.equal(result.status, 410); assert.equal(result.body.error, 'coclaw_retired'); }
  }
});
test('retirement response contains no stored credential or private channel content', () => {
  const { coclawRetired } = load('src/lib/coclaw-retired.ts', deps);
  const result = coclawRetired(); assert.equal(result.status, 410); assert.equal(result.body.error, 'coclaw_retired');
});
test('Coclaw cannot be discovered or restored through registry while Cleo remains available', async () => {
  const cleoAgent = { slug: 'cleo', isDefault: true };
  const registry = load('src/lib/ai/agents/registry.ts', { './cleo': { cleoAgent } });
  assert.equal(await registry.getAgent('coclaw'), null);
  assert.equal((await registry.getDefaultAgent()).slug, 'cleo');
  assert.deepEqual(Array.from(await registry.getAllAgents(), a => a.slug), ['cleo']);
});
