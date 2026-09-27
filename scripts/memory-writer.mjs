import { createServer } from 'node:https';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BlockList, isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { MEMORY_LIMIT, memorySha, writeMemoryFile } from '../src/lib/forge/memory-file.mjs';

const hash = value => createHash('sha256').update(value).digest();
const forbiddenHosts = new BlockList();
forbiddenHosts.addAddress('0.0.0.0');
forbiddenHosts.addAddress('255.255.255.255');
forbiddenHosts.addAddress('::', 'ipv6');
const keysAre = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function memoryWriterHandler({ origin, projectId, forgeToken, serviceToken }, request = fetch) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    typeof projectId !== 'string' || !projectId || projectId.length > 200 ||
    typeof forgeToken !== 'string' || !forgeToken || forgeToken.length > 4096 || /\s/.test(forgeToken) ||
    typeof serviceToken !== 'string' || serviceToken.length < 32 || serviceToken.length > 4096 || /\s/.test(serviceToken) ||
    timingSafeEqual(hash(forgeToken), hash(serviceToken))) throw new Error('Invalid writer configuration');
  const binding = { origin: url.origin, owner: 'Space', repository: 'team-space', repositoryId: 4, memory: { branch: 'main' } };
  const credential = hash(`Bearer ${serviceToken}`);
  return async (req, res) => {
    const reply = (status, kind) => {
      if (res.headersSent || res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ kind }));
    };
    if (req.method === 'GET' && req.url === '/health') return reply(200, 'ready');
    if (req.method !== 'POST' || req.url !== '/v1/project-memory') return reply(404, 'unavailable');
    const authorizationCount = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'authorization').length;
    if (authorizationCount !== 1 || !timingSafeEqual(hash(req.headers.authorization ?? ''), credential)) return reply(401, 'denied');
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) return reply(415, 'invalid');
    // JSON can escape each content byte as six characters; the decoded file has its own smaller limit.
    const maxBody = MEMORY_LIMIT * 6 + 4096;
    if (Number(req.headers['content-length']) > maxBody) return reply(413, 'invalid');
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBody) { reply(413, 'invalid'); req.destroy(); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { return reply(400, 'invalid'); }
      if (!keysAre(body, ['projectId', 'repositoryId', 'expectedSha', 'content']) || body.projectId !== projectId || body.repositoryId !== 4 ||
        (body.expectedSha !== null && (typeof body.expectedSha !== 'string' || !memorySha.test(body.expectedSha))) ||
        typeof body.content !== 'string' || Buffer.byteLength(body.content) > MEMORY_LIMIT || Buffer.from(body.content).toString('utf8') !== body.content)
        return reply(400, 'invalid');
      const result = await writeMemoryFile(binding, forgeToken, body.expectedSha, body.content, request);
      reply(result.kind === 'conflict' ? 409 : result.kind === 'saved' ? 200 : 503, result.kind);
    } catch { reply(503, 'uncertain'); }
  };
}

export async function startMemoryWriter(configPath = process.env.COLLAB_MEMORY_WRITER_CONFIG_FILE) {
  if (!configPath?.startsWith('/')) throw new Error('Writer config file required');
  const bytes = await readFile(configPath);
  if (bytes.length > 16384) throw new Error('Invalid writer configuration');
  const config = JSON.parse(bytes.toString('utf8'));
  if (!keysAre(config, ['origin', 'projectId', 'forgeTokenFile', 'serviceTokenFile', 'certificateFile', 'keyFile', 'host', 'port']) ||
    ['forgeTokenFile', 'serviceTokenFile', 'certificateFile', 'keyFile'].some(key => typeof config[key] !== 'string' || !config[key].startsWith('/')) ||
    !isIP(config.host) || forbiddenHosts.check(config.host, isIP(config.host) === 6 ? 'ipv6' : 'ipv4') ||
    !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('Invalid writer configuration');
  const [forgeToken, serviceToken, cert, key] = await Promise.all([
    readFile(config.forgeTokenFile, 'utf8'), readFile(config.serviceTokenFile, 'utf8'),
    readFile(config.certificateFile), readFile(config.keyFile),
  ]);
  const server = createServer({ cert, key, minVersion: 'TLSv1.2', requestTimeout: 20000, headersTimeout: 5000, maxHeaderSize: 8192 },
    memoryWriterHandler({ origin: config.origin, projectId: config.projectId, forgeToken: forgeToken.trim(), serviceToken: serviceToken.trim() }));
  server.maxConnections = 32;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startMemoryWriter().catch(() => { console.error('Memory writer could not start'); process.exitCode = 1; });
}
