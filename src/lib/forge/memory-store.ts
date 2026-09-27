import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { boundedJson, type ForgeBinding } from './reader';
import { parseMemory, serializeMemory, type ProjectMemory } from './memory';

const file = 'project-memory.md';
const shaPattern = /^[a-f0-9]{40}$/;
export type MemorySnapshot = { sha: string | null; document: ProjectMemory };
export type MemoryWrite = { kind: 'saved'; snapshot: MemorySnapshot } | { kind: 'conflict' | 'uncertain' };

async function tokenFrom(file: string): Promise<string> {
  const token = (await readFile(file, 'utf8')).trim();
  if (!token || token.length > 4096 || /\s/.test(token)) throw new Error('Memory credentials unavailable');
  return token;
}

async function connection(binding: ForgeBinding, request: typeof fetch) {
  if (!binding.memory) throw new Error('Memory connection is not ready');
  const token = await tokenFrom(binding.readTokenFile);
  const base = `${binding.origin}/api/v1/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repository)}`;
  const signal = AbortSignal.timeout(15000);
  const options = { headers: { Authorization: `token ${token}`, Accept: 'application/json' },
    cache: 'no-store' as const, redirect: 'error' as const, signal };
  const repository = await boundedJson(await request(base, options)) as { id?: unknown };
  if (repository?.id !== binding.repositoryId) throw new Error('Memory repository identity changed');
  return { base, options };
}

export async function readProjectMemory(binding: ForgeBinding, request: typeof fetch = fetch): Promise<MemorySnapshot> {
  const { base, options } = await connection(binding, request);
  const response = await request(`${base}/contents/${file}?ref=${encodeURIComponent(binding.memory!.branch)}`, options);
  if (response.status === 404) {
    await response.body?.cancel();
    return { sha: null, document: { version: 1, projectId: binding.projectId, revisions: [] } };
  }
  const payload = await boundedJson(response) as Record<string, unknown>;
  if (!payload || payload.type !== 'file' || payload.path !== file || payload.target || payload.submodule_git_url ||
    payload.encoding !== 'base64' || typeof payload.content !== 'string' || typeof payload.sha !== 'string' ||
    !shaPattern.test(payload.sha) || typeof payload.size !== 'number' || payload.size > 512000 || payload.size < 0)
    throw new Error('Invalid memory file');
  const encoded = payload.content.replace(/\n/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || bytes.length !== payload.size ||
    createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== payload.sha)
    throw new Error('Invalid memory content');
  const markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { sha: payload.sha, document: parseMemory(markdown, binding.projectId) };
}

// No caller-controlled paths, methods, branch, author, arbitrary payload or force-push option.
export async function writeProjectMemory(binding: ForgeBinding, expectedSha: string | null,
  document: ProjectMemory, request: typeof fetch = fetch): Promise<MemoryWrite> {
  if (expectedSha !== null && !shaPattern.test(expectedSha)) throw new Error('Invalid memory revision');
  if (!binding.memory || binding.memory.writeTokenFile === binding.readTokenFile) throw new Error('A separate memory writer is required');
  if (document.projectId !== binding.projectId) throw new Error('Memory project mismatch');
  const markdown = serializeMemory(document);
  const current = await readProjectMemory(binding, request);
  if (current.sha !== expectedSha) return { kind: 'conflict' };
  const writer = await tokenFrom(binding.memory.writeTokenFile);
  if (writer === await tokenFrom(binding.readTokenFile)) throw new Error('A separate memory writer is required');
  const base = `${binding.origin}/api/v1/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repository)}`;
  try {
    const response = await request(`${base}/contents/${file}`, {
      method: expectedSha === null ? 'POST' : 'PUT', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `token ${writer}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: binding.memory.branch, ...(expectedSha === null ? {} : { sha: expectedSha }),
        content: Buffer.from(markdown).toString('base64'), message: 'Update approved project memory' }),
    });
    await response.body?.cancel();
    if (response.status === 409 || response.status === 422) return { kind: 'conflict' };
  } catch {
    // A lost response can follow a committed write. Verify instead of repeating it.
  }
  try {
    const snapshot = await readProjectMemory(binding, request);
    if (snapshot.sha && serializeMemory(snapshot.document) === markdown) return { kind: 'saved', snapshot };
  } catch { /* Readback is unavailable; retain the user's unsaved draft. */ }
  return { kind: 'uncertain' };
}
