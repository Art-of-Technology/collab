'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Person = { id: string; name: string | null } | null;
type Version = { id: string; version: number; text: string | null; reason: string; by: Person; at: string };
type InForce = { source: 'repository'; text: string }
  | { source: 'edit'; text: string; version: number; reason: string; by: Person; at: string; shippedNewer: boolean };
type Role = { id: string; name: string; repository: string; inForce: InForce; history: Version[] };

const who = (by: Person) => by?.name ?? (by ? 'someone with no name' : 'a deleted account');
const when = (at: string) => new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
const BOX = 'space-y-2 rounded-lg border border-collab-700 p-3';
const PRE = 'max-h-72 overflow-auto whitespace-pre-wrap font-sans text-sm text-gray-300';

/**
 * The admin Roles page (CLB-916): the roles of the catalogue on the left and, for the one picked, its platform prompt in
 * force, where it comes from, a box to change it with one line on why, and every saved version, each of which can be read
 * and restored. Each change is a new version; the reply of the server is what is shown afterwards.
 */
export function PlatformPromptsEditor({ roles: initial }: { roles: Role[] }) {
  const { toast } = useToast();
  const [roles, setRoles] = useState(initial);
  const [picked, setPicked] = useState(initial[0]?.id);
  const [drafts, setDrafts] = useState(() => Object.fromEntries(initial.map(role => [role.id, role.inForce.text])));
  const [reason, setReason] = useState('');
  const [reading, setReading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const role = roles.find(candidate => candidate.id === picked);
  if (!role) return null;
  const draft = drafts[role.id] ?? '';
  const inForce = role.inForce;
  const why = reason.trim();

  async function send(body: Record<string, string>) {
    if (!role) return;
    setBusy(true);
    try {
      const reply = await fetch(`/api/admin/agent-roles/${encodeURIComponent(role.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, reason: why }),
      });
      const answer = await reply.json().catch(() => ({}));
      if (!reply.ok) {
        toast({ title: 'Not saved', description: answer.error ?? 'The platform prompt could not be saved', variant: 'destructive' });
        return;
      }
      const next: Role = answer.role;
      setRoles(current => current.map(candidate => candidate.id === next.id ? next : candidate));
      setDrafts(current => ({ ...current, [next.id]: next.inForce.text }));
      setReason('');
      toast({ title: 'Saved', description: `The next run of every ${next.name} seat, in every workspace, gets it.` });
    } catch {
      toast({ title: 'Not saved', description: 'The platform prompt could not be saved', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
      <nav aria-label="Roles" className="flex flex-col gap-1">
        {roles.map(candidate => (
          <button key={candidate.id} type="button" onClick={() => { setPicked(candidate.id); setReading(null); }} aria-current={candidate.id === role.id ? 'true' : undefined}
            className={`rounded px-2 py-1.5 text-left text-sm ${candidate.id === role.id ? 'bg-collab-700 font-medium text-white' : 'text-gray-400 hover:bg-collab-700/50 hover:text-white'}`}>
            {candidate.name}{candidate.inForce.source === 'edit' ? ' · edited' : ''}
          </button>
        ))}
      </nav>

      <div className="space-y-4 text-white">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{role.name}</h2>
          <p className="text-sm text-gray-400">
            {inForce.source === 'edit'
              ? `In force: version ${inForce.version}, edited by ${who(inForce.by)} on ${when(inForce.at)}. Why: ${inForce.reason}`
              : "In force: the repository's text, as this release of Collab ships it."}
          </p>
        </div>

        {inForce.source === 'edit' && inForce.shippedNewer && (
          <section aria-label="The repository's text" className={BOX}>
            <p className="text-sm font-medium">The repository ships a newer text than the one this edit was made from. The edit stays in force.</p>
            <pre className={PRE}>{role.repository}</pre>
          </section>
        )}

        <section aria-label="Platform prompt" className={BOX}>
          <p className="text-xs text-gray-400">
            Do not put a password, a token or any other secret here: every seat of this role in every workspace reads it, and so does
            everyone who can see a workspace&apos;s Roles page. {'{{ownerId}}'} stands for the Collab user id of the seat&apos;s owner.
          </p>
          <Textarea aria-label={`The platform prompt of ${role.name} seats`} rows={16} value={draft}
            onChange={event => setDrafts(current => ({ ...current, [role.id]: event.target.value }))} />
          <Input aria-label="Why" placeholder="Why, in one line: needed to save, restore or go back" maxLength={300} value={reason}
            onChange={event => setReason(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => send({ action: 'save', text: draft })} disabled={busy || !why || !draft.trim() || draft === inForce.text}>Save</Button>
            {inForce.source === 'edit' && (
              <Button variant="outline" onClick={() => send({ action: 'repository' })} disabled={busy || !why}>Back to the repository&apos;s text</Button>
            )}
          </div>
        </section>

        <section aria-label="History" className={BOX}>
          <h3 className="text-sm font-medium">History</h3>
          {role.history.length === 0
            ? <p className="text-sm text-gray-400">No edits yet: runs receive the repository&apos;s text.</p>
            : <ol className="space-y-2">
              {role.history.map(entry => (
                <li key={entry.id} aria-label={`Version ${entry.version}`} className="space-y-1 border-t border-collab-700 pt-2 first:border-t-0 first:pt-0">
                  <p className="text-sm">
                    Version {entry.version}{entry.text === null ? ": back to the repository's text" : ''} · {who(entry.by)} · {when(entry.at)} · {entry.reason}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setReading(current => current === entry.id ? null : entry.id)}>{reading === entry.id ? 'Hide' : 'Read'}</Button>
                    <Button variant="ghost" size="sm" onClick={() => send({ action: 'restore', versionId: entry.id })} disabled={busy || !why}>Restore</Button>
                  </div>
                  {reading === entry.id && <pre className={PRE}>{entry.text ?? role.repository}</pre>}
                </li>
              ))}
            </ol>}
        </section>
      </div>
    </div>
  );
}
