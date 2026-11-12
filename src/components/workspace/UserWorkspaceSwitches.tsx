'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export interface WorkspaceSwitchRow {
  id: string;
  name: string;
  slug: string;
  /** The owner is always in; a member is on or off. */
  state: 'owner' | 'on' | 'off';
}

interface UserWorkspaceSwitchesProps {
  userId: string;
  userName: string;
  workspaces: WorkspaceSwitchRow[];
}

/** One person's workspaces as switches: on makes them a member there, off stops their access. */
export default function UserWorkspaceSwitches({ userId, userName, workspaces }: UserWorkspaceSwitchesProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const wanted = filter.trim().toLowerCase();
  const shown = workspaces.filter(row => `${row.name} ${row.slug}`.toLowerCase().includes(wanted));

  const failed = (description: string) => toast({ title: 'Error', description, variant: 'destructive' });

  const change = async (row: WorkspaceSwitchRow, active: boolean) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${row.id}/members/by-user/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return failed(data.error || 'Failed to change the workspace');
      toast({
        title: active ? 'Added to workspace' : 'Switched off',
        description: `${userName} ${active ? 'is now a member of' : 'can no longer use'} ${row.name}.`,
      });
      router.refresh();
    } catch {
      failed('Failed to change the workspace');
    } finally {
      setBusy(false);
    }
  };

  if (workspaces.length === 0) {
    return <p className="text-sm text-muted-foreground">There is no other workspace where you may manage members.</p>;
  }

  return (
    <div className="space-y-2">
      {workspaces.length > 8 && (
        <Input value={filter} placeholder="Filter workspaces" aria-label="Filter workspaces" onChange={event => setFilter(event.target.value)} />
      )}
      {shown.length === 0 && <p className="text-sm text-muted-foreground">No workspace matches.</p>}
      {shown.map(row => (
        <div key={row.id} className="flex items-center justify-between gap-3 rounded border border-border/20 p-2.5">
          <Label htmlFor={`user-workspace-${row.id}`} className="font-normal">
            {row.name} <span className="text-xs text-muted-foreground">{row.slug}</span>
          </Label>
          {row.state === 'owner' ? (
            <Badge variant="outline" className="h-5 px-2 text-xs">Owner</Badge>
          ) : (
            <Switch id={`user-workspace-${row.id}`} checked={row.state === 'on'} disabled={busy} onCheckedChange={active => change(row, active)} />
          )}
        </div>
      ))}
    </div>
  );
}
