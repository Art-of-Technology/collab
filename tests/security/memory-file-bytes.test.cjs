const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const binding = { origin: 'https://forge.example.test', owner: 'Space', repository: 'team-space',
  repositoryId: 4, memory: { branch: 'main' } };
const payload = content => {
  const bytes = Buffer.from(content);
  return { type: 'file', path: 'project-memory.md', encoding: 'base64', size: bytes.length,
    content: bytes.toString('base64'),
    sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
};

test('verified UTF-8 file bytes retain a leading BOM for the document parser', async () => {
  const { readMemoryFile } = await import('../../src/lib/forge/memory-file.mjs');
  const content = '\uFEFF# Project memory\n';
  const stored = payload(content);
  const result = await readMemoryFile(binding, 'synthetic-token', async url =>
    Response.json(url.endsWith('/team-space') ? { id: 4 } : stored));
  assert.equal(result.sha, stored.sha);
  assert.equal(result.content, content);
});

test('lost write reply cannot confirm readback with different BOM bytes', async () => {
  const { writeMemoryFile } = await import('../../src/lib/forge/memory-file.mjs');
  let stored = null, writes = 0;
  const result = await writeMemoryFile(binding, 'synthetic-token', null, '# Project memory\n', async (url, options) => {
    if (url.endsWith('/team-space')) return Response.json({ id: 4, empty: !stored, default_branch: 'main' });
    if (!options.method) return Response.json(stored || []);
    writes++;
    assert.equal(options.method, 'POST');
    const command = JSON.parse(options.body);
    stored = payload('\uFEFF' + Buffer.from(command.content, 'base64').toString('utf8'));
    throw new Error('Synthetic lost reply after a different write');
  });
  assert.deepEqual(result, { kind: 'uncertain' });
  assert.equal(writes, 1);
});
