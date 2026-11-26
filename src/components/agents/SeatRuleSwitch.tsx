"use client";

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

interface SeatRule { on: boolean; owner: boolean; perDay: number; today: number; runner: string | null }

/** On the Runners tab: the workspace rule that gives every new project its seats (CLB-519). Only the workspace's owner switches it. */
export function SeatRuleSwitch({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const url = `/api/workspaces/${workspaceId}/agent-seats/rule`;
  const [rule, setRule] = useState<SeatRule | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(url).then(response => (response.ok ? response.json() : null)).then(setRule).catch(() => setRule(null));
  }, [url]);

  const change = async (on: boolean) => {
    setBusy(true);
    try {
      const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setRule(body);
      else toast({ title: 'Error', description: body.error ?? 'The rule could not be switched.', variant: 'destructive' });
    } catch {
      toast({ title: 'Error', description: 'The rule could not be switched.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!rule) return null;
  return <div className="space-y-2 rounded-lg border p-4">
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor="seat-rule" className="font-medium">New projects get their seats</Label>
      <Switch id="seat-rule" checked={rule.on} disabled={busy || !rule.owner} onCheckedChange={change} />
    </div>
    <p className="text-sm text-muted-foreground">
      While this is on, every project created here, in the web app, with the CLI or through a token, gets a developer, reviewer, release and security seat and uses seats.
      {rule.owner && (rule.runner ? ` The seats go to the runner ${rule.runner}, which fetches their tokens itself.` : ' Connect a runner first.')}
      {` At most ${rule.perDay} projects a day (UTC) get seats this way; ${rule.today} so far today. A project past that limit is created without seats, and the workspace's owner is told.`}
      {!rule.owner && " Only the workspace's owner can switch this."}
    </p>
  </div>;
}
