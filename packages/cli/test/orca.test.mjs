import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerEnvironment, childProcess } from '../src/worker-runner.mjs';

test('dedicated children exclude Collab credentials and Orca routing without changing parent', async () => {
  const keys = ['COLLAB_TOKEN', 'COLLAB_CONFIG_DIR', 'ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING'];
  const saved = new Map(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) process.env[key] = 'synthetic-private';
    const env = workerEnvironment();
    assert.ok(keys.every(key => !Object.hasOwn(env, key)));
    const result = await childProcess(process.execPath, ['-e', `console.log(JSON.stringify(${JSON.stringify(keys)}.map(key=>Object.hasOwn(process.env,key))))`]);
    assert.deepEqual(JSON.parse(result.output), keys.map(() => false));
    assert.ok(keys.every(key => process.env[key] === 'synthetic-private'));
  } finally { for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
