import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { definition, provision } from '../../../scripts/setup-cli-oauth-client.mjs';

test('registration dry run emits only the public app and scope summary', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../../scripts/setup-cli-oauth-client.mjs', import.meta.url))], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { dryRun: true, app: 'collab-cli', scopes: definition.scopes });
});

test('CLI registration creates a dedicated app transactionally and never changes an existing integration', async () => {
  let writes = [], record;
  const prisma = { $transaction: async callback => callback({ app: {
    findUnique: async ({ where }) => { assert.equal(where.slug, 'collab-cli'); return record; },
    create: async ({ data }) => { writes.push(data); return { id: 'new-cli-app' }; },
  } }) };
  assert.equal((await provision(prisma)).created, true);
  assert.equal(writes.length, 1); assert.equal(writes[0].oauthClient.create.clientType, 'public'); assert.equal(writes[0].oauthClient.create.tokenEndpointAuthMethod, 'none');
  assert.ok(writes[0].scopes.create.some(s => s.scope === 'context:write'));
  assert.deepEqual(writes[0].scopes.create.map(s => s.scope), ['user:read', 'workspace:read', 'workspace:write', 'projects:read', 'projects:write', 'issues:read', 'issues:write', 'context:read', 'context:write', 'prompts:read', 'knowledge:read']);
  assert.equal(writes[0].oauthClient.create.clientId, 'collab-cli');
  record = { ...definition, id: 'existing', scopes: definition.scopes.map(scope => ({ scope })) };
  assert.equal((await provision(prisma)).created, false); assert.equal(writes.length, 1);
  for (const change of [{ isSystemApp: false }, { publisherId: 'other' }, { status: 'SUSPENDED' }, { scopes: [] }, { oauthClient: { ...definition.oauthClient, clientSecret: 'private' } }]) {
    const original = record; record = { ...record, ...change };
    await assert.rejects(provision(prisma), /differs/); assert.equal(writes.length, 1); record = original;
  }
});

const agentScript = fileURLToPath(new URL('../../../scripts/setup-agent-apps.mjs', import.meta.url));
const mcpScopes = ['user:read', 'workspace:read', 'projects:read', 'issues:read', 'issues:write', 'context:read', 'context:write', 'prompts:read'];

function agentFixture(records = {}) {
  const writes = []; let transactions = 0;
  const prisma = { $transaction: async callback => { transactions += 1; return callback({ app: {
    findUnique: async ({ where }) => records[where.slug],
    create: async ({ data }) => { writes.push(data); return { id: `new-${data.slug}` }; },
  } }); } };
  return { prisma, writes, transactions: () => transactions };
}

test('agent app setup dry run lists the three apps without a database', () => {
  const result = spawnSync(process.execPath, [agentScript], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { dryRun: true, apps: [
    { app: 'collab-agent', scopes: definition.scopes },
    { app: 'collab-connector', scopes: mcpScopes, clientId: 'collab-connector', redirectUris: ['https://claude.ai/api/mcp/auth_callback'] },
    { app: 'collab-assistant', scopes: mcpScopes },
  ] });
});

test('agent app setup creates the three system apps in one transaction, with an OAuth client only for the connector', async () => {
  const { provisionAll } = await import('../../../scripts/setup-agent-apps.mjs');
  const f = agentFixture();
  assert.deepEqual(await provisionAll(f.prisma), [
    { app: 'collab-agent', created: true, appId: 'new-collab-agent', clientId: undefined },
    { app: 'collab-connector', created: true, appId: 'new-collab-connector', clientId: 'collab-connector' },
    { app: 'collab-assistant', created: true, appId: 'new-collab-assistant', clientId: undefined },
  ]);
  assert.equal(f.transactions(), 1, 'all three are created or none');
  const [agent, connector, assistant] = f.writes;
  for (const app of f.writes) assert.deepEqual([app.isSystemApp, app.status, app.publisherId], [true, 'PUBLISHED', 'system']);
  assert.equal('oauthClient' in agent, false, 'nothing can sign in as the agent token app');
  assert.equal('oauthClient' in assistant, false);
  assert.deepEqual(agent.scopes.create.map(s => s.scope), definition.scopes);
  assert.deepEqual(connector.scopes.create.map(s => s.scope), mcpScopes);
  assert.deepEqual(assistant.scopes.create.map(s => s.scope), mcpScopes);
  assert.deepEqual([connector.oauthClient.create.clientType, connector.oauthClient.create.tokenEndpointAuthMethod, connector.oauthClient.create.redirectUris],
    ['public', 'none', ['https://claude.ai/api/mcp/auth_callback']]);
});

test('agent app setup reuses matching registrations and refuses differing ones without writing', async () => {
  const { definitions, provisionAll } = await import('../../../scripts/setup-agent-apps.mjs');
  const existing = () => Object.fromEntries(definitions.map(def => [def.slug, { ...def, id: `existing-${def.slug}`, oauthClient: def.oauthClient ?? null, scopes: def.scopes.map(scope => ({ scope })) }]));
  const same = agentFixture(existing());
  assert.deepEqual((await provisionAll(same.prisma)).map(row => row.created), [false, false, false]);
  assert.equal(same.writes.length, 0);
  const client = definitions.find(def => def.slug === 'collab-connector').oauthClient;
  for (const [slug, change] of [
    ['collab-agent', { oauthClient: client }],
    ['collab-agent', { isSystemApp: false }],
    ['collab-agent', { scopes: [{ scope: 'secrets:read' }] }],
    ['collab-connector', { oauthClient: { ...client, redirectUris: ['https://evil.example/callback'] } }],
    ['collab-connector', { oauthClient: { ...client, clientSecret: 'private' } }],
    ['collab-connector', { oauthClient: null }],
    ['collab-assistant', { status: 'SUSPENDED' }],
  ]) {
    const records = existing(); Object.assign(records[slug], change);
    const f = agentFixture(records);
    await assert.rejects(provisionAll(f.prisma), /differs/, `${slug} ${JSON.stringify(change)}`);
    assert.equal(f.writes.length, 0);
    assert.equal(f.transactions(), 1);
  }
});
