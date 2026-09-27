import 'server-only';
import { readFile } from 'node:fs/promises';
import { type ForgeBinding } from './reader';
import { readMemoryFile, memorySha } from './memory-file.mjs';
import { parseMemory, serializeMemory, type ProjectMemory } from './memory';

export type MemorySnapshot = { sha: string | null; document: ProjectMemory };
export type MemoryWrite = { kind: 'saved'; snapshot: MemorySnapshot } | { kind: 'conflict' | 'uncertain' };

async function tokenFrom(file: string): Promise<string> {
  const token = (await readFile(file, 'utf8')).trim();
  if (!token || token.length > 4096 || /\s/.test(token)) throw new Error('Memory credentials unavailable');
  return token;
}

export async function readProjectMemory(binding: ForgeBinding, request: typeof fetch = fetch): Promise<MemorySnapshot> {
  const snapshot = await readMemoryFile(binding, await tokenFrom(binding.readTokenFile), request);
  return { sha: snapshot.sha, document: snapshot.content === null
    ? { version: 1, projectId: binding.projectId, revisions: [] }
    : parseMemory(snapshot.content, binding.projectId) };
}

// No caller-controlled paths, methods, branch, author, arbitrary payload or force-push option.
export async function writeProjectMemory(binding: ForgeBinding, expectedSha: string | null,
  document: ProjectMemory, request: typeof fetch = fetch): Promise<MemoryWrite> {
  if (expectedSha !== null && !memorySha.test(expectedSha)) throw new Error('Invalid memory revision');
  if (!binding.memory || binding.memory.serviceTokenFile === binding.readTokenFile) throw new Error('An isolated memory writer is required');
  if (document.projectId !== binding.projectId) throw new Error('Memory project mismatch');
  const markdown = serializeMemory(document);
  const current = await readProjectMemory(binding, request);
  if (current.sha !== expectedSha) return { kind: 'conflict' };
  const writer = await tokenFrom(binding.memory.serviceTokenFile);
  if (writer === await tokenFrom(binding.readTokenFile)) throw new Error('A separate memory writer is required');
  try {
    const response = await request(new URL('/v1/project-memory', binding.memory.writerOrigin).href, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${writer}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: binding.projectId, repositoryId: binding.repositoryId, expectedSha, content: markdown }),
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
