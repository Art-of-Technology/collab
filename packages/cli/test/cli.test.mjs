import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, chmodSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { commands } from '../src/commands.mjs';

const bin = fileURLToPath(new URL('../bin/collab.mjs', import.meta.url));
async function fixture(t, handler) {
  const dir = mkdtempSync(path.join(tmpdir(), 'collab-cli-test-'));
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    res.setHeader('content-type', 'application/json');
    if (handler) await handler(req, res, body, calls); else res.end(JSON.stringify({ ok: true }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  function run(args, { input, env = {}, stderrCallback } = {}) {
    const childEnv = { ...process.env };
    for (const key of Object.keys(childEnv)) if (key.startsWith('COLLAB_')) delete childEnv[key];
    const child = spawn(process.execPath, [bin, ...args], { env: { ...childEnv, COLLAB_CONFIG_DIR: dir, COLLAB_URL: url, COLLAB_TOKEN: 'synthetic-token', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; stderrCallback?.(stderr); });
    child.stdin.end(input);
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    return once(child, 'close').then(([code, signal]) => { clearTimeout(timer); return { code, signal, stdout, stderr, data: stdout ? JSON.parse(stdout) : undefined, error: stderr.startsWith('{') ? JSON.parse(stderr) : undefined }; });
  }
  return { run, dir, calls, url };
}

test('schema is offline, machine-readable and includes projects, issues and Notes', async t => {
  const f = await fixture(t);
  const result = await f.run(['schema']);
  assert.equal(result.code, 0); assert.ok(result.data.commands['notes update']); assert.ok(result.data.commands['projects create']); assert.ok(result.data.commands['issues create']);
  assert.equal(f.calls.length, 0); assert.equal(Object.keys(result.data.commands).length, Object.keys(commands).length);
});

test('actual entrypoint scopes filters to explicit workspace and project', async t => {
  const f = await fixture(t);
  assert.equal((await f.run(['issues', 'list', '--workspace', 'workspace-one', '--project', 'project-one', '--status', 'todo', '--limit', '25'])).code, 0);
  const call = f.calls[0], url = new URL(call.url, f.url);
  assert.equal(url.pathname, '/api/apps/auth/issues'); assert.equal(url.searchParams.get('workspaceId'), 'workspace-one'); assert.equal(url.searchParams.get('projectId'), 'project-one'); assert.equal(url.searchParams.get('status'), 'todo');
  assert.equal(call.headers.authorization, 'Bearer synthetic-token');
});

test('switching workspace cannot carry a saved project from another workspace', async t => {
  const f = await fixture(t);
  writeFileSync(path.join(f.dir, 'default.json'), JSON.stringify({ origin: f.url, accessToken: 'synthetic-token', expiresAt: Date.now() + 60000, workspace: 'old-space', project: 'old-project' }), { mode: 0o600 });
  const result = await f.run(['issues', 'list', '--workspace', 'new-space'], { env: { COLLAB_TOKEN: '' } });
  assert.equal(result.code, 0);
  const url = new URL(f.calls[0].url, f.url);
  assert.equal(url.searchParams.get('workspaceId'), 'new-space'); assert.equal(url.searchParams.has('projectId'), false);
});

test('project creation, issue updates and comments preserve exact supplied payloads', async t => {
  const f = await fixture(t);
  for (const [args, expectedPath, method, expectedBody] of [
    [['projects', 'create', '--name', 'Agent Project', '--slug', 'agent-project', '--issue-prefix', 'AGENT'], '/projects', 'POST', { name: 'Agent Project', slug: 'agent-project', issuePrefix: 'AGENT' }],
    [['issues', 'create', '--project', 'project-one', '--title', 'Investigate race', '--type', 'BUG'], '/issues', 'POST', { projectId: 'project-one', title: 'Investigate race', type: 'BUG' }],
    [['issues', 'update', 'AGENT-12', '--input', '-'], '/issues/AGENT-12', 'PATCH', { status: 'in_progress', assigneeId: null, labels: ['label-one'] }],
    [['comments', 'add', 'AGENT-12', '--content-file', '-'], '/issues/AGENT-12/comments', 'POST', { content: 'Evidence\n- tests passed\n' }],
  ]) {
    const input = args.includes('--input') ? JSON.stringify(expectedBody) : 'Evidence\n- tests passed\n';
    assert.equal((await f.run(args, { input })).code, 0);
    const call = f.calls.at(-1); assert.equal(call.url, `/api/apps/auth${expectedPath}`); assert.equal(call.method, method); assert.deepEqual(JSON.parse(call.body), expectedBody);
  }
});

test('Notes create uses project scope; updates do not silently move Notes', async t => {
  const f = await fixture(t);
  assert.equal((await f.run(['notes', 'create', '--title', 'Decision', '--content-file', '-', '--project', 'project-one', '--type', 'DECISION', '--is-ai-context', 'true'], { input: '# Decision\nUse Collab.\n' })).code, 0);
  assert.deepEqual(JSON.parse(f.calls[0].body), { title: 'Decision', content: '# Decision\nUse Collab.\n', type: 'DECISION', isAiContext: true, projectId: 'project-one', scope: 'PROJECT' });
  assert.equal((await f.run(['notes', 'update', 'note-one', '--project', 'project-other', '--content-file', '-'], { input: 'Updated' })).code, 0);
  assert.equal(f.calls[1].method, 'PUT'); assert.deepEqual(JSON.parse(f.calls[1].body), { content: 'Updated' });
});

test('issue page and Note offset pagination return all pages without partial output', async t => {
  const f = await fixture(t, (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.endsWith('issues')) { const page = Number(url.searchParams.get('page') || 1); res.end(JSON.stringify({ issues: [{ id: `issue-${page}` }], pagination: { page, pages: 2 } })); }
    else { const offset = Number(url.searchParams.get('offset') || 0); res.end(JSON.stringify({ context: [{ id: `note-${offset}` }], hasMore: offset === 0 })); }
  });
  const issues = await f.run(['issues', 'list', '--all']); assert.equal(issues.code, 0); assert.deepEqual(issues.data.issues.map(x => x.id), ['issue-1', 'issue-2']);
  const notes = await f.run(['notes', 'list', '--all']); assert.equal(notes.code, 0); assert.deepEqual(notes.data.context.map(x => x.id), ['note-0', 'note-1']); assert.equal(notes.data.snapshot, false);
});

test('invalid input, unsupported flags, empty identifiers and destructive omissions dispatch nothing', async t => {
  const f = await fixture(t);
  for (const args of [
    ['issues', 'delete', 'AGENT-1'], ['issues', 'update', 'AGENT-1'], ['issues', 'get', '../secret'],
    ['issues', 'list', '--limit', '0'], ['issues', 'list', '--limit', 'NaN'], ['issues', 'list', '--workspace', ''],
    ['projects', 'create', '--naem', 'typo'], ['notes', 'update', 'note-one', '--input', '-'],
    ['issues', 'list', '--workspace', 'a', '--workspace', 'b'], ['whoami', '--all'],
    ['notes', 'create', '--title', 'Secret', '--content', 'secret', '--type', 'CREDENTIALS'],
    ['notes', 'create', '--title', 'Personal', '--content', 'text', '--scope', 'PERSONAL'],
  ]) assert.notEqual((await f.run(args, { input: '{"authorId":"someone-else"}' })).code, 0, args.join(' '));
  assert.equal(f.calls.length, 0);
});

test('delete is explicit and dry-run never sends a request', async t => {
  const f = await fixture(t);
  const result = await f.run(['issues', 'delete', 'AGENT-1', '--yes', '--dry-run']);
  assert.equal(result.code, 0); assert.equal(result.data.method, 'DELETE'); assert.equal(f.calls.length, 0);
  assert.equal((await f.run(['relations', 'delete', 'AGENT-1', 'relation-one', '--yes'])).code, 0); assert.equal(f.calls[0].method, 'DELETE');
});

test('authorization failures are preserved, redacted, and never retried', async t => {
  for (const status of [401, 403, 409, 429, 500]) {
    const f = await fixture(t, (_req, res) => { res.writeHead(status); res.end(JSON.stringify({ error: 'PRIVATE_SENTINEL', error_description: 'password=PRIVATE_SENTINEL' })); });
    const result = await f.run(['issues', 'create', '--project', 'project-one', '--title', 'Test']);
    assert.notEqual(result.code, 0); assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes('PRIVATE_SENTINEL')); assert.equal(f.calls.length, 1);
    if (status === 500) assert.equal(result.error.error, 'outcome_unknown');
  }
});

test('HTML and empty success bodies are not accepted as successful writes', async t => {
  for (const body of ['<html>PRIVATE_SENTINEL</html>', '']) {
    const f = await fixture(t, (_req, res) => { res.setHeader('content-type', 'text/html'); res.end(body); });
    const result = await f.run(['notes', 'create', '--title', 'Test', '--content', 'Body']);
    assert.equal(result.error.error, 'outcome_unknown'); assert.ok(!result.stderr.includes('PRIVATE_SENTINEL')); assert.equal(f.calls.length, 1);
  }
});

test('redirects never forward bearer credentials', async t => {
  const target = await fixture(t);
  const source = await fixture(t, (_req, res) => { res.writeHead(302, { location: `${target.url}/capture` }); res.end(); });
  assert.notEqual((await source.run(['whoami'])).code, 0); assert.equal(target.calls.length, 0);
});

test('credential files are private, origins are bound, and tokens never appear in status', async t => {
  const f = await fixture(t), file = path.join(f.dir, 'default.json');
  writeFileSync(file, JSON.stringify({ origin: 'https://collab.example', accessToken: 'PRIVATE_TOKEN', refreshToken: 'PRIVATE_REFRESH', expiresAt: Date.now() + 60000 }), { mode: 0o600 });
  const env = { COLLAB_TOKEN: '' };
  assert.equal((await f.run(['whoami'], { env })).error.error, 'origin_mismatch');
  const status = await f.run(['auth', 'status'], { env }); assert.equal(status.code, 0); assert.ok(!status.stdout.includes('PRIVATE_'));
  chmodSync(file, 0o644); assert.notEqual((await f.run(['whoami'], { env })).code, 0); assert.equal(f.calls.length, 0);
  rmSync(file); symlinkSync('/nonexistent', file); assert.notEqual((await f.run(['whoami'], { env })).code, 0);
});

test('headless token requires an explicit origin and rejects non-loopback HTTP', async t => {
  const f = await fixture(t);
  assert.equal((await f.run(['whoami'], { env: { COLLAB_URL: '' } })).error.error, 'token_origin_required');
  assert.equal((await f.run(['whoami', '--url', 'http://example.com'])).error.error, 'invalid_origin');
  assert.equal(f.calls.length, 0);
});

test('explicit refresh verifies identity before saving and sends no refresh token to stdout', async t => {
  const f = await fixture(t, (req, res, body) => {
    if (req.url === '/api/oauth/mcp/token') {
      const form = new URLSearchParams(body);
      assert.equal(form.get('grant_type'), 'refresh_token'); assert.equal(form.get('refresh_token'), 'PRIVATE_REFRESH');
      res.end(JSON.stringify({ access_token: 'PRIVATE_ROTATED', token_type: 'Bearer', expires_in: 3600, workspace_id: 'workspace-one', scope: 'issues:read' }));
    } else res.end(JSON.stringify({ id: 'same-user' }));
  });
  const file = path.join(f.dir, 'default.json');
  writeFileSync(file, JSON.stringify({ origin: f.url, clientId: 'collab-cli', accessToken: 'expired', refreshToken: 'PRIVATE_REFRESH', expiresAt: 0, workspace: 'workspace-one' }), { mode: 0o600 });
  assert.equal((await f.run(['whoami'], { env: { COLLAB_TOKEN: '' } })).error.error, 'token_expired');
  const result = await f.run(['auth', 'refresh'], { env: { COLLAB_TOKEN: '' } });
  assert.equal(result.code, 0); assert.ok(!result.stdout.includes('PRIVATE_')); assert.equal(f.calls.length, 2);
  assert.equal(JSON.parse(readFileSync(file)).accessToken, 'PRIVATE_ROTATED');
});

test('read-only login requests no write scopes and denial stores no credentials', async t => {
  const f = await fixture(t); let callback;
  const result = await f.run(['auth', 'login', '--read-only'], { env: { COLLAB_TOKEN: '' }, stderrCallback: output => {
    if (callback) return;
    const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/auth\/mcp\?[^\s]+/); if (!match) return;
    const authorization = new URL(match[0]);
    assert.ok(authorization.searchParams.get('scope').split(' ').every(scope => scope.endsWith(':read')));
    const redirect = new URL(authorization.searchParams.get('redirect_uri'));
    redirect.search = new URLSearchParams({ error: 'access_denied', state: authorization.searchParams.get('state') });
    callback = fetch(redirect);
  } });
  await callback;
  assert.equal(result.code, 3); assert.equal(f.calls.length, 0); assert.throws(() => readFileSync(path.join(f.dir, 'default.json')), { code: 'ENOENT' });
});

