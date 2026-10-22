'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { invalidateIssueTrashQueries, issueKeys } from '@/hooks/queries/useIssues';

interface TrashedIssue {
  id: string;
  issueKey: string | null;
  title: string;
  deletedAt: string;
  deletedById: string | null;
}

export function IssueTrash({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const queryClient = useQueryClient();
  const [purgeIssue, setPurgeIssue] = useState<TrashedIssue | null>(null);
  const [confirmIssueKey, setConfirmIssueKey] = useState('');
  const queryKey = ['issueTrash', workspaceId, projectId];
  const trash = useQuery({
    queryKey,
    staleTime: 0,
    queryFn: async ({ signal }): Promise<{ issues: TrashedIssue[]; canPurge: boolean }> => {
      const params = new URLSearchParams({ workspaceId, projectId });
      const response = await fetch(`/api/issues/trash?${params}`, { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load Trash.');
      return data;
    },
  });
  const mutation = useMutation({
    mutationFn: async ({ issue, action }: { issue: TrashedIssue; action: 'restore' | 'purge' }) => {
      if (action === 'purge' && (!trash.data?.canPurge || confirmIssueKey !== (issue.issueKey || issue.id))) {
        throw new Error('Type the exact issue key to confirm permanent deletion.');
      }
      const response = await fetch(`/api/issues/${encodeURIComponent(issue.id)}/${action}`, {
        method: action === 'restore' ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, projectId, ...(action === 'purge' ? { confirmIssueKey } : {}) }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Could not update this issue.');
      }
    },
    onSuccess: async (_, { issue, action }) => {
      setPurgeIssue(null);
      setConfirmIssueKey('');
      queryClient.removeQueries({ queryKey: issueKeys.detail(issue.id) });
      if (issue.issueKey) queryClient.removeQueries({ queryKey: issueKeys.detail(issue.issueKey) });
      await invalidateIssueTrashQueries(queryClient, workspaceId, projectId);
      const key = issue.issueKey || issue.id;
      toast.success(action === 'restore' ? `${key} restored with its original key.` : `${key} permanently deleted.`);
    },
    onError: error => toast.error(error.message),
  });

  return <section aria-label="Issue Trash" className="rounded-2xl bg-collab-800 border border-collab-700 p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-medium text-collab-50">Trash</h2>
        <p className="text-sm text-collab-400">Trashed issues keep their comments and history. Restore an issue to bring it back with its original key.</p>
      </div>
      <Button variant="outline" disabled={trash.isFetching || mutation.isPending} onClick={() => trash.refetch()}>Refresh</Button>
    </div>
    {trash.isLoading ? <p role="status" className="text-sm text-collab-400">Loading Trash…</p>
      : trash.isError ? <div role="alert" className="text-sm text-red-400">Could not load Trash. <Button variant="outline" onClick={() => trash.refetch()}>Retry</Button></div>
        : !trash.data?.issues.length ? <p className="text-sm text-collab-400">Trash is empty.</p>
          : <ul className="divide-y divide-collab-700">
            {trash.data.issues.map(issue => <li key={issue.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-collab-50 break-words"><span className="font-mono text-collab-400">{issue.issueKey || issue.id}</span> {issue.title}</p>
                <p className="text-xs text-collab-400">Moved to Trash {new Date(issue.deletedAt).toLocaleString()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ issue, action: 'restore' })}>Restore</Button>
                {trash.data?.canPurge && <Button variant="outline" className="text-red-400 border-red-500/30" disabled={mutation.isPending} onClick={() => { setPurgeIssue(issue); setConfirmIssueKey(''); }}>Delete permanently</Button>}
              </div>
            </li>)}
          </ul>}
    {mutation.isPending && <p role="status" className="text-sm text-collab-400">Updating issue…</p>}
    <AlertDialog open={!!purgeIssue} onOpenChange={open => { if (!open && !mutation.isPending) { setPurgeIssue(null); setConfirmIssueKey(''); } }}>
      <AlertDialogContent className="bg-collab-800 border-collab-700">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {purgeIssue?.issueKey || purgeIssue?.id} permanently?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the issue and its comments. A deletion audit record is retained. This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <Label htmlFor="purge-issue-key">Type {purgeIssue?.issueKey || purgeIssue?.id} to confirm</Label>
        <Input id="purge-issue-key" value={confirmIssueKey} onChange={event => setConfirmIssueKey(event.target.value)} autoComplete="off" disabled={mutation.isPending} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={mutation.isPending || !trash.data?.canPurge || !purgeIssue || confirmIssueKey !== (purgeIssue.issueKey || purgeIssue.id)} onClick={() => { if (purgeIssue) mutation.mutate({ issue: purgeIssue, action: 'purge' }); }}>Delete permanently</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
