'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { SeatRepository } from '@/lib/agent-repository';

type State = { repositories: SeatRepository[]; repository: SeatRepository | null; canManage: boolean };
export function AgentRepositoryDefault({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/agent-repository`;
  const queryKey = ['projectSummary', projectId, 'agentRepository'];
  const { data, error, refetch } = useQuery<State>({ queryKey, queryFn: async () => {
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the default repository.');
    return response.json();
  } });
  async function choose(repositoryId: string) {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repositoryId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save the default repository.');
      client.setQueryData(queryKey, result);
      toast.success('Default repository saved.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save the default repository.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <Label htmlFor="agent-default-repository">Default repository for agents</Label>
    {error && <p role="alert">{error.message} <button onClick={() => refetch()}>Retry</button></p>}
    {!data && !error && <p role="status">Loading default repository…</p>}
    {data && <>
      {data.repositories.length === 0 ? <p className="text-sm text-collab-400">Connect a repository to use it for agents.</p> : <>
        <select id="agent-default-repository" className="w-full rounded-md border border-collab-600 bg-collab-900 p-2 text-collab-50"
          value={data.repository?.id ?? ''} disabled={busy || !data.canManage || data.repositories.length === 1} onChange={event => choose(event.target.value)}>
          <option value="" disabled>Choose a default repository</option>
          {data.repositories.map(repository => <option key={repository.id} value={repository.id}>{repository.name} — {repository.url}</option>)}
        </select>
        <p className="text-sm text-collab-400">{data.repositories.length === 1 ? 'The only connected repository is automatically the default.' : data.repository
          ? 'Used when a seat has no repository of its own.' : 'Choose a default before agents can start work in this project.'}</p>
      </>}
    </>}
  </div>;
}
