const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

test('isolated HTTPS writer rejects widened authority and retains native create/CAS/readback semantics', async t => {
  const { memoryWriterHandler } = await import('../../scripts/memory-writer.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-isolated-writer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', path.join(dir, 'key'), '-out', path.join(dir, 'cert')], { stdio: 'ignore' });
  const cert = fs.readFileSync(path.join(dir, 'cert'));
  const serviceToken = 'local-service-credential-not-a-forge-token';
  const forgeToken = 'local-forge-token-never-sent-to-the-app';
  let stored = null, writes = 0, calls = 0, mode = '';
  const payload = content => {
    const bytes = Buffer.from(content);
    return { type: 'file', path: 'project-memory.md', encoding: 'base64', size: bytes.length,
      content: bytes.toString('base64'), sha: crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
  };
  const upstream = async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, `token ${forgeToken}`);
    assert.equal(options.redirect, 'error');
    assert.ok(url.startsWith('https://forge.example.test/api/v1/repos/Space/team-space'));
    if (url.endsWith('/team-space')) return Response.json({ id: mode === 'repo' ? 5 : 4, empty: !stored,
      default_branch: mode === 'branch' ? 'wrong' : 'main' });
    if (!options.method) {
      assert.ok(url.endsWith('/contents/project-memory.md?ref=main'));
      if (mode === 'directory') return Response.json([{ type: 'file' }]);
      if (mode === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://other.test/' } });
      return Response.json(stored || []);
    }
    writes++;
    assert.ok(url.endsWith('/contents/project-memory.md'));
    const body = JSON.parse(options.body);
    assert.equal(body.branch, 'main');
    assert.deepEqual(Object.keys(body).sort(), (stored ? ['branch', 'content', 'message', 'sha'] : ['branch', 'content', 'message']).sort());
    assert.equal(options.method, stored ? 'PUT' : 'POST');
    if (mode === 'conflict' || (stored && stored.sha !== body.sha)) return new Response(null, { status: 409 });
    if (mode === 'offline') throw new Error('Synthetic transport failure');
    stored = payload(Buffer.from(body.content, 'base64').toString());
    if (mode === 'lost') throw new Error('Synthetic response lost after commit');
    return Response.json({ content: stored });
  };
  const handler = memoryWriterHandler({ origin: 'https://forge.example.test', projectId: 'project', forgeToken, serviceToken }, upstream);
  const server = https.createServer({ key: fs.readFileSync(path.join(dir, 'key')), cert }, handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const send = (body, { token = `Bearer ${serviceToken}`, route = '/v1/project-memory', method = 'POST', raw } = {}) => new Promise((resolve, reject) => {
    const bytes = Buffer.from(raw ?? JSON.stringify(body));
    const req = https.request({ hostname: '127.0.0.1', port: server.address().port, path: route, method, ca: cert,
      headers: { Authorization: token, 'Content-Type': 'application/json', 'Content-Length': bytes.length } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end(bytes);
  });
  const command = (expectedSha = null, content = '# Project memory\n') => ({ projectId: 'project', repositoryId: 4, expectedSha, content });
  for (const [body, options, status] of [
    [command(), { token: 'Bearer wrong' }, 401],
    [command(), { token: [`Bearer ${serviceToken}`, `Bearer ${serviceToken}`] }, 401],
    [command(), { route: '/v1/project-memory?ref=other' }, 404],
    [command(), { route: '/api/v1/repos/Space/team-space/contents/other.md' }, 404],
    [command(), { method: 'PUT' }, 404],
    [{ ...command(), branch: 'other' }, {}, 400],
    [{ ...command(), path: '../code.ts' }, {}, 400],
    [{ ...command(), repositoryId: 5 }, {}, 400],
    [{ ...command(), projectId: 'other' }, {}, 400],
    [command('bad'), {}, 400],
    [command(null, 'x'.repeat(512001)), {}, 400],
    [command(), { raw: '{' }, 400],
    [command(), { raw: 'x'.repeat(512000 * 6 + 4097) }, 413],
  ]) assert.equal((await send(body, options)).status, status);
  assert.equal(calls, 0); assert.equal(writes, 0);
  for (const invalid of ['repo', 'branch', 'directory', 'redirect']) {
    mode = invalid; assert.equal((await send(command())).status, 503);
  }
  assert.equal(writes, 0);
  mode = '';
  const first = await send(command());
  assert.equal(first.status, 200); assert.deepEqual(JSON.parse(first.text), { kind: 'saved' });
  assert.equal(writes, 1);
  assert.equal((await send(command())).status, 409); assert.equal(writes, 1);
  const sha = stored.sha;
  mode = 'conflict'; assert.equal((await send(command(sha, 'Changed'))).status, 409);
  mode = 'offline'; assert.equal((await send(command(sha, 'Changed'))).status, 503);
  mode = 'lost'; assert.equal((await send(command(sha, 'Changed'))).status, 200);
  assert.equal(writes, 4); // Each attempted save sends at most one Forge mutation.
  mode = '';
  const concurrentSha = stored.sha;
  const outcomes = await Promise.all([send(command(concurrentSha, 'One')), send(command(concurrentSha, 'Two'))]);
  assert.deepEqual(outcomes.map(x => x.status).sort(), [200, 409]);
  assert.ok(writes >= 5 && writes <= 6);
  assert.ok(!outcomes.some(x => x.text.includes(forgeToken) || x.text.includes(serviceToken)));
  assert.throws(() => memoryWriterHandler({ origin: 'http://forge.test', projectId: 'project', forgeToken, serviceToken }));
  assert.throws(() => memoryWriterHandler({ origin: 'https://forge.test', projectId: 'project', forgeToken: serviceToken, serviceToken }));
});