test('timed-out mutation reports uncertain outcome after exactly one dispatch', async t => {
  const f = await fixture(t, () => {});
  const result = await f.run(['issues', 'update', 'AGENT-1', '--status', 'done', '--timeout', '1']);
  assert.equal(result.error.error, 'outcome_unknown'); assert.equal(result.stdout, ''); assert.equal(f.calls.length, 1);
});

test('actual login performs PKCE, rejects wrong state, verifies identity, stores private credentials', async t => {
  let authorization, verifier;
  const f = await fixture(t, (req, res, body) => {
    if (req.url === '/api/oauth/mcp/token') {
      const form = new URLSearchParams(body); verifier = form.get('code_verifier');
      assert.equal(form.get('grant_type'), 'authorization_code'); assert.equal(form.get('code'), 'synthetic-code'); assert.equal(form.get('client_id'), 'collab-cli');
      assert.equal(form.get('redirect_uri'), authorization.searchParams.get('redirect_uri'));
      res.end(JSON.stringify({ access_token: 'PRIVATE_ACCESS', refresh_token: 'PRIVATE_REFRESH', token_type: 'Bearer', expires_in: 3600, workspace_id: 'workspace-one', scope: 'issues:read context:write' }));
    } else res.end(JSON.stringify({ id: 'same-user', name: 'Synthetic user' }));
  });
  let callback;
  const result = await f.run(['auth', 'login'], { env: { COLLAB_TOKEN: '' }, stderrCallback: output => {
    if (callback) return;
    const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/auth\/mcp\?[^\s]+/); if (!match) return;
    authorization = new URL(match[0]);
    callback = (async () => {
      const redirect = new URL(authorization.searchParams.get('redirect_uri'));
      redirect.search = new URLSearchParams({ state: 'wrong', code: 'synthetic-code' });
      assert.equal((await fetch(redirect)).status, 400);
      redirect.searchParams.set('state', authorization.searchParams.get('state'));
      assert.equal((await fetch(redirect)).status, 200);
    })();
  } });
  await callback;
  assert.equal(result.code, 0, result.stderr); assert.equal(result.data.identity.id, 'same-user');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256'); assert.equal(authorization.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
  assert.ok(!result.stdout.includes('PRIVATE_')); assert.ok(!result.stderr.includes('PRIVATE_'));
  const file = path.join(f.dir, 'default.json'), stored = JSON.parse(readFileSync(file));
  assert.equal(stored.workspace, 'workspace-one'); assert.equal(stored.origin, f.url); assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal((await f.run(['auth', 'logout'], { env: { COLLAB_TOKEN: '' } })).data.serverRevocationConfirmed, false);
  assert.deepEqual(JSON.parse(readFileSync(file)), {});
});
