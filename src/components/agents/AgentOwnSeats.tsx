"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import type { SeatsView } from '@/lib/agents-page';

type Project = SeatsView['projects'][number];
interface Props { workspaceId: string; projects: Project[]; canManage: boolean }

/**
 * Per project that uses seats: for who manages the workspace, the switch that lets members add their own seats; for
 * everyone else, their own seats there, with one button to add them and one to remove them.
 */
export function AgentOwnSeats({ workspaceId, projects, canManage }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Project | null>(null);
  const api = `/api/workspaces/${encodeURIComponent(workspaceId)}`;

  /** One change, then the page is read again: the server decides what is shown. */
  const call = async <T,>(url: string, init: RequestInit, done: (body: T) => { title: string; description?: string }) => {
    setBusy(true);
    try {
      const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) toast({ title: 'Error', description: body.error ?? 'This could not be saved.', variant: 'destructive' });
      else toast(done(body));
      router.refresh();
    } catch {
      toast({ title: 'Error', description: 'This could not be saved.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  const allow = (project: Project, membersMayAddSeats: boolean) => call(`${api}/projects/${encodeURIComponent(project.slug)}/agent-mode`,
    { method: 'PATCH', body: JSON.stringify({ membersMayAddSeats }) },
    () => ({ title: membersMayAddSeats ? `Members may add their own seats to ${project.name}` : `Members can no longer add seats to ${project.name}`,
      ...(!membersMayAddSeats && { description: 'The seats they already added stay.' }) }));
  const add = (project: Project) => call(`${api}/agent-seats/mine`, { method: 'POST', body: JSON.stringify({ projectId: project.id }) },
    (body: { created?: string[] }) => ({ title: 'Your seats were added', description: `${body.created?.join(', ')}. They work once your runner is connected.` }));
  const remove = (project: Project) => call(`${api}/agent-seats/mine?projectId=${encodeURIComponent(project.id)}`, { method: 'DELETE' },
    (body: { removed?: string[]; kept?: { name: string; reason: string }[] }) => ({ title: body.kept?.length ? 'Not every seat was removed' : 'Your seats were removed',
      description: [body.removed?.length && `Removed: ${body.removed.join(', ')}.`, ...(body.kept ?? []).map(seat => `${seat.name} stays: ${seat.reason}.`)].filter(Boolean).join(' ') }));

  if (!projects.length) return null;
  return <section aria-label={canManage ? "Members' own seats" : 'Your seats'} className="divide-y rounded-lg border text-sm">
    {projects.map(project => {
      const id = `members-add-seats-${project.id}`;
      const missing = project.mine.length < 3;
      // Every row has the same controls, so each is a group named by its project.
      return <div key={project.id} role="group" aria-labelledby={`${id}-name`} className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0 space-y-1">
          <p id={`${id}-name`} className="font-medium">{project.name}</p>
          {!canManage && <p className="text-muted-foreground">{project.mine.length
            ? <>Your seats in this project: <span className="capitalize">{project.mine.join(', ')}</span>.</>
            : 'You have no seats in this project. Your seats run on your own runner and your own allowance.'}</p>}
          {!canManage && missing && !project.membersMayAddSeats && <p className="text-xs text-destructive">The project owner has not switched this on.</p>}
        </div>
        {canManage ? <div className="flex items-center gap-2">
          <Checkbox id={id} checked={project.membersMayAddSeats} disabled={busy} onCheckedChange={checked => allow(project, checked === true)} />
          <label htmlFor={id}>Members may add their own seats to this project</label>
        </div> : <div className="flex flex-wrap gap-2">
          {missing && <Button disabled={busy || !project.membersMayAddSeats} onClick={() => add(project)}>Add my seats to this project</Button>}
          {project.mine.length > 0 && <Button variant="outline" disabled={busy} onClick={() => setRemoving(project)}>Remove my seats</Button>}
        </div>}
      </div>;
    })}

    <AlertDialog open={!!removing} onOpenChange={open => !open && setRemoving(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove your seats from {removing?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Your developer, reviewer and security seats there take no more work, and their open issues become unassigned. A seat that is working an issue stays until that work has ended.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => removing && remove(removing)}>Remove my seats</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
