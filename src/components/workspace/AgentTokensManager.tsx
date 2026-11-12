'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

export interface AgentTokenRow {
  id: string;
  name: string;
  access: 'read' | 'write';
  createdAt: string;
  expiresAt: string | null;
  expired: boolean;
}

interface AgentTokensManagerProps {
  workspaceId: string;
  /** null while agent tokens are not set up on this deployment. */
  tokens: AgentTokenRow[] | null;
}

const accessLabel = { read: 'Read only', write: 'Read and write' } as const;

export default function AgentTokensManager({ workspaceId, tokens }: AgentTokensManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<AgentTokenRow['access']>('read');
  const [days, setDays] = useState('90');
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<AgentTokenRow | null>(null);

  const failed = (description: string) => toast({ title: 'Error', description, variant: 'destructive' });

  const create = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/agent-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, access, expiresInDays: Number(days) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return failed(data.error || 'Failed to create the token');
      setCreating(false);
      setName('');
      setCopied(false);
      setMinted({ name: data.name, token: data.token });
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
      if (!response.ok) return failed('Failed to revoke the token');
      toast({ title: 'Token revoked', description: `${revoking.name} can no longer use it.` });
      setRevoking(null);
      router.refresh();
    } catch {
      failed('Failed to revoke the token');
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
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell>{accessLabel[token.access]}</TableCell>
                    <TableCell>{token.createdAt}</TableCell>
                    <TableCell>
                      {token.expiresAt ?? 'Never'}
                      {token.expired && <Badge variant="destructive" className="ml-2">Expired</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
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
              <Label htmlFor="agent-token-access">Access</Label>
              <Select value={access} onValueChange={value => setAccess(value as AgentTokenRow['access'])}>
                <SelectTrigger id="agent-token-access"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">{accessLabel.read}</SelectItem>
                  <SelectItem value="write">{accessLabel.write}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-token-expiry">Expires after</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger id="agent-token-expiry"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">365 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button>
            <Button onClick={create} disabled={busy || !name.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create token
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
          </p>
          <DialogFooter>
            <Button onClick={() => setMinted(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
