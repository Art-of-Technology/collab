'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Seat = { id: string; name: string; instructions: string };

/**
 * "Instructions for this seat" on a seat's page (CLB-610): the seat layer of its runs, added after the platform and the
 * organisation layers. Only `canEdit` gets the box and Save; everyone else reads the saved text.
 */
export function SeatInstructions({ workspaceId, canEdit, seat }: { workspaceId: string; canEdit: boolean; seat: Seat }) {
  const { toast } = useToast();
  const [saved, setSaved] = useState(seat.instructions);
  const [draft, setDraft] = useState(seat.instructions);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const reply = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agent-seats/${encodeURIComponent(seat.id)}/instructions`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft }),
      });
      const body = await reply.json().catch(() => ({}));
      if (!reply.ok) {
        toast({ title: 'Not saved', description: body.error ?? 'The instructions could not be saved', variant: 'destructive' });
        return;
      }
      setSaved(body.text);
      setDraft(body.text);
      toast({ title: 'Saved', description: `The next run of ${seat.name} gets it.` });
    } catch {
      toast({ title: 'Not saved', description: 'The instructions could not be saved', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Instructions for this seat" className="space-y-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">Instructions for this seat</h2>
      <p className="text-xs text-muted-foreground">
        Added after the platform and the organisation layers in the next run of {seat.name}. Do not put a password, a token or any other secret here:
        the seat and everyone who can see seats reads it.
      </p>
      {canEdit ? <>
        <Textarea aria-label={`Instructions for ${seat.name}`} rows={6} value={draft} onChange={event => setDraft(event.target.value)} />
        <Button onClick={save} disabled={saving || draft.trim() === saved}>Save</Button>
      </> : saved
        ? <pre className="whitespace-pre-wrap font-sans text-sm">{saved}</pre>
        : <p className="text-sm text-muted-foreground">Nothing added for this seat. Someone who may manage the workspace&apos;s permissions can add it.</p>}
    </section>
  );
}
