"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Runner { id: string; name: string; ownerId: string; ownerName: string | null; admittedAt: string | null; lastSeenAt: string | null; seats: number }
interface Props {
  workspaceId: string;
  me: string;
  /** The people a runner can be admitted for: filled only for the workspace's owner. */
  people: { id: string; name: string }[];
}

/** The Runners tab of the Agents page: admit the runner that shows a code, see the admitted ones, remove one. */
export function AgentRunnersView({ workspaceId, me, people }: Props) {
  const { toast } = useToast();
  const url = `/api/workspaces/${workspaceId}/agent-runners`;
  const [runners, setRunners] = useState<Runner[] | null>(null);
  const [code, setCode] = useState('');
  const [ownerId, setOwnerId] = useState(me);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Runner | null>(null);
  const failed = (description: string) => toast({ title: 'Error', description, variant: 'destructive' });

  const load = useCallback(async () => {
    const response = await fetch(url).catch(() => null);
    if (response?.ok) setRunners((await response.json()).runners);
    else failed('The runners could not be loaded.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  useEffect(() => { void load(); }, [load]);

  const call = async (request: Promise<Response>, fallback: string) => {
    setBusy(true);
    try {
      const response = await request;
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { failed(body.error ?? fallback); return null; }
      await load();
      return body;
    } catch {
      failed(fallback);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const admit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = await call(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, ...(ownerId !== me && { ownerId }) }) }), 'The runner could not be admitted.');
    if (!body) return;
    setCode('');
    toast({ title: `${body.runner.name} is admitted`, description: body.replaced.length
      ? `It replaces ${body.replaced.join(', ')}, whose tokens were revoked.` : 'It fetches its seats the next time it asks.' });
  };

  const remove = async () => {
    if (!removing) return;
    const body = await call(fetch(`${url}/${removing.id}`, { method: 'DELETE' }), 'The runner could not be removed.');
    setRemoving(null);
    if (body) toast({ title: `${removing.name} is removed`, description: `${body.revokedTokens === 1 ? '1 token it fetched was' : `${body.revokedTokens} tokens it fetched were`} revoked.` });
  };

  return <>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        A runner is the program that works seats on one machine, under one person&apos;s logins. It fetches the tokens of that person&apos;s seats by itself, so nobody copies a token.
      </p>
      <Button asChild variant="outline"><Link href="/docs/agents/runner-contract#a-runner-fetches-its-seats">How a runner pairs</Link></Button>
    </div>

    <form onSubmit={admit} className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Admit a runner</h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Start the pairing on the runner&apos;s machine. It shows a code such as <code>K7QF-M2XD</code>.</li>
        <li>Type the code here within 15 minutes. Only type a code your own runner shows you.</li>
      </ol>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="runner-code">Code</Label>
          <Input id="runner-code" value={code} maxLength={32} placeholder="K7QF-M2XD" autoComplete="off" className="w-40 font-mono uppercase" onChange={event => setCode(event.target.value)} />
        </div>
        {people.length > 0 && <div className="space-y-1">
          <Label htmlFor="runner-owner">Whose runner</Label>
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger id="runner-owner" className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{people.map(person => <SelectItem key={person.id} value={person.id}>{person.id === me ? `${person.name} (me)` : person.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>}
        <Button type="submit" disabled={busy || code.replace(/[^a-z0-9]/gi, '').length < 8}>Admit</Button>
      </div>
      <p className="text-xs text-muted-foreground">A person has one runner per workspace. Admitting another removes the one before and revokes the tokens it fetched.</p>
    </form>

    {runners === null ? <p className="text-sm text-muted-foreground">Loading...</p> : runners.length === 0
      ? <p className="rounded-lg border p-6 text-sm text-muted-foreground">No runner is admitted yet.</p>
      : <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th className="p-3">Runner</th><th className="p-3">Runs under</th><th className="p-3">Seats</th><th className="p-3">Admitted</th><th className="p-3">Last asked</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{runners.map(runner => <tr key={runner.id} className="border-b last:border-0">
            <th scope="row" className="p-3 font-medium">{runner.name}</th>
            <td className="p-3">{runner.ownerName ?? 'Unknown'}{runner.ownerId === me && ' (me)'}</td>
            <td className="p-3">{runner.seats}</td>
            <td className="p-3">{runner.admittedAt ? new Date(runner.admittedAt).toLocaleDateString() : ''}</td>
            <td className="p-3">{runner.lastSeenAt ? new Date(runner.lastSeenAt).toLocaleString() : <span className="text-muted-foreground">Never</span>}</td>
            <td className="p-3 text-right"><Button variant="outline" size="sm" disabled={busy} onClick={() => setRemoving(runner)}>Remove</Button></td>
          </tr>)}</tbody>
        </table>
      </div>}

    <AlertDialog open={!!removing} onOpenChange={open => !open && setRemoving(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its credential stops working and every token it fetched is revoked at once. Its seats show &quot;No runner yet&quot; until another runner is admitted for the same person.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={remove}>Remove runner</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
