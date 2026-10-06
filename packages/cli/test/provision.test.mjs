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
