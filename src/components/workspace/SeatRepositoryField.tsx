'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitHubOAuthConnection } from '@/components/github/GitHubOAuthConnection';
import type { SeatRepository } from '@/lib/agent-repository';

type State = { repositories: SeatRepository[]; repository: SeatRepository | null };
const endpoint = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/agent-repository`;
// The key Project settings reads the same answer under, so a repository connected there or here shows in both.
const queryKey = (projectId: string | null) => ['projectSummary', projectId, 'agentRepository'];

/** What the project's seats work in: its connected repositories and the one it works out, or the address typed on it. */
export function useSeatRepository(projectId: string | null) {
  return useQuery<State>({ queryKey: queryKey(projectId), enabled: !!projectId, queryFn: async () => {
    const response = await fetch(endpoint(projectId!), { cache: 'no-store' });
    if (!response.ok) throw new Error("Could not load the project's repository.");
    return response.json();
  } });
}

const chip = (text: string, warn = false) => (
  <Badge variant="outline" className={`mr-1 rounded-full border-transparent font-normal ${warn ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{text}</Badge>
);

/**
 * The Repository line of the create-seat form. One repository: shown, nothing to pick. Several: the seat picks one.
 * None: connect GitHub, or type an address that is saved on the project. A role that works in none: said so.
 */
export function SeatRepositoryField({ projectId, roleName, needed, query, pick, onPick, onSeatOAuthStart, returningFromGitHub }: {
  projectId: string; roleName: string; needed: boolean; query: UseQueryResult<State>; pick: string; onPick: (repositoryId: string) => void; onSeatOAuthStart: () => void; returningFromGitHub: boolean;
}) {
  const client = useQueryClient();
  const [mode, setMode] = useState<'github' | 'typing' | null>(returningFromGitHub ? 'github' : null);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const { data, error, refetch } = query;

  const save = async () => {
    setBusy(true);
    setFailure('');
    try {
      const response = await fetch(endpoint(projectId), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: address }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return setFailure(result.error || 'Could not save the address.');
      client.setQueryData(queryKey(projectId), result);
      setMode(null);
    } catch {
      setFailure('Could not save the address.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Repository</Label>
      <div className="rounded-md border border-border/40 bg-card/50 p-3 text-sm">
        {!needed ? <>{chip('No repository needed')} A {roleName} decides and writes; it changes no code.</>
          : error ? <span role="alert">{error.message} <button type="button" className="underline" onClick={() => refetch()}>Retry</button></span>
          : !data ? <span role="status" className="text-muted-foreground">Loading the project&apos;s repository…</span>
          : data.repositories.length === 1 ? <>{chip('From the project')} <b>{data.repositories[0].name}</b>. Nothing to pick, nothing to type.</>
          : data.repositories.length > 1 ? <>
            <p className="mb-2">This project has {data.repositories.length} repositories. Which one does this seat work in?</p>
            <Select value={pick} onValueChange={onPick}>
              <SelectTrigger aria-label="Repository"><SelectValue placeholder="Choose a repository" /></SelectTrigger>
              <SelectContent>
                {data.repositories.map(repository => <SelectItem key={repository.id} value={repository.id}>{repository.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </> : <>
            {data.repository ? <>
              {chip('Saved on the project')} <b className="break-all">{data.repository.url}</b>
              {mode !== 'typing' && <Button variant="link" size="sm" className="h-auto px-2 py-0 text-xs" onClick={() => { setAddress(data.repository!.url); setMode('typing'); }}>Change</Button>}
            </> : <>
              {chip('No repository on this project', true)}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setMode('github')}>Connect GitHub</Button>
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setMode('typing')}>Type an address</Button>
              </div>
            </>}
            {mode === 'typing' && (
              <div className="mt-2 flex items-center gap-2">
                <Input autoFocus aria-label="Repository address" placeholder="https://github.com/org/repo" value={address} maxLength={2048} onChange={event => setAddress(event.target.value)} />
                <Button size="sm" className="shrink-0 text-xs h-9" onClick={save} disabled={busy || !address.trim()}>Save on the project</Button>
              </div>
            )}
            {mode === 'typing' && failure && <p role="alert" className="mt-2 text-xs text-destructive">{failure}</p>}
            {mode === 'github' && <div className="mt-2 max-h-72 overflow-y-auto"><GitHubOAuthConnection projectId={projectId} compact onSeatOAuthStart={onSeatOAuthStart} /></div>}
          </>}
      </div>
    </div>
  );
}
