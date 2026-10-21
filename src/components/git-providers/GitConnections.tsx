'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { Instance, GitRepository } from '@/lib/git-providers/client';

interface Connection {
  id: string; provider: string; baseUrl: string; repositoryPath: string; name: string; url: string;
  isActive: boolean; syncedAt: string | null; canManage: boolean;
  activity: { id: string; kind: string; title: string; url: string; date: string; state: string | null }[];
}

export function GitConnections({ projectId }: { projectId: string }) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [instanceKey, setInstanceKey] = useState('');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [repositoryPath, setRepositoryPath] = useState('');
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/git-connections`;
  const instance = instances.find(i => `${i.provider}:${i.baseUrl}` === instanceKey);

  async function read() {
    const response = await fetch(endpoint, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load Git connections.');
    setInstances(data.instances); setConnections(data.connections); setLoadError('');
  }
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(endpoint, { cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load Git connections.');
      if (!cancelled) { setInstances(data.instances); setConnections(data.connections); setLoadError(''); }
    }).catch(error => { if (!cancelled) setLoadError(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint]);

  async function action(body: Record<string, unknown>) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not complete the Git request.');
    return data;
  }
  async function browse(page = 1) {
    if (!instance) return;
    setBusy(true);
    try {
      const data = await action({ action: 'list', provider: instance.provider, baseUrl: instance.baseUrl, credentials: { token, ...(username ? { username } : {}) }, workspace, page });
      setRepositories(previous => page === 1 ? data.repositories : [...previous, ...data.repositories]); setNextPage(data.nextPage);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not list repositories.'); }
    finally { setBusy(false); }
  }
  async function connect(path: string) {
    if (!instance) return;
    setBusy(true);
    try {
      await action({ action: 'connect', provider: instance.provider, baseUrl: instance.baseUrl, credentials: { token, ...(username ? { username } : {}) }, repositoryPath: path });
      setToken(''); setRepositories([]); setNextPage(null); setRepositoryPath('');
      await read(); toast.success('Repository connected.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not connect repository.'); }
    finally { setBusy(false); }
  }
  async function manage(id: string, operation: 'refresh' | 'disconnect') {
    setBusy(true);
    try {
      await action({ action: operation, id }); await read();
      toast.success(operation === 'refresh' ? 'Repository activity refreshed.' : 'Disconnected. Saved activity is retained.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update connection.'); }
    finally { setBusy(false); }
  }

  return <section className="rounded-2xl bg-collab-800 border border-collab-700 p-5 space-y-5" aria-label="Git provider connections">
    <div>
      <h2 className="text-base font-medium text-collab-50">Git provider connections</h2>
      <p className="text-sm text-collab-400">Connect GitHub Enterprise, Forgejo, GitLab or Bitbucket. Activity refreshes when you connect or select Refresh. Existing GitHub automation stays available above.</p>
    </div>
    {loading && <p role="status">Loading Git connections…</p>}
    {loadError && <div role="alert" className="text-red-400">{loadError} <Button variant="outline" onClick={() => read().catch(error => setLoadError(error.message))}>Retry</Button></div>}
    {!loading && !loadError && <>
      <div className="space-y-3">
        <Label htmlFor="git-instance">Git server</Label>
        <select id="git-instance" className="w-full rounded-md border border-collab-600 bg-collab-900 p-2 text-collab-50" value={instanceKey} disabled={busy} onChange={event => {
          setInstanceKey(event.target.value); setToken(''); setUsername(''); setWorkspace(''); setRepositoryPath(''); setRepositories([]); setNextPage(null);
        }}>
          <option value="">Choose a server</option>
          {instances.map(i => <option key={`${i.provider}:${i.baseUrl}`} value={`${i.provider}:${i.baseUrl}`}>{i.label} — {i.baseUrl}</option>)}
        </select>
        <p className="text-xs text-collab-400">Your administrator can add hosted or self-managed servers.</p>
        {instance && <>
          <Label htmlFor="git-token">Access token</Label>
          <Input id="git-token" type="password" autoComplete="off" value={token} disabled={busy} onChange={event => setToken(event.target.value)} />
          <p className="text-xs text-collab-400">Use a token with repository and pull/merge request read access. Credentials stay on the server. Connected activity is visible to members of this Collab project.</p>
          {instance.provider === 'bitbucket' && <>
            <Label htmlFor="git-email">Atlassian email (for API tokens)</Label>
            <Input id="git-email" type="email" value={username} disabled={busy} onChange={event => setUsername(event.target.value)} placeholder="Leave empty for a repository/workspace access token" />
            <Label htmlFor="git-workspace">Bitbucket workspace</Label>
            <Input id="git-workspace" value={workspace} disabled={busy} onChange={event => setWorkspace(event.target.value)} />
          </>}
          <Button disabled={busy || !token || (instance.provider === 'bitbucket' && !workspace)} onClick={() => browse()}>Browse repositories</Button>
          <div className="space-y-2">
            {repositories.map(repo => <div key={repo.id} className="flex items-center justify-between gap-3 border-b border-collab-700 py-2">
              <span className="min-w-0 break-all text-sm">{repo.path}</span>
              <Button disabled={busy} onClick={() => connect(repo.path)}>Connect {repo.name}</Button>
            </div>)}
            {nextPage && <Button variant="outline" disabled={busy} onClick={() => browse(nextPage)}>Load more repositories</Button>}
          </div>
          <Label htmlFor="git-path">Repository path</Label>
          <Input id="git-path" value={repositoryPath} disabled={busy} onChange={event => setRepositoryPath(event.target.value)} placeholder={instance.provider === 'bitbucket-dc' ? 'PROJECT/repository' : 'owner-or-group/repository'} />
          <p className="text-xs text-collab-400">You can also enter a path directly, including nested GitLab groups or repositories accessible only through a scoped token.</p>
          <Button disabled={busy || !token || !repositoryPath} onClick={() => connect(repositoryPath)}>Connect repository</Button>
        </>}
      </div>
      {busy && <p role="status" className="text-sm text-collab-400">Contacting Git server…</p>}
      {connections.map(connection => <article key={connection.id} className="border-t border-collab-700 pt-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-3">
          <div className="min-w-0">
            <a className="text-sm font-medium text-collab-50 break-all underline" href={connection.url} target="_blank" rel="noopener noreferrer">{connection.repositoryPath}</a>
            <p className="text-xs text-collab-400">{connection.provider} · {connection.isActive ? 'Connected' : 'Disconnected — saved activity'}{connection.syncedAt ? ` · Last refreshed ${new Date(connection.syncedAt).toLocaleString()}` : ''}</p>
          </div>
          {connection.canManage && connection.isActive && <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => manage(connection.id, 'refresh')}>Refresh</Button>
            <Button variant="outline" disabled={busy} onClick={() => manage(connection.id, 'disconnect')}>Disconnect</Button>
          </div>}
        </div>
        {connection.canManage && <p className="text-xs text-collab-400">To replace a token or reconnect, select the same server and connect this repository again.</p>}
        {connection.activity.length === 0 ? <p className="text-sm text-collab-400">No recent activity.</p> : <ul className="space-y-2">
          {connection.activity.map(row => <li key={row.id} className="text-sm min-w-0">
            <span className="text-collab-400">{row.kind === 'commit' ? 'Commit' : 'PR / MR'}{row.state ? ` · ${row.state}` : ''} · </span>
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="underline break-words">{row.title}</a>
          </li>)}
        </ul>}
      </article>)}
    </>}
  </section>;
}
