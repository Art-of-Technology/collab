'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { SeatRepositoryField, useSeatRepository } from '@/components/workspace/SeatRepositoryField';
import { ROLE_CATALOGUE } from '@/lib/agent-role-catalogue';

export interface WorkspaceRef {
  id: string;
  name: string;
  slug: string;
}

export interface AgentTokenRow {
  id: string;
  name: string;
  /**
   * Present when the token belongs to a seat. A null project means the seat covers the whole workspace.
   * `owner` names the person whose sign-in runs the seat, if any. A custom role name is shown in place of its built-in base role.
   */
  seat: { id: string; role: string; customRole?: string | null; project: string | null; isDefault: boolean; retired: boolean; owner: string | null } | null;
  /** Other workspaces the token's agent was let into. */
  workspaces: WorkspaceRef[];
  access: 'read' | 'write';
  createdAt: string;
  expiresAt: string | null;
  expired: boolean;
}

interface AgentTokensManagerProps {
  workspaceId: string;
  /** Other workspaces where the viewer may manage agent tokens, so an agent can be let into them. */
  workspaces: WorkspaceRef[];
  /** Projects a seat can be created for, and the people who can own one. */
  projects: { id: string; name: string }[];
  people: { id: string; name: string }[];
  /** null while agent tokens are not set up on this deployment. */
  tokens: AgentTokenRow[] | null;
  seats?: { id: string; name: string; role: string; customRole?: string | null; project: string | null; isDefault: boolean; owner: string | null }[];
  /** The workspace's own roles a new seat can take (CLB-628), each behaving like its base role. */
  customRoles?: { id: string; name: string; baseRole: string }[];
}

const accessLabel = { read: 'Read only', write: 'Read and write' } as const;
const roleLabel = (id: string) => ROLE_CATALOGUE.getRole(id)?.name ?? id;
/** A seat's role as people read it: the workspace's own role by its name, else the built-in one. */
const seatRoleLabel = (seat: { role: string; customRole?: string | null }) => seat.customRole ?? roleLabel(seat.role);
const WHOLE_WORKSPACE = 'the whole workspace';
// The role select holds a built-in role's id, or one of the workspace's own roles under this prefix.
const CUSTOM = 'custom:';
// The select cannot hold an empty value.
const NONE = 'none';
// Who pays for the seat's session, which the seat list says next to each seat.
const ownerLabel = (owner: string | null) => owner ? `Owner: ${owner}` : 'No owner (API key)';

