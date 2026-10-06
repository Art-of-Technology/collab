import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definition, provision } from '../../../scripts/setup-cli-oauth-client.mjs';

test('CLI registration creates a dedicated app transactionally and never changes an existing integration', async () => {
  let writes = [], record;
  const prisma = { $transaction: async callback => callback({ app: {
    findUnique: async ({ where }) => { assert.equal(where.slug, 'collab-cli'); return record; },
    create: async ({ data }) => { writes.push(data); return { id: 'new-cli-app' }; },
  } }) };
  assert.equal((await provision(prisma)).created, true);
  assert.equal(writes.length, 1); assert.equal(writes[0].oauthClient.create.clientType, 'public'); assert.equal(writes[0].oauthClient.create.tokenEndpointAuthMethod, 'none');
  assert.ok(writes[0].scopes.create.some(s => s.scope === 'context:write'));
  assert.ok(!writes[0].scopes.create.some(s => s.scope.startsWith('secrets:')));
  record = { ...definition, id: 'existing', scopes: definition.scopes.map(scope => ({ scope })) };
  assert.equal((await provision(prisma)).created, false); assert.equal(writes.length, 1);
  for (const change of [{ isSystemApp: false }, { publisherId: 'other' }, { status: 'SUSPENDED' }, { scopes: [] }, { oauthClient: { ...definition.oauthClient, clientSecret: 'private' } }]) {
    const original = record; record = { ...record, ...change };
    await assert.rejects(provision(prisma), /differs/); assert.equal(writes.length, 1); record = original;
  }
});
