const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { resolve, join, dirname } = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');

// Run the real Next compiler and RSC serializer with fixture session/data only.
// DOM-only rendering misses function props crossing a server/client boundary.
test('the board Project notes link renders its destination for a member', { timeout: 120000 }, async t => {
  const root = resolve(__dirname, '../..');
  const fixture = mkdtempSync(join(root, '.notes-render-'));
  const write = (file, content) => {
    const path = join(fixture, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  let server;
  t.after(async () => {
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await exited;
    }
    rmSync(fixture, { recursive: true, force: true });
  });
  const source = join(root, 'src');
  const page = 'app/(main)/[workspaceId]/projects/[projectSlug]';
  write('package.json', JSON.stringify({ private: true }));
  write('tsconfig.json', JSON.stringify({ compilerOptions: { jsx: 'react-jsx', allowJs: true, paths: { '@/*': [source + '/*'] } } }));
  write('postcss.config.js', 'module.exports = { plugins: {} };');
  write('next.config.js', `module.exports = { agentRules: false, webpack(config) {
    config.resolve.alias = {
      'next-auth$': ${JSON.stringify(join(fixture, 'data.js'))},
      '@/lib/auth$': ${JSON.stringify(join(fixture, 'data.js'))},
      '@/lib/prisma$': ${JSON.stringify(join(fixture, 'data.js'))},
      '@/lib/slug-resolvers$': ${JSON.stringify(join(fixture, 'data.js'))},
      '@/lib/forge/board$': ${JSON.stringify(join(fixture, 'data.js'))},
      '@': ${JSON.stringify(source)},
      ...config.resolve.alias,
    };
    return config;
  } };`);
  write('data.js', `
    export const authConfig = {};
    export const getServerSession = async () => ({ user: { id: 'member', email: 'member@example.test' } });
    export const resolveWorkspaceSlug = async () => 'workspace';
    export const prisma = {
      workspace: { findFirst: async () => ({ id: 'workspace', slug: 'test' }) },
      project: { findFirst: async () => ({ id: 'project', name: 'Test project', slug: 'demo' }) },
      user: { findUnique: async () => ({ id: 'member' }) },
    };
    export const loadForgeBoard = async () => ({ kind: 'not-connected', projectName: 'Test project' });
  `);
  write('app/layout.jsx', 'export default function Layout({children}) { return <html><body>{children}</body></html>; }');
  for (const route of ['board', 'notes']) {
    write(`app/[workspaceId]/projects/[projectSlug]/${route}/page.jsx`,
      `export { default } from ${JSON.stringify(join(source, page, route, 'page.tsx'))};`);
  }
  write('app/api/notes/route.js', 'export function GET() { return Response.json([]); }');
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  let logs = '';
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', fixture, '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolveUrl, reject) => {
    const collect = chunk => {
      logs += chunk;
      const match = logs.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match && /Ready in/.test(logs)) resolveUrl(match[0]);
    };
    server.stdout.on('data', collect);
    server.stderr.on('data', collect);
    server.once('error', reject);
    server.once('exit', () => reject(new Error(logs)));
  });
  const board = await (await fetch(`${url}/test/projects/demo/board`).catch(error => { throw new Error(`${url}: ${error.cause}`, { cause: error }); })).text();
  const href = board.match(/href="([^"]+)"[^>]*>Project notes<\/a>/)?.[1];
  assert.equal(href, '/test/projects/demo/notes', logs);
  const response = await fetch(new URL(href, url));
  const html = await response.text();
  assert.equal(response.status, 200, logs);
  assert.doesNotMatch(html, /Functions cannot be passed directly to Client Components|"digest"\s*:/, logs);
  assert.match(html, /<h1[^>]*>Project Context<\/h1>/);
  assert.match(html, /Documentation and context for Test project/);
  assert.match(html, /href="\/test\/notes\/new\?projectId=project"/);
  assert.match(html, /lucide-file-text/);
});
