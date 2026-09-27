import { createHash } from 'node:crypto';

export const MEMORY_PATH = 'project-memory.md';
export const MEMORY_LIMIT = 512000;
export const memorySha = /^[a-f0-9]{40}$/;

export async function boundedJson(response) {
  if (!response.ok || !response.body) throw new Error('Project response unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Project response too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}

function connection(binding, token) {
  if (!binding.memory) throw new Error('Memory connection unavailable');
  return {
    base: `${binding.origin}/api/v1/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repository)}`,
    options: { headers: { Authorization: `token ${token}`, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) },
  };
}

// Shared by the read-only app and the isolated writer. Missing refs never authorize creation.
export async function readMemoryFile(binding, token, request = fetch) {
  const { base, options } = connection(binding, token);
  const repository = await boundedJson(await request(base, options));
  if (repository?.id !== binding.repositoryId) throw new Error('Memory repository identity changed');
  if (repository.empty === true && repository.default_branch !== binding.memory.branch)
    throw new Error('Memory branch is not the empty repository default');
  const response = await request(`${base}/contents/${MEMORY_PATH}?ref=${encodeURIComponent(binding.memory.branch)}`, options);
  if (response.status === 404) {
    await response.body?.cancel();
    if (repository.empty !== true) {
      const branch = await boundedJson(await request(`${base}/branches/${encodeURIComponent(binding.memory.branch)}`, options));
      if (branch?.name !== binding.memory.branch) throw new Error('Memory branch unavailable');
    }
    return { sha: null, content: null };
  }
  const payload = await boundedJson(response);
  if (repository.empty === true && Array.isArray(payload) && payload.length === 0) return { sha: null, content: null };
  if (!payload || payload.type !== 'file' || payload.path !== MEMORY_PATH || payload.target || payload.submodule_git_url ||
    payload.encoding !== 'base64' || typeof payload.content !== 'string' || typeof payload.sha !== 'string' ||
    !memorySha.test(payload.sha) || !Number.isInteger(payload.size) || payload.size > MEMORY_LIMIT || payload.size < 0)
    throw new Error('Invalid memory file');
  const encoded = payload.content.replace(/\n/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || bytes.length !== payload.size ||
    createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== payload.sha)
    throw new Error('Invalid memory content');
  return { sha: payload.sha, content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) };
}

export async function writeMemoryFile(binding, token, expectedSha, content, request = fetch) {
  if (expectedSha !== null && !memorySha.test(expectedSha)) throw new Error('Invalid revision');
  if (typeof content !== 'string' || Buffer.byteLength(content) > MEMORY_LIMIT ||
    Buffer.from(content).toString('utf8') !== content) throw new Error('Invalid content');
  const current = await readMemoryFile(binding, token, request);
  if (current.sha !== expectedSha) return { kind: 'conflict' };
  const { base, options } = connection(binding, token);
  try {
    const response = await request(`${base}/contents/${MEMORY_PATH}`, {
      ...options, method: expectedSha === null ? 'POST' : 'PUT',
      headers: { ...options.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: binding.memory.branch, ...(expectedSha === null ? {} : { sha: expectedSha }),
        content: Buffer.from(content).toString('base64'), message: 'Update approved project memory' }),
    });
    await response.body?.cancel();
    if (response.status === 409 || response.status === 422) return { kind: 'conflict' };
  } catch { /* A lost response may follow a commit. Never repeat the write. */ }
  try {
    const saved = await readMemoryFile(binding, token, request);
    if (saved.sha && saved.content === content) return { kind: 'saved', sha: saved.sha };
  } catch { /* Preserve uncertain outcome for caller readback. */ }
  return { kind: 'uncertain' };
}
