import 'server-only';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { projectForgeTask, type ForgeTask } from './tasks';

const identifier = z.string().min(1).max(200);
const segment = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/);
const bindingSchema = z.object({
  workspaceId: identifier,
  projectId: identifier,
  repositoryId: z.number().int().positive(),
  owner: segment,
  repository: segment,
  slackWorkspaceId: z.string().regex(/^T[A-Z0-9]+$/),
  slackChannelId: z.string().regex(/^[CG][A-Z0-9]+$/),
  readTokenFile: z.string().startsWith('/').max(1024),
}).strict();
const configSchema = z.object({
  origin: z.string().url().refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash;
  }, 'A credential-free HTTPS origin is required'),
  bindings: z.array(bindingSchema).max(100),
}).strict();
export type ForgeBinding = z.infer<typeof bindingSchema> & { origin: string };

export async function readForgeBindings(): Promise<ForgeBinding[]> {
  const file = process.env.COLLAB_FORGE_CONFIG_FILE;
  if (!file) return [];
  const raw = await readFile(file);
  if (raw.length > 65536) throw new Error('Invalid project connection configuration');
  const config = configSchema.parse(JSON.parse(raw.toString('utf8')));
  const projects = new Set<string>();
  const channels = new Set<string>();
  for (const binding of config.bindings) {
    const project = `${binding.workspaceId}/${binding.projectId}`;
    const channel = `${binding.slackWorkspaceId}/${binding.slackChannelId}`;
    if (projects.has(project) || channels.has(channel)) throw new Error('Duplicate project connection');
    projects.add(project);
    channels.add(channel);
  }
  return config.bindings.map(binding => ({ ...binding, origin: new URL(config.origin).origin }));
}

async function boundedJson(response: Response): Promise<unknown> {
  const maxBytes = 2 * 1024 * 1024;
  if (!response.ok || !response.body) throw new Error('Could not read project issues');
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body.cancel();
    throw new Error('Project response is too large');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Project response is too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function readForgeIssues(binding: ForgeBinding, request: typeof fetch = fetch): Promise<{
  tasks: ForgeTask[]; truncated: boolean; fetchedAt: string;
}> {
  const token = (await readFile(binding.readTokenFile, 'utf8')).trim();
  if (!token || token.length > 4096 || /\s/.test(token)) throw new Error('Project credentials unavailable');
  const base = `${binding.origin}/api/v1/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repository)}`;
  const signal = AbortSignal.timeout(15000);
  const get = async (path: string) => boundedJson(await request(base + path, {
    headers: { Authorization: `token ${token}`, Accept: 'application/json' },
    cache: 'no-store', redirect: 'error', signal,
  }));
  const repository = await get('') as { id?: unknown };
  if (!repository || repository.id !== binding.repositoryId) throw new Error('Project connection no longer matches its repository');
  const tasks: ForgeTask[] = [];
  const seen = new Set<number>();
  for (let page = 1; page <= 20; page++) {
    const issues = await get(`/issues?state=all&type=issues&limit=50&page=${page}`);
    if (!Array.isArray(issues) || issues.length > 50) throw new Error('Invalid project response');
    for (const issue of issues) {
      if (issue && typeof issue === 'object' && issue.pull_request) continue;
      const task = projectForgeTask(issue);
      if (!task) throw new Error('Invalid issue in project response');
      if (!seen.has(task.number)) { tasks.push(task); seen.add(task.number); }
    }
    if (issues.length < 50) return { tasks, truncated: false, fetchedAt: new Date().toISOString() };
  }
  return { tasks, truncated: true, fetchedAt: new Date().toISOString() };
}
