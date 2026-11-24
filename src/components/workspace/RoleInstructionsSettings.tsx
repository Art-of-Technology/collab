'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Role = { id: string; name: string; takes: string[]; repository: string; platform: string; organisation: string };

const LAYER_TITLE = 'flex items-center gap-2 text-sm font-medium';
const TAG = 'rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary';

/**
 * The Roles page of Workspace settings (CLB-608), layout A: the roles of the catalogue on the left and, for the one picked,
 * its layers stacked in the order a run reads them, the locked platform layer on top. Only `canEdit` gets the box and Save.
 */
export function RoleInstructionsSettings({ workspaceId, canEdit, roles }: { workspaceId: string; canEdit: boolean; roles: Role[] }) {
  const { toast } = useToast();
  const [picked, setPicked] = useState(roles[0]?.id);
  // What is saved per role, and what is typed and not saved yet.
  const [saved, setSaved] = useState(() => Object.fromEntries(roles.map(role => [role.id, role.organisation])));
  const [drafts, setDrafts] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const role = roles.find(candidate => candidate.id === picked);
  if (!role) return null;
  const draft = drafts[role.id] ?? '';

  async function save() {
    if (!role) return;
    setSaving(true);
    try {
      const reply = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agent-roles/${encodeURIComponent(role.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft }),
      });
      const body = await reply.json().catch(() => ({}));
      if (!reply.ok) {
        toast({ title: 'Not saved', description: body.error ?? 'The instructions could not be saved', variant: 'destructive' });
        return;
      }
      setSaved(current => ({ ...current, [role.id]: body.text }));
      setDrafts(current => ({ ...current, [role.id]: body.text }));
      toast({ title: 'Saved', description: `The next run of every ${role.name} seat in this workspace gets it.` });
    } catch {
      toast({ title: 'Not saved', description: 'The instructions could not be saved', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const organisation = saved[role.id] ?? '';
  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
      <nav aria-label="Roles" className="flex flex-col gap-1">
        <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Built-in</p>
        {roles.map(candidate => (
          <button key={candidate.id} type="button" onClick={() => setPicked(candidate.id)} aria-current={candidate.id === role.id ? 'true' : undefined}
            className={`rounded px-2 py-1.5 text-left text-sm ${candidate.id === role.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}>
            {candidate.name}
          </button>
        ))}
      </nav>

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{role.name}</h2>
          <p className="text-xs text-muted-foreground">Takes: {role.takes.join(', ') || 'nothing yet'} · Repository: {role.repository}</p>
        </div>

        <section aria-label="Layer 1: Platform" className="space-y-2 rounded-lg border border-dashed p-3">
          <h3 className={LAYER_TITLE}><span className={TAG}>Layer 1</span><Lock className="h-3.5 w-3.5" aria-hidden />Platform: {role.name} rules</h3>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans text-sm text-muted-foreground">{role.platform}</pre>
          <p className="text-xs text-muted-foreground">Written by Collab. The same for every organisation. Cannot be removed or edited here.</p>
        </section>

        <section aria-label="Layer 2: Your organisation" className="space-y-2 rounded-lg border p-3">
          <h3 className={LAYER_TITLE}><span className={TAG}>Layer 2</span>Your organisation</h3>
          <p className="text-xs text-muted-foreground">
            Added after the platform layer in the next run of every {role.name} seat in this workspace. Do not put a password, a token or any other secret here:
            every seat of this role and everyone who can see seats reads it.
          </p>
          {canEdit ? <>
            <Textarea aria-label={`What your organisation adds for ${role.name} seats`} rows={6} value={draft}
              onChange={event => setDrafts(current => ({ ...current, [role.id]: event.target.value }))} />
            <Button onClick={save} disabled={saving || draft === organisation}>Save</Button>
          </> : organisation
            ? <pre className="whitespace-pre-wrap font-sans text-sm">{organisation}</pre>
            : <p className="text-sm text-muted-foreground">Nothing added for this role. Someone who may manage the workspace&apos;s permissions can add it.</p>}
        </section>

        <section aria-label="Layer 3: One seat" className="space-y-1 rounded-lg border p-3">
          <h3 className={LAYER_TITLE}><span className={TAG}>Layer 3</span>One seat</h3>
          <p className="text-sm text-muted-foreground">Set on each seat&apos;s own page.</p>
        </section>

        <Button variant="outline" onClick={() => setPreview(shown => !shown)}>{preview ? 'Hide what a run receives' : 'Show what a run receives'}</Button>
        {preview && (
          <div aria-label="What a run receives" className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="text-xs text-muted-foreground">What the next run of a {role.name} seat in this workspace starts with, in this order. Only saved text is shown.</p>
            {[
              ['1. Platform', role.platform],
              ['2. Your organisation', organisation || 'Nothing added.'],
              ['3. The seat', 'Set on each seat\'s own page.'],
            ].map(([title, text]) => (
              <div key={title}>
                <p className="font-medium">{title}</p>
                <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{text}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
