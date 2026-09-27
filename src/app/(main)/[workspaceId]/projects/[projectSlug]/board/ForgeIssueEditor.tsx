'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { IssueView, IssueResult, IssueFields } from '@/lib/forge/issue-service';
import { taskStatuses, taskPriorities } from '@/lib/forge/tasks';
import { changeIssue, getIssue } from './actions';

const resultMessage = (result: IssueResult) => result.kind === 'saved' ? 'Saved and verified.' : result.kind === 'conflict'
  ? 'The source changed. Your draft is retained. Reload and review before saving again.'
  : result.kind === 'uncertain' ? 'The result could not be verified. Your draft is retained. Reload the issue and check before trying again.'
  : result.kind === 'rejected' ? 'The project rejected this change or the target no longer exists. Reload the issue.'
  : result.kind === 'denied' ? 'You do not have permission for this change.'
  : result.kind === 'invalid' ? 'Check the entered values.' : 'The project could not be reached. Your draft is retained.';

export function ForgeIssueEditor({ number, workspaceSlug, projectSlug, onSaved, onDenied }: {
  number: number; workspaceSlug: string; projectSlug: string; onSaved: () => void; onDenied: () => void;
}) {
  const [view, setView] = useState<IssueView | null>(null);
  const [baseline, setBaseline] = useState<IssueFields | null>(null);
  const [fields, setFields] = useState<IssueFields | null>(null);
  const [comment, setComment] = useState('');
  const [editingComment, setEditingComment] = useState<number | null>(null);
  const [commentExpected, setCommentExpected] = useState('');
  const [message, setMessage] = useState('');
  const [blocked, setBlocked] = useState(false);
  const dirty = useRef(new Set<keyof IssueFields>());
  const [reviewRequired, setReviewRequired] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    let active = true;
    getIssue(workspaceSlug, projectSlug, number).then(next => {
      if (!active) return;
      setView(next); if (next.kind === 'ready') { setFields(next.fields); setBaseline(next.fields); }
      if (next.kind === 'denied') onDenied();
    }).catch(() => { if (active) setView({ kind: 'unavailable' }); });
    return () => { active = false; };
  }, [number, workspaceSlug, projectSlug, onDenied]);
  const ready = view?.kind === 'ready' ? view : null;
  const reload = () => start(async () => {
    try {
      const next = await getIssue(workspaceSlug, projectSlug, number);
      setView(next);
      if (next.kind === 'denied') { setFields(null); setComment(''); onDenied(); }
      if (next.kind === 'ready') {
        setBaseline(next.fields);
        setReviewRequired(previous => previous || [...dirty.current].some(key => baseline && baseline[key] !== next.fields[key]));
        setFields(previous => Object.fromEntries(Object.entries(next.fields).map(([key, value]) =>
          [key, dirty.current.has(key as keyof IssueFields) && previous ? previous[key as keyof IssueFields] : value])) as IssueFields);
        setBlocked(false); setMessage('Source reloaded. Your edits are retained; untouched fields are refreshed. Review any overlapping changes.');
      }
    } catch { setMessage('Reload failed. Your draft is retained.'); }
  });
  const submit = (input: { action: string; [key: string]: unknown }) => start(async () => {
    let verified = false;
    try {
      const result = await changeIssue(workspaceSlug, projectSlug, input);
      setMessage(resultMessage(result));
      if (result.kind === 'denied') { setView({ kind: 'denied' }); setFields(null); setComment(''); onDenied(); return; }
      if (result.kind === 'conflict' || result.kind === 'uncertain' || result.kind === 'rejected') setBlocked(true);
      if (result.kind === 'saved') {
        verified = true;
        onSaved();
        const next = await getIssue(workspaceSlug, projectSlug, number);
        setView(next);
        if (next.kind === 'unavailable') setBlocked(true);
        if (next.kind === 'denied') { setFields(null); setComment(''); onDenied(); return; }
        if (next.kind === 'ready') {
          setBaseline(next.fields);
          if (input.action === 'edit') { setFields(next.fields); dirty.current.clear(); setReviewRequired(false); }
          else {
            setReviewRequired(previous => previous || [...dirty.current].some(key => baseline && baseline[key] !== next.fields[key]));
            setFields(previous => Object.fromEntries(Object.entries(next.fields).map(([key, value]) =>
              [key, dirty.current.has(key as keyof IssueFields) && previous ? previous[key as keyof IssueFields] : value])) as IssueFields);
          }
        }
        if (input.action !== 'edit') { setComment(''); setEditingComment(null); }
      }
    } catch {
      setBlocked(true);
      setMessage(verified ? 'Saved and verified, but the latest details could not be loaded. Reload before editing again.'
        : 'The result is unknown. Reload and check before trying again. Your draft is retained.');
    }
  });
  if (!view) return <p role="status">Loading issue and comments…</p>;
  if (!ready || !fields) return <div role="alert">{view.kind !== 'denied' && message && <p role="status">{message}</p>}<p>{view.kind === 'denied' ? 'You no longer have access to this issue.' : 'Could not load issue details.'}</p><Button onClick={reload} disabled={pending}>Reload issue</Button></div>;
  const set = (key: keyof IssueFields, value: string) => {
    if (value === ready.fields[key]) dirty.current.delete(key); else dirty.current.add(key);
    setFields({ ...fields, [key]: value });
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (reviewRequired) return;
    const changes = Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== ready.fields[key as keyof IssueFields]));
    if (!Object.keys(changes).length) { setMessage('No changes to save.'); return; }
    submit({ action: 'edit', number, expected: ready.snapshot.fingerprint, changes });
  };
  return <div className="min-w-0 space-y-5">
    {message && <p role="status" className="break-words text-sm">{message}</p>}
    <Button variant="outline" onClick={reload} disabled={pending}>Reload source, keep draft</Button>
    <details className="text-sm"><summary className="cursor-pointer">Current source text for comparison</summary><p>Title: {ready.snapshot.issue.title}</p><p>Status: {ready.snapshot.issue.state}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-3">{ready.snapshot.issue.body || 'No description'}</pre></details>
    {ready.bodyWarning && <p role="alert" className="text-amber-300">Task detail blocks need review in the source issue before editing. Comments remain available.</p>}
    <form onSubmit={save}>
      <fieldset disabled={pending || blocked || ready.bodyWarning} className="min-w-0 space-y-3">
        <label className="block text-sm">Title<Input value={fields.title} onChange={e => set('title', e.target.value)} required maxLength={200} disabled={!ready.rights.canEdit} /></label>
        <label className="block text-sm">Description<Textarea value={fields.description} onChange={e => set('description', e.target.value)} rows={6} disabled={!ready.rights.canEdit} /></label>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="block text-sm">Status<select className="block w-full rounded border bg-background p-2" value={fields.status} onChange={e => set('status', e.target.value)} disabled={!ready.rights.canStatus}>{taskStatuses.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="block text-sm">Priority<select className="block w-full rounded border bg-background p-2" value={fields.priority} onChange={e => set('priority', e.target.value)} disabled={!ready.rights.canEdit}>{taskPriorities.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="block text-sm">Owner<Input value={fields.owner} onChange={e => set('owner', e.target.value)} maxLength={200} disabled={!ready.rights.canAssign} /></label>
          <label className="block text-sm">Due date<Input type="date" value={fields.dueDate} onChange={e => set('dueDate', e.target.value)} disabled={!ready.rights.canEdit} /></label>
          <label className="block text-sm">Follow-up date<Input type="date" value={fields.followUpDate} onChange={e => set('followUpDate', e.target.value)} disabled={!ready.rights.canEdit} /></label>
        </div>
        <label className="block text-sm">Next action<Textarea value={fields.nextAction} onChange={e => set('nextAction', e.target.value)} disabled={!ready.rights.canEdit} /></label>
        {reviewRequired && <label className="flex gap-2 text-sm"><input type="checkbox" onChange={event => { if (event.target.checked) setReviewRequired(false); }} />I reviewed the source changes that overlap my edits.</label>}
        {(ready.rights.canEdit || ready.rights.canStatus || ready.rights.canAssign) && <Button type="submit" disabled={reviewRequired}>{pending ? 'Saving…' : 'Save changes'}</Button>}
      </fieldset>
    </form>
    <section className="min-w-0 space-y-3" aria-label="Issue comments">
      <h3 className="font-medium">Comments</h3>
      {ready.snapshot.partialComments && <p role="status">Only the first 1,000 comments were loaded.</p>}
      {!ready.snapshot.comments.length && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {ready.snapshot.comments.map(item => <article key={item.id} className="min-w-0 rounded border p-3">
        <p className="text-sm text-muted-foreground">{item.user.login}</p><p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>
        {item.canEdit && <Button variant="outline" size="sm" disabled={pending || blocked} onClick={() => { setEditingComment(item.id); setCommentExpected(item.fingerprint); setComment(item.body); }}>Edit shared-account comment</Button>}
        {editingComment === item.id && commentExpected !== item.fingerprint && <Button variant="outline" disabled={pending || blocked} onClick={() => setCommentExpected(item.fingerprint)}>I reviewed the updated comment above</Button>}
      </article>)}
      {(ready.rights.canComment || editingComment !== null) && <form onSubmit={event => {
        event.preventDefault();
        const existing = ready.snapshot.comments.find(item => item.id === editingComment);
        if (editingComment !== null && !existing) { setMessage('The edited comment is no longer loaded. Cancel editing and reload; it will not be posted as a new comment.'); return; }
        submit(existing ? { action: 'edit-comment', number, commentId: existing.id, expected: commentExpected, body: comment } : { action: 'comment', number, body: comment });
      }}>
        <fieldset disabled={pending || blocked} className="space-y-2">
          <label className="block text-sm">{editingComment === null ? 'New comment' : 'Edit comment'}<Textarea value={comment} onChange={e => setComment(e.target.value)} required maxLength={32000} /></label>
          <p className="text-xs text-muted-foreground">Posted through the project’s shared Forge account.</p>
          <Button type="submit">{editingComment === null ? 'Post comment' : 'Save comment'}</Button>
          {editingComment !== null && <Button type="button" variant="outline" onClick={() => { setEditingComment(null); setComment(''); }}>Cancel edit</Button>}
        </fieldset>
      </form>}
    </section>
  </div>;
}

export function ForgeIssueCreate({ workspaceSlug, projectSlug, onSaved }: { workspaceSlug: string; projectSlug: string; onSaved: () => void }) {
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [message, setMessage] = useState('');
  const [blocked, setBlocked] = useState(false), [pending, start] = useTransition();
  return <form onSubmit={event => { event.preventDefault(); start(async () => {
    try {
      const result = await changeIssue(workspaceSlug, projectSlug, { action: 'create', title, description });
      setMessage(resultMessage(result));
      if (result.kind === 'saved') onSaved();
      if (result.kind === 'uncertain') setBlocked(true);
    } catch { setBlocked(true); setMessage('The result is unknown. Close this dialog and refresh the board to check before trying again.'); }
  }); }} className="space-y-3">
    {message && <p role="status">{message}</p>}
    {blocked && <p role="alert">Close this dialog and refresh the board to check whether the issue was created before trying again.</p>}
    <fieldset disabled={pending || blocked} className="space-y-3">
      <label className="block text-sm">Title<Input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="block text-sm">Description<Textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} /></label>
      <Button type="submit">{pending ? 'Creating…' : 'Create issue'}</Button>
    </fieldset>
  </form>;
}