export default function AgentTokensManager({ workspaceId, workspaces, projects, people, tokens, seats = [], customRoles = [] }: AgentTokensManagerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<AgentTokenRow['access']>('read');
  const [days, setDays] = useState('90');
  const [projectId, setProjectId] = useState(NONE);
  const [role, setRole] = useState('developer');
  const [ownerId, setOwnerId] = useState(NONE);
  // The seat's tokens are fetched by its owner's runner: none is made or shown here.
  const [byRunner, setByRunner] = useState(false);
  const [retiring, setRetiring] = useState<{ name: string; seat: NonNullable<AgentTokenRow['seat']> } | null>(null);
  const orphanSeats = seats.filter(seat => !tokens?.some(token => token.seat?.id === seat.id));
  const asSeat = projectId !== NONE;
  // What the seat will work in. With several repositories the seat picks one, starting at the project's default; a
  // seat is not created while a role that works in a repository has none to work in.
  const [repositoryId, setRepositoryId] = useState('');
  const repository = useSeatRepository(asSeat ? projectId : null);
  // A role of the workspace's own is sent by its id; what the seat needs is its base role's.
  const custom = customRoles.find(row => `${CUSTOM}${row.id}` === role);
  const baseRole = custom?.baseRole ?? role;
  const needsRepository = (ROLE_CATALOGUE.getRole(baseRole)?.repository ?? 'none') !== 'none';
  const several = (repository.data?.repositories.length ?? 0) > 1;
  const candidate = repositoryId || repository.data?.repository?.id || '';
  const pick = needsRepository && several && repository.data?.repositories.some(item => item.id === candidate) ? candidate : '';
  const repositorySettled = !asSeat || !needsRepository || (!repository.error && (several ? !!pick : !!repository.data?.repository));
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<AgentTokenRow | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  // Read from the current rows, so the switches follow each refresh.
  const managing = tokens?.find(token => token.id === managingId) ?? null;
  // The workspaces the viewer may add, and any the agent already has: those can always be taken away.
  const choices = (token: AgentTokenRow) => [...workspaces, ...token.workspaces.filter(row => !workspaces.some(mine => mine.id === row.id))];

  const failed = (description: string) => toast({ title: 'Error', description, variant: 'destructive' });

  const create = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/${asSeat ? 'agent-seats' : 'agent-tokens'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asSeat
          ? { name, projectId, ...(custom ? { customRoleId: custom.id } : { role }), ownerId: ownerId === NONE ? null : ownerId, expiresInDays: Number(days), ...(byRunner && { byRunner }), ...(pick && { repositoryId: pick }) }
          : { name, access, expiresInDays: Number(days) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return failed(data.error || 'Failed to create the token');
      setCreating(false);
      setName('');
      // The next token starts from the safe defaults again.
      setAccess('read');
      setDays('90');
      setProjectId(NONE);
      setRepositoryId('');
      setRole('developer');
      setOwnerId(NONE);
      setByRunner(false);
      setCopied(false);
      if (asSeat && !data.token) toast({ title: 'Seat created', description: `${data.seat.name} has no token yet. Its owner's runner fetches one the next time it asks.` });
      else setMinted(asSeat ? { name: data.token.name, token: data.token.token } : { name: data.name, token: data.token });
      await queryClient.invalidateQueries({ queryKey: ['workspace-member-users'] });
      router.refresh();
    } catch {
      failed('Failed to create the token');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/agent-tokens/${revoking.id}`, { method: 'DELETE' });
      if (!response.ok) return failed((await response.json().catch(() => ({}))).error || 'Failed to revoke the token');
      toast({ title: 'Token revoked', description: `${revoking.name} can no longer use it.` });
      setRevoking(null);
      await queryClient.invalidateQueries({ queryKey: ['workspace-member-users'] });
      router.refresh();
    } catch {
      failed('Failed to revoke the token');
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    if (!retiring?.seat) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/agent-seats/${retiring.seat.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return failed(data.error || 'Failed to retire the seat');
      const count = data.unassigned?.length ?? 0;
      toast({ title: 'Seat retired', description: `${retiring.name} takes no more work. ${count === 1 ? '1 open issue was' : `${count} open issues were`} unassigned.` });
      setRetiring(null);
      await queryClient.invalidateQueries({ queryKey: ['workspace-member-users'] });
      router.refresh();
    } catch {
      failed('Failed to retire the seat');
    } finally {
      setBusy(false);
    }
  };

  const setWorkspace = async (target: WorkspaceRef, allowed: boolean) => {
    if (!managing) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/agent-tokens/${managing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: target.id, allowed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return failed(data.error || 'Failed to change the workspace');
      toast({
        title: allowed ? 'Workspace added' : 'Workspace removed',
        description: `${managing.name} can ${allowed ? 'now' : 'no longer'} work in ${target.name}.`,
      });
      router.refresh();
    } catch {
      failed('Failed to change the workspace');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.token);
      setCopied(true);
    } catch {
      failed('Could not copy. Select the token and copy it by hand.');
    }
  };

  if (!tokens) {
    return (
      <Card className="border border-border/40 bg-card/50">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Agent tokens are not set up on this deployment yet. An administrator has to run <code>scripts/setup-agent-apps.mjs --apply</code> once.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border border-border/40 bg-card/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-medium">Tokens</CardTitle>
            </div>
            <Button size="sm" className="text-xs h-7" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3 w-3" />
              New token
            </Button>
          </div>
          <CardDescription className="text-xs">
            Each token belongs to a service account with the token&apos;s name. The account is a workspace member that cannot sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {orphanSeats.map(seat => (
            <div key={seat.id} className="flex items-center justify-between gap-3 py-2">
              <span>{seat.name} <span className="text-xs text-muted-foreground">{seatRoleLabel(seat)} seat of {seat.project ?? WHOLE_WORKSPACE}{seat.isDefault && ', default for its role'} · {ownerLabel(seat.owner)}</span></span>
              <Button variant="outline" size="sm" onClick={() => setRetiring({ name: seat.name, seat: { ...seat, retired: false } })}>Retire seat</Button>
            </div>
          ))}
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agent tokens yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map(token => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">
                      {token.name}
                      {token.seat && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {token.seat.retired ? 'Retired seat' : `${seatRoleLabel(token.seat)} seat`} of {token.seat.project ?? WHOLE_WORKSPACE}
                          {token.seat.isDefault && ', default for its role'} · {ownerLabel(token.seat.owner)}
                        </div>
                      )}
                      {token.workspaces.length > 0 && (
                        <div className="text-xs font-normal text-muted-foreground">
                          Also works in {token.workspaces.map(row => row.name).join(', ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{accessLabel[token.access]}</TableCell>
                    <TableCell>{token.createdAt}</TableCell>
                    <TableCell>
                      {token.expiresAt ?? 'Never'}
                      {token.expired && <Badge variant="destructive" className="ml-2">Expired</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {choices(token).length > 0 && (
                        <Button variant="outline" size="sm" className="mr-2 text-xs h-7" onClick={() => setManagingId(token.id)}>
                          Workspaces
                        </Button>
                      )}
                      {token.seat && !token.seat.retired && (
                        <Button variant="outline" size="sm" className="mr-2 text-xs h-7" onClick={() => setRetiring({ name: token.name, seat: token.seat! })}>
                          Retire seat
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setRevoking(token)}>
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New agent token</DialogTitle>
            <DialogDescription>
              The name is shown as the creator of everything done with this token.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-token-name">Name</Label>
              <Input id="agent-token-name" value={name} maxLength={50} placeholder="Claude" onChange={event => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-token-project">Seat in a project</Label>
              <Select value={projectId} onValueChange={value => { setProjectId(value); setRepositoryId(''); }}>
                <SelectTrigger id="agent-token-project"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No seat: a token for the whole workspace</SelectItem>
                  {projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {asSeat ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="agent-token-role">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="agent-token-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_CATALOGUE.roles.map(({ id, name }) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                      {customRoles.length > 0 && <SelectGroup>
                        <SelectLabel>Your organisation</SelectLabel>
                        {customRoles.map(row => <SelectItem key={row.id} value={`${CUSTOM}${row.id}`}>{row.name}</SelectItem>)}
                      </SelectGroup>}
                    </SelectContent>
                  </Select>
                </div>
                <SeatRepositoryField key={projectId} projectId={projectId} roleName={custom?.name ?? roleLabel(role)} needed={needsRepository} query={repository}
                  pick={pick} onPick={setRepositoryId} />
                <div className="space-y-2">
                  <Label htmlFor="agent-token-owner">Owner</Label>
                  <Select value={ownerId} onValueChange={setOwnerId}>
                    <SelectTrigger id="agent-token-owner"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No owner</SelectItem>
                      {people.map(person => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {ownerId === NONE
                      ? "No person's subscription pays for this seat. It needs a runner that uses your organisation's API key, which the runner holds and Collab never sees. No such runner exists yet, so a runner tied to a person's sign-in may refuse the seat."
                      : "Runs on this person's own Claude Code or Codex sign-in, which pays for its sessions."}
                    {' '}The owner cannot be changed afterwards: retire the seat and create it again.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="agent-token-by-runner">Run by the owner&apos;s runner
                    <span className="block text-xs font-normal text-muted-foreground">No token is made or shown. The runner connected for the owner fetches it. The seat needs an owner.</span>
                  </Label>
                  <Switch id="agent-token-by-runner" checked={byRunner} onCheckedChange={setByRunner} />
                </div>
                <p className="text-xs text-muted-foreground">
                  A seat can be assigned only this project&apos;s issues that fit its role, and its token can change only issues of this project.
                  A developer seat takes ordinary issues; reviewer, release and security seats take only review, release and security requests. A lead seat takes an epic and assigns its child issues to the project's other seats.
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="agent-token-access">Access</Label>
                <Select value={access} onValueChange={value => setAccess(value as AgentTokenRow['access'])}>
                  <SelectTrigger id="agent-token-access"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">{accessLabel.read}</SelectItem>
                    <SelectItem value="write">{accessLabel.write}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {!(asSeat && byRunner) && <div className="space-y-2">
              <Label htmlFor="agent-token-expiry">Expires after</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger id="agent-token-expiry"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">365 days</SelectItem>
                </SelectContent>
              </Select>
            </div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button>
            <Button onClick={create} disabled={busy || !name.trim() || (asSeat && byRunner && ownerId === NONE) || !repositorySettled}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {asSeat ? 'Create seat' : 'Create token'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!minted} onOpenChange={open => { if (!open) setMinted(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy the token for {minted?.name}</DialogTitle>
            <DialogDescription>
              This is the only time the token is shown. Store it in a secret manager, not in a file or a chat.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={minted?.token ?? ''} className="font-mono text-xs" aria-label="Agent token" onFocus={event => event.target.select()} />
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use it as a Bearer credential, or as <code>COLLAB_TOKEN</code> together with <code>COLLAB_URL</code> for the CLI.
            To connect an agent over MCP, follow &ldquo;Connect an agent&rdquo; on this page.
          </p>
          <DialogFooter>
            <Button onClick={() => setMinted(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!managing} onOpenChange={open => { if (!open) setManagingId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workspaces for {managing?.name}</DialogTitle>
            <DialogDescription>
              Tokens named {managing?.name} work in this workspace and in every workspace switched on below. An agent chooses one
              with the <code>workspaceId</code> argument, so text it reads in one workspace could steer it into another.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {managing && choices(managing).map(row => (
              <div key={row.id} className="flex items-center justify-between gap-3">
                <Label htmlFor={`agent-workspace-${row.id}`} className="font-normal">
                  {row.name} <span className="text-xs text-muted-foreground">{row.slug}</span>
                </Label>
                <Switch
                  id={`agent-workspace-${row.id}`}
                  checked={managing.workspaces.some(entry => entry.id === row.id)}
                  disabled={busy}
                  onCheckedChange={allowed => setWorkspace(row, allowed)}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setManagingId(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!retiring}
        onOpenChange={open => { if (!open) setRetiring(null); }}
        title="Retire seat?"
        description="The seat takes no more work and its open issues become unassigned. Its tokens can still read until you revoke them, but can change nothing."
        confirmText="Retire seat"
        isLoading={busy}
        onConfirm={retire}
        metadata={retiring?.seat ? { title: retiring.name, subtitle: `${seatRoleLabel(retiring.seat)} seat of ${retiring.seat.project ?? WHOLE_WORKSPACE}` } : undefined}
      />

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={open => { if (!open) setRevoking(null); }}
        title="Revoke token?"
        description="Anything using this token stops working at once. This cannot be undone."
        confirmText="Revoke"
        isLoading={busy}
        onConfirm={revoke}
        metadata={revoking ? { title: revoking.name, subtitle: accessLabel[revoking.access] } : undefined}
      />
    </>
  );
}
