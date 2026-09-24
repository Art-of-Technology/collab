'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { MemoryView, MemoryCommand } from '@/lib/forge/memory-service';
import type { MemoryRevision, MemoryDraft } from '@/lib/forge/memory';
import { refreshProjectMemory, updateProjectMemory } from '@/app/(main)/[workspaceId]/projects/[projectSlug]/notes/memory/actions';

const empty: MemoryDraft = { title: '', type: 'Rules', body: '', sources: [] };
export function ProjectMemoryEditor({ initial, workspace, project }: {
  initial: Exclude<MemoryView, { kind: 'denied' }>; workspace: string; project: string;
}) {
  const [view, setView] = useState<MemoryView>(initial);
  const [editing, setEditing] = useState<{ id: string | null; sha: string | null; draft: MemoryDraft } | null>(null);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const ready = view.kind === 'ready' ? view : null;
  const refresh = () => startTransition(async () => {
    try {
      const next = await refreshProjectMemory(workspace, project);
      if (next.kind === 'unavailable') { setMessage('Could not refresh. Previously loaded content may be stale.'); return; }
      setView(next);
      if (next.kind === 'denied') setEditing(null);
      setMessage(editing ? 'Latest source loaded. Your unsaved text is retained; reopen the current note before applying it to a new revision.' : 'Latest source loaded.');
    } catch { setMessage('Could not refresh. Try again.'); }
  });
  const change = (command: MemoryCommand) => startTransition(async () => {
    try {
      const result = await updateProjectMemory(workspace, project, command);
      if (result.kind === 'saved') { setView(result.view); setEditing(null); setMessage('Saved and verified against the source.'); }
      else if (result.kind === 'denied') { setView({ kind: 'denied' }); setEditing(null); setMessage('You no longer have permission for this action.'); }
      else setMessage(result.kind === 'conflict' ? (command.action === 'approve' ? 'The draft changed. Refresh and review the latest text before approving.' : 'The source changed. Your text is retained. Copy it, refresh, and reopen the latest note before saving.') :
        result.kind === 'uncertain' ? 'Save could not be confirmed. Your text is retained. Refresh and compare before trying again.' :
        result.kind === 'invalid' ? 'Check the title, Markdown and source links. The document was not saved.' : 'The source is unavailable. Your text is retained. Try refreshing.');
    } catch { setMessage('Save could not be confirmed. Your text is retained. Refresh and compare before trying again.'); }
  });
  const edit = (note?: MemoryRevision) => {
    if (!ready) return;
    setEditing({ id: note?.id ?? null, sha: ready.snapshot.sha,
      draft: note ? { title: note.title, type: note.type, body: note.body, sources: note.sources } : { ...empty } });
    setMessage('');
  };
  const notes = [...(ready?.snapshot.document.revisions ?? [])].sort((a, b) =>
    ({ Draft: 0, Approved: 1, Superseded: 2 }[a.state] - { Draft: 0, Approved: 1, Superseded: 2 }[b.state]) || b.revision - a.revision);
  return <div className="h-full overflow-y-auto p-4 pb-32 md:p-8 md:pb-32">
    <div className="mx-auto max-w-4xl space-y-6">
      <Link className="text-sm underline" href={`/${workspace}/projects/${project}/notes`}>All project notes</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Approved project memory</h1>
          <p className="mt-2 text-sm text-muted-foreground">Rules, strategy, decisions and handoffs. Drafts require approval before agents can use them.</p></div>
        <Button variant="outline" disabled={pending} onClick={refresh}>{pending ? 'Working…' : 'Refresh'}</Button>
      </header>
      <p className="text-sm text-muted-foreground">Use credential references only. Do not include passwords, tokens or private keys. Existing notes are not copied here automatically.</p>
      {message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
      {view.kind === 'denied' && <p role="alert">Project memory is no longer accessible.</p>}
      {view.kind === 'not-connected' && <p>Project memory connection is not ready. A workspace owner must verify a separate, scoped writer.</p>}
      {view.kind === 'unavailable' && <p role="alert">Could not load project memory. Try Refresh.</p>}
      {ready && <>
        <p className="break-all text-xs text-muted-foreground">{view.kind === 'ready' && view.projectName} · Source revision {ready.snapshot.sha ?? 'not created'}</p>
        {ready.canCreate && !editing && <Button disabled={pending} onClick={() => edit()}>New draft</Button>}
        {editing && <form className="space-y-4 rounded-xl border p-4" onSubmit={event => { event.preventDefault(); change({ action: 'save', noteId: editing.id, expectedSha: editing.sha, draft: { ...editing.draft, sources: editing.draft.sources.map(value => value.trim()).filter(Boolean) } }); }}>
          <fieldset disabled={pending} className="space-y-4">
          <label className="block space-y-1 text-sm">Title<Input required maxLength={200} value={editing.draft.title} onChange={event => setEditing({ ...editing, draft: { ...editing.draft, title: event.target.value } })} /></label>
          <label className="block space-y-1 text-sm">Type<select className="block h-10 rounded-md border bg-background px-3" value={editing.draft.type} onChange={event => setEditing({ ...editing, draft: { ...editing.draft, type: event.target.value as MemoryDraft['type'] } })}>
            {(['Rules', 'Strategy', 'Decisions', 'Handoffs'] as const).map(type => <option key={type}>{type}</option>)}
          </select></label>
          <label className="block space-y-1 text-sm">Markdown<Textarea required rows={12} maxLength={32000} value={editing.draft.body} onChange={event => setEditing({ ...editing, draft: { ...editing.draft, body: event.target.value } })} /></label>
          <label className="block space-y-1 text-sm">Source Slack links (one per line)<Textarea rows={3} value={editing.draft.sources.join('\n')} onChange={event => setEditing({ ...editing, draft: { ...editing.draft, sources: event.target.value.split('\n') } })} /></label>
          <div className="flex flex-wrap gap-2"><Button disabled={pending} type="submit">Save draft</Button><Button disabled={pending} variant="outline" type="button" onClick={() => setEditing(null)}>Discard unsaved draft</Button></div>
          </fieldset>
        </form>}
        {!notes.length && !editing && <p>No project memory yet. Start with a Rules draft.</p>}
        {notes.map(note => <article key={`${note.id}:${note.revision}`} className="min-w-0 space-y-3 rounded-xl border p-4">
          <h2 className="break-words font-semibold">{note.title}</h2>
          <p className="text-sm text-muted-foreground">{note.type} · {note.state} · Revision {note.revision}</p>
          <p className="break-all text-xs text-muted-foreground">Owner {note.ownerId} · Updated by {note.updatedBy} at {note.updatedAt}{note.approvedBy && ` · Approved by ${note.approvedBy} at ${note.approvedAt}`}</p>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">{note.body}</pre>
          {note.sources.map((source, index) => <a key={index} href={source} target="_blank" rel="noopener noreferrer" className="block break-all text-sm underline">Source discussion {index + 1}</a>)}
          <div className="flex flex-wrap gap-2">
            {!editing && note.state !== 'Superseded' && (ready.canEditAny || ready.canEditOwn && note.ownerId === ready.actorId) && <Button disabled={pending} variant="outline" onClick={() => edit(notes.find(item => item.id === note.id && item.state === 'Draft') ?? note)}>Edit draft</Button>}
            {!editing && note.state === 'Draft' && ready.canApprove && <Button disabled={pending} onClick={() => change({ action: 'approve', expectedSha: ready.snapshot.sha, noteId: note.id, revision: note.revision })}>Approve revision {note.revision}</Button>}
          </div>
        </article>)}
        <p className="text-xs text-muted-foreground">Older revisions remain in the source repository history. Future executor integration will use approved Rules and selected relevant approved notes. Delivery to running agents is not connected yet.</p>
      </>}
    </div>
  </div>;
}
