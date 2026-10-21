import 'server-only';
import { z } from 'zod';

export const providerSchema = z.enum(['github', 'forgejo', 'gitlab', 'bitbucket', 'bitbucket-dc']);
export type Provider = z.infer<typeof providerSchema>;
export interface Instance { provider: Provider; baseUrl: string; label: string }
export interface Credentials { token: string; username?: string }
export interface GitRepository { id: string; path: string; name: string; url: string }
export interface GitActivity { id: string; kind: 'commit' | 'pull_request'; title: string; url: string; date: string; state?: string }
export class ProviderError extends Error {}

const cloud: Instance[] = [
  { provider: 'github', baseUrl: 'https://github.com', label: 'GitHub' },
  { provider: 'forgejo', baseUrl: 'https://codeberg.org', label: 'Codeberg (Forgejo)' },
  { provider: 'gitlab', baseUrl: 'https://gitlab.com', label: 'GitLab.com' },
  { provider: 'bitbucket', baseUrl: 'https://bitbucket.org', label: 'Bitbucket Cloud' },
];
const instanceSchema = z.object({ provider: providerSchema, baseUrl: z.string().url(), label: z.string().min(1).max(100) });

export function instances(): Instance[] {
  const configured = z.array(instanceSchema).max(50).parse(JSON.parse(process.env.GIT_PROVIDER_INSTANCES || '[]'));
  return [...cloud, ...configured.map(instance => {
    const url = new URL(instance.baseUrl);
    // Config is operator-owned: only these exact instances may receive credentials.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /[%\\]/.test(instance.baseUrl)) {
      throw new Error('Invalid Git provider instance configuration');
    }
    if (instance.provider === 'bitbucket' && instance.baseUrl !== 'https://bitbucket.org') {
      throw new Error('Use bitbucket-dc for self-hosted Bitbucket');
    }
    return { ...instance, baseUrl: url.href.replace(/\/$/, '') };
  })];
}
export function resolveInstance(provider: Provider, baseUrl: string): Instance {
  const found = instances().find(i => i.provider === provider && i.baseUrl === baseUrl);
  if (!found) throw new ProviderError('This Git server has not been configured by an administrator.');
  return found;
}
const segment = (value: string) => encodeURIComponent(value);
function repoPath(path: string): string {
  const parts = path.split('/');
  if (parts.length < 2 || parts.some(p => !p || p === '.' || p === '..' || /[\\?#\x00-\x20]/.test(p))) throw new ProviderError('Invalid repository path.');
  return parts.map(segment).join('/');
}
function apiBase(i: Instance) {
  if (i.provider === 'github') return i.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${i.baseUrl}/api/v3`;
  if (i.provider === 'bitbucket') return 'https://api.bitbucket.org/2.0';
  return i.baseUrl + ({ forgejo: '/api/v1', gitlab: '/api/v4', 'bitbucket-dc': '/rest/api/1.0' } as const)[i.provider];
}
async function request(i: Instance, credentials: Credentials, path: string, emptyRepository = false): Promise<unknown> {
  resolveInstance(i.provider, i.baseUrl);
  if (!credentials.token || credentials.token.length > 8192 || /[\r\n]/.test(credentials.token)) throw new ProviderError('Enter a valid access token.');
  const authorization = i.provider === 'bitbucket' && credentials.username
    ? `Basic ${Buffer.from(`${credentials.username}:${credentials.token}`).toString('base64')}`
    : `${i.provider === 'forgejo' ? 'token' : 'Bearer'} ${credentials.token}`;
  let response: Response;
  try {
    response = await fetch(apiBase(i) + path, {
      headers: { Authorization: authorization, Accept: 'application/json' },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new ProviderError('The Git server could not be reached. Check the instance and try again.'); }
  if (emptyRepository && response.status === 409) { await response.body?.cancel(); return []; }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) throw new ProviderError('The Git server denied access. Check token permissions or reconnect with a new token.');
    if (response.status === 404) throw new ProviderError('Repository not found or not accessible with this token.');
    throw new ProviderError('The Git server could not complete the request. Try again later.');
  }
  // Bound payloads before parsing; provider error bodies and tokens never reach clients/logs.
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('The Git server returned an empty response.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw new Error('oversize'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new ProviderError('The Git server returned an invalid or oversized response.'); }
}
const id = z.union([z.string().min(1), z.number().int()]).transform(String);
const date = z.string().refine(value => Number.isFinite(Date.parse(value)), 'Invalid date');
const link = z.string().url();
function safeLink(value: string, instance: Instance): string {
  const url = new URL(value);
  if (url.origin !== new URL(instance.baseUrl).origin || url.protocol !== 'https:' || url.username || url.password) throw new ProviderError('The Git server returned an invalid link.');
  return url.href;
}
const githubRepo = z.object({ id, full_name: z.string(), name: z.string(), html_url: link });
const gitlabRepo = z.object({ id, path_with_namespace: z.string(), name: z.string(), web_url: link });
const bitbucketRepo = z.object({ uuid: id, full_name: z.string(), name: z.string(), links: z.object({ html: z.object({ href: link }) }) });
const dcRepo = z.object({ id, slug: z.string(), name: z.string(), project: z.object({ key: z.string() }), links: z.object({ self: z.array(z.object({ href: link })).min(1) }) });
function repository(raw: unknown, i: Instance): GitRepository {
  let result: GitRepository;
  if (i.provider === 'gitlab') { const r = gitlabRepo.parse(raw); result = { id: r.id, path: r.path_with_namespace, name: r.name, url: r.web_url }; }
  else if (i.provider === 'bitbucket') { const r = bitbucketRepo.parse(raw); result = { id: r.uuid, path: r.full_name, name: r.name, url: r.links.html.href }; }
  else if (i.provider === 'bitbucket-dc') { const r = dcRepo.parse(raw); result = { id: r.id, path: `${r.project.key}/${r.slug}`, name: r.name, url: r.links.self[0].href }; }
  else { const r = githubRepo.parse(raw); result = { id: r.id, path: r.full_name, name: r.name, url: r.html_url }; }
  repoPath(result.path); result.url = safeLink(result.url, i); return result;
}
function repositoryEndpoint(i: Instance, path: string) {
  const encoded = repoPath(path);
  if (i.provider === 'gitlab') return `/projects/${segment(path)}`;
  if (path.split('/').length !== 2) throw new ProviderError('Use an owner/project and repository name.');
  if (i.provider === 'bitbucket') return `/repositories/${encoded}`;
  if (i.provider === 'bitbucket-dc') { const [project, repo] = encoded.split('/'); return `/projects/${project}/repos/${repo}`; }
  return `/repos/${encoded}`;
}
export async function getRepository(i: Instance, credentials: Credentials, path: string) {
  return repository(await request(i, credentials, repositoryEndpoint(i, path)), i);
}
export async function listRepositories(i: Instance, credentials: Credentials, page = 1, workspace = '') {
  if (!Number.isInteger(page) || page < 1 || page > (i.provider === 'bitbucket-dc' ? 3001 : 100)) throw new ProviderError('Invalid repository page.');
  let path: string;
  if (i.provider === 'github') path = `/user/repos?per_page=30&page=${page}&sort=updated`;
  else if (i.provider === 'forgejo') path = `/user/repos?limit=30&page=${page}`;
  else if (i.provider === 'gitlab') path = `/projects?membership=true&simple=true&per_page=30&page=${page}&order_by=last_activity_at`;
  else if (i.provider === 'bitbucket') {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(workspace)) throw new ProviderError('Enter the Bitbucket workspace slug.');
    path = `/repositories/${segment(workspace)}?pagelen=30&page=${page}`;
  } else path = `/repos?limit=30&start=${page - 1}`;
  const raw = await request(i, credentials, path);
  if (i.provider === 'bitbucket') {
    const data = z.object({ values: z.array(z.unknown()), next: z.string().optional() }).parse(raw);
    return { repositories: data.values.map(r => repository(r, i)), nextPage: data.next ? page + 1 : null };
  }
  if (i.provider === 'bitbucket-dc') {
    const data = z.object({ values: z.array(z.unknown()), isLastPage: z.boolean(), nextPageStart: z.number().int().nonnegative().optional() }).parse(raw);
    return { repositories: data.values.map(r => repository(r, i)), nextPage: data.isLastPage ? null : (data.nextPageStart ?? 0) + 1 };
  }
  const data = z.array(z.unknown()).max(100).parse(raw);
  return { repositories: data.map(r => repository(r, i)), nextPage: data.length === 30 ? page + 1 : null };
}

export async function getActivity(i: Instance, credentials: Credentials, path: string): Promise<GitActivity[]> {
  const base = repositoryEndpoint(i, path);
  const isLab = i.provider === 'gitlab', isCloud = i.provider === 'bitbucket', isDC = i.provider === 'bitbucket-dc';
  const commitQuery = isLab ? '/repository/commits?per_page=20' : isCloud ? '/commits?pagelen=20' : isDC ? '/commits?limit=20' : '/commits?limit=20&per_page=20';
  const pullQuery = isLab ? '/merge_requests?scope=all&state=all&per_page=20&order_by=updated_at' : isCloud ? '/pullrequests?pagelen=20&sort=-updated_on&state=OPEN&state=MERGED&state=DECLINED' : isDC ? '/pull-requests?state=ALL&limit=20&order=NEWEST' : '/pulls?state=all&sort=updated&limit=20&per_page=20';
  const [commitsRaw, pullsRaw] = await Promise.all([request(i, credentials, base + commitQuery, i.provider === 'github' || i.provider === 'forgejo'), request(i, credentials, base + pullQuery)]);
  const rows = (raw: unknown) => isCloud || isDC ? z.object({ values: z.array(z.unknown()).max(100) }).parse(raw).values : z.array(z.unknown()).max(100).parse(raw);
  const commits: GitActivity[] = rows(commitsRaw).map(raw => {
    if (isLab) { const r = z.object({ id, title: z.string(), web_url: link, committed_date: date }).parse(raw); return { id: r.id, kind: 'commit', title: r.title, url: r.web_url, date: r.committed_date }; }
    if (isCloud) { const r = z.object({ hash: id, message: z.string(), date, links: z.object({ html: z.object({ href: link }) }) }).parse(raw); return { id: r.hash, kind: 'commit', title: r.message, url: r.links.html.href, date: r.date }; }
    if (isDC) { const r = z.object({ id, message: z.string(), committerTimestamp: z.number() }).parse(raw); return { id: r.id, kind: 'commit', title: r.message, url: `${i.baseUrl}/projects/${segment(path.split('/')[0])}/repos/${segment(path.split('/')[1])}/commits/${segment(r.id)}`, date: new Date(r.committerTimestamp).toISOString() }; }
    const r = z.object({ sha: id, html_url: link, commit: z.object({ message: z.string(), committer: z.object({ date }) }) }).parse(raw);
    return { id: r.sha, kind: 'commit', title: r.commit.message, url: r.html_url, date: r.commit.committer.date };
  });
  const pulls: GitActivity[] = rows(pullsRaw).map(raw => {
    if (isLab) { const r = z.object({ iid: id, title: z.string(), web_url: link, updated_at: date, state: z.string() }).parse(raw); return { id: r.iid, kind: 'pull_request', title: r.title, url: r.web_url, date: r.updated_at, state: r.state }; }
    if (isCloud) { const r = z.object({ id, title: z.string(), updated_on: date, state: z.string(), links: z.object({ html: z.object({ href: link }) }) }).parse(raw); return { id: r.id, kind: 'pull_request', title: r.title, url: r.links.html.href, date: r.updated_on, state: r.state }; }
    if (isDC) { const r = z.object({ id, title: z.string(), updatedDate: z.number(), state: z.string(), links: z.object({ self: z.array(z.object({ href: link })).min(1) }) }).parse(raw); return { id: r.id, kind: 'pull_request', title: r.title, url: r.links.self[0].href, date: new Date(r.updatedDate).toISOString(), state: r.state }; }
    const r = z.object({ number: id, title: z.string(), html_url: link, updated_at: date, state: z.string(), merged_at: z.string().nullable().optional() }).parse(raw);
    return { id: r.number, kind: 'pull_request', title: r.title, url: r.html_url, date: r.updated_at, state: r.merged_at ? 'merged' : r.state };
  });
  return [...commits, ...pulls].map(row => ({ ...row, url: safeLink(row.url, i), title: row.title.split('\n')[0].slice(0, 500) })).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}
