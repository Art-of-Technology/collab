'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Role = { id: string; name: string; takes: string[]; repository: string; platform: string; organisation: string };
type CustomRole = { id: string; name: string; baseRole: string; baseName: string; instructions: string; retired: boolean; seats: number };

const LAYER_TITLE = 'flex items-center gap-2 text-sm font-medium';
const TAG = 'rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary';
const BADGE = 'rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground';
const FIELD = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
const NEW = 'new';
const custom = (id: string) => `custom:${id}`;

/**
 * The Roles page of Workspace settings (CLB-608), layout A: the roles of the catalogue on the left and, for the one picked,
 * its layers stacked in the order a run reads them, the locked platform layer on top. Only `canEdit` gets the box and Save.
 * Under "Your organisation", the workspace's own roles (CLB-626), each behaving like a built-in one: four layers, the base
 * role's platform and organisation layers, the role's own, the seat's. `canEdit` adds, edits, retires and deletes them.
 */
export function RoleInstructionsSettings({ workspaceId, canEdit, roles, custom: initialCustom = [] }: { workspaceId: string; canEdit: boolean; roles: Role[]; custom?: CustomRole[] }) {
  const { toast } = useToast();
  const [picked, setPicked] = useState(roles[0]?.id);
  // What is saved per role, and what is typed and not saved yet.
  const [saved, setSaved] = useState(() => Object.fromEntries(roles.map(role => [role.id, role.organisation])));
  const [drafts, setDrafts] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [customRoles, setCustomRoles] = useState(initialCustom);
  // The form of a new role, or of the custom role picked: what is typed and not saved yet.
  const [form, setForm] = useState({ name: '', baseRole: roles[0]?.id ?? '', instructions: '' });

  const pickedCustom = customRoles.find(candidate => custom(candidate.id) === picked);
  const isNew = picked === NEW;
  // The built-in role whose layers are shown: the one picked, or the base role of a custom one.
  const role = roles.find(candidate => candidate.id === (isNew ? form.baseRole : pickedCustom ? pickedCustom.baseRole : picked));
  if (!role) return null;
  const draft = drafts[role.id] ?? '';

  function pick(id: string) {
    setPicked(id);
    const chosen = customRoles.find(candidate => custom(candidate.id) === id);
    if (id === NEW) setForm({ name: '', baseRole: roles[0]?.id ?? '', instructions: '' });
    else if (chosen) setForm({ name: chosen.name, baseRole: chosen.baseRole, instructions: chosen.instructions });
  }

  /** Sends one change; on success returns the reply's body, on a refusal says why and returns null. */
  async function send(url: string, method: string, body?: unknown) {
    setSaving(true);
    try {
      const reply = await fetch(url, { method, ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      const answer = await reply.json().catch(() => ({}));
      if (!reply.ok) {
        toast({ title: 'Not saved', description: answer.error ?? 'The change could not be saved', variant: 'destructive' });
        return null;
      }
      return answer;
    } catch {
      toast({ title: 'Not saved', description: 'The change could not be saved', variant: 'destructive' });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!role) return;
    const body = await send(`/api/workspaces/${encodeURIComponent(workspaceId)}/agent-roles/${encodeURIComponent(role.id)}`, 'PUT', { text: draft });
    if (!body) return;
    setSaved(current => ({ ...current, [role.id]: body.text }));
    setDrafts(current => ({ ...current, [role.id]: body.text }));
    toast({ title: 'Saved', description: `The next run of every ${role.name} seat in this workspace gets it.` });
  }

  const customUrl = (id?: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}/agent-custom-roles${id ? `/${encodeURIComponent(id)}` : ''}`;
  const replace = (next: CustomRole) => setCustomRoles(current => current.map(candidate => candidate.id === next.id ? next : candidate));

  async function createRole() {
    const body = await send(customUrl(), 'POST', form);
    if (!body) return;
    setCustomRoles(current => [...current, body.role].sort((a, b) => a.name.localeCompare(b.name)));
    setPicked(custom(body.role.id));
    setForm({ name: body.role.name, baseRole: body.role.baseRole, instructions: body.role.instructions });
    toast({ title: 'Role created', description: `${body.role.name} is under Your organisation.` });
  }

  async function saveRole(current: CustomRole) {
    const body = await send(customUrl(current.id), 'PATCH', { name: form.name, instructions: form.instructions });
    if (!body) return;
    replace(body.role);
    setForm({ name: body.role.name, baseRole: body.role.baseRole, instructions: body.role.instructions });
    toast({ title: 'Saved', description: `The next run of every ${body.role.name} seat gets it.` });
  }

  async function retire(current: CustomRole, retired: boolean) {
    const body = await send(customUrl(current.id), 'PATCH', { retired });
    if (!body) return;
    replace(body.role);
    toast({ title: retired ? 'Role retired' : 'Role brought back', description: retired ? 'No new seat can take it. Its seats keep it.' : 'New seats can take it again.' });
  }

  async function remove(current: CustomRole) {
    const body = await send(customUrl(current.id), 'DELETE');
    if (!body) return;
    setCustomRoles(list => list.filter(candidate => candidate.id !== current.id));
    setPicked(roles[0]?.id);
    toast({ title: 'Role deleted', description: `${current.name} is gone.` });
  }

  const organisation = saved[role.id] ?? '';
  const ownLayer = isNew || pickedCustom;
  const title = isNew ? 'New role' : pickedCustom ? pickedCustom.name : role.name;
  const changed = pickedCustom && (form.name !== pickedCustom.name || form.instructions !== pickedCustom.instructions);
  const seatsHave = pickedCustom && `${pickedCustom.seats} ${pickedCustom.seats === 1 ? 'seat has' : 'seats have'} this role`;
  const navItem = (active: boolean) => (
    `rounded px-2 py-1.5 text-left text-sm ${active ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`
  );
  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
      <nav aria-label="Roles" className="flex flex-col gap-1">
        <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Built-in</p>
        {roles.map(candidate => (
          <button key={candidate.id} type="button" onClick={() => pick(candidate.id)} aria-current={candidate.id === picked ? 'true' : undefined}
            className={navItem(candidate.id === picked)}>
            {candidate.name}
          </button>
        ))}
        {(customRoles.length > 0 || canEdit) && <p className="mt-3 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Your organisation</p>}
        {customRoles.map(candidate => (
          <button key={candidate.id} type="button" onClick={() => pick(custom(candidate.id))} aria-current={custom(candidate.id) === picked ? 'true' : undefined}
            className={`${navItem(custom(candidate.id) === picked)} flex flex-wrap items-center justify-between gap-1`}>
            <span className={candidate.retired ? 'line-through' : undefined}>{candidate.name}</span>
            <span className={BADGE}>{candidate.retired ? 'retired' : `like ${candidate.baseName}`}</span>
          </button>
        ))}
        {canEdit && (
          <button type="button" onClick={() => pick(NEW)} aria-current={isNew ? 'true' : undefined} className={navItem(isNew)}>+ New role</button>
        )}
      </nav>

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {ownLayer && <>Behaves like {role.name} · </>}Takes: {role.takes.join(', ') || 'nothing yet'} · Repository: {role.repository}
          </p>
        </div>

        <section aria-label="Layer 1: Platform" className="space-y-2 rounded-lg border border-dashed p-3">
          <h3 className={LAYER_TITLE}><span className={TAG}>Layer 1</span><Lock className="h-3.5 w-3.5" aria-hidden />Platform: {role.name} rules</h3>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans text-sm text-muted-foreground">{role.platform}</pre>
          <p className="text-xs text-muted-foreground">Written by Collab. The same for every organisation. Cannot be removed or edited here.</p>
        </section>

        <section aria-label="Layer 2: Your organisation" className="space-y-2 rounded-lg border p-3">
          <h3 className={LAYER_TITLE}><span className={TAG}>Layer 2</span>Your organisation</h3>
          {ownLayer ? <>
            <p className="text-xs text-muted-foreground">What your organisation adds for every {role.name} seat, this role&apos;s included. Edit it under {role.name}.</p>
            {organisation
              ? <pre className="whitespace-pre-wrap font-sans text-sm">{organisation}</pre>
              : <p className="text-sm text-muted-foreground">Nothing added for {role.name}.</p>}
          </> : <>
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
          </>}
        </section>

        {ownLayer && (
          <section aria-label="Layer 3: This role" className="space-y-2 rounded-lg border p-3">
            <h3 className={LAYER_TITLE}><span className={TAG}>Layer 3</span>This role</h3>
            <p className="text-xs text-muted-foreground">
              A seat with this role takes the issues and requests of a {role.name} seat and follows its rules; these instructions come after your organisation&apos;s.
              Do not put a password, a token or any other secret here.
            </p>
            {canEdit ? <>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Name</span>
                <input aria-label="Name" className={FIELD} value={form.name} maxLength={60} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
              </label>
              {isNew && (
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Behaves like</span>
                  <select aria-label="Behaves like" className={FIELD} value={form.baseRole} onChange={event => setForm(current => ({ ...current, baseRole: event.target.value }))}>
                    {roles.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                  </select>
                </label>
              )}
              <Textarea aria-label="Instructions for this role" rows={6} value={form.instructions}
                onChange={event => setForm(current => ({ ...current, instructions: event.target.value }))} />
              {isNew
                ? <Button onClick={createRole} disabled={saving || !form.name.trim()}>Create role</Button>
                : pickedCustom && <Button onClick={() => saveRole(pickedCustom)} disabled={saving || !changed || !form.name.trim()}>Save</Button>}
            </> : pickedCustom?.instructions
              ? <pre className="whitespace-pre-wrap font-sans text-sm">{pickedCustom.instructions}</pre>
              : <p className="text-sm text-muted-foreground">No instructions of its own.</p>}
          </section>
        )}

        <section aria-label={`Layer ${ownLayer ? 4 : 3}: One seat`} className="space-y-1 rounded-lg border p-3">
          <h3 className={LAYER_TITLE}><span className={TAG}>Layer {ownLayer ? 4 : 3}</span>One seat</h3>
          <p className="text-sm text-muted-foreground">Set on each seat&apos;s own page.</p>
        </section>

        {pickedCustom && (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="text-muted-foreground">
              {seatsHave}.{' '}
              {pickedCustom.retired ? 'Retired: no new seat can take it, and its seats keep it.' : pickedCustom.seats ? 'A role with seats cannot be deleted: retire it so no new seat takes it.' : ''}
            </p>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => retire(pickedCustom, !pickedCustom.retired)} disabled={saving}>{pickedCustom.retired ? 'Bring back' : 'Retire role'}</Button>
                <Button variant="outline" onClick={() => remove(pickedCustom)} disabled={saving || pickedCustom.seats > 0}>Delete role</Button>
              </div>
            )}
          </div>
        )}

        {!isNew && <Button variant="outline" onClick={() => setPreview(shown => !shown)}>{preview ? 'Hide what a run receives' : 'Show what a run receives'}</Button>}
        {preview && !isNew && (
          <div aria-label="What a run receives" className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="text-xs text-muted-foreground">What the next run of a {title} seat in this workspace starts with, in this order. Only saved text is shown.</p>
            {[
              ['1. Platform', role.platform],
              ['2. Your organisation', organisation || 'Nothing added.'],
              ...(pickedCustom ? [['3. This role', pickedCustom.instructions || 'Nothing added.']] : []),
              [`${pickedCustom ? 4 : 3}. The seat`, 'Set on each seat\'s own page.'],
            ].map(([heading, text]) => (
              <div key={heading}>
                <p className="font-medium">{heading}</p>
                <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{text}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
