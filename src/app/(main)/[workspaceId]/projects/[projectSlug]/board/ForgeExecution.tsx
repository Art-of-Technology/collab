'use client';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import type { ExecutionView } from '@/lib/forge/execution-service';
import { getExecution, markReady, cancelRun } from './actions';

export function ForgeExecution({ number, workspaceSlug, projectSlug, expected, expectedDiscussion, closed, dirty, onDenied, onReady }: {
  number: number; workspaceSlug: string; projectSlug: string; expected: string; expectedDiscussion: string; closed: boolean; dirty: boolean;
  onDenied: () => void; onReady: () => void;
}) {
  const [view, setView] = useState<ExecutionView | null>(null);
  const [deploymentKey, setDeploymentKey] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [confirmedKey, setConfirmed] = useState(''), [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await getExecution(workspaceSlug, projectSlug, number);
        if (!active) return;
        setView(next);
        if (next.kind === 'denied') { setSelected([]); onDenied(); }
      } catch { if (active) setView({ kind: 'unavailable' }); }
    };
    void load();
    const timer = setInterval(() => { void load(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [workspaceSlug, projectSlug, number, onDenied]);
  if (!view || view.kind === 'not-configured') return null;
  if (view.kind !== 'ready') return <p role="status">Execution details are unavailable.</p>;
  const latest = view.attempts[0];
  const chosen = view.deployments.find(item => item.key === deploymentKey);
  const reviewKey = JSON.stringify([expected, expectedDiscussion, view.memorySha, chosen?.identity, selected, latest?.id]);
  const confirmed = confirmedKey === reviewKey;
  const retry = latest?.safeToRetry && ['FAILED', 'CANCELLED', 'RESULT_MISSING'].includes(latest.state);
  const mayStart = !latest || retry;
  const active = latest && ['PREPARING', 'READY', 'LAUNCHING', 'RUNNING', 'CANCEL_REQUESTED'].includes(latest.state);
  return <section aria-label="Agent execution" className="min-w-0 space-y-3 rounded border p-3">
    <h3 className="font-medium">Agent execution</h3>
    {message && <p role="status" className="text-sm">{message}</p>}
    {view.canManage && mayStart && <form onSubmit={event => { event.preventDefault(); start(async () => {
      try {
        const result = await markReady(workspaceSlug, projectSlug, { number, expected, expectedDiscussion, memorySha: view.memorySha, deploymentKey, expectedDeployment: chosen?.identity, relevantIds: selected, retryOf: latest?.id ?? null });
        if (result.kind === 'denied') { setView({ kind: 'denied' }); onDenied(); return; }
        setConfirmed('');
        setMessage(result.kind === 'ready' ? 'Ready recorded. Execution will begin when the worker accepts it.' : result.kind === 'too-large' ? 'Task and approved context exceed the execution size limit. Shorten them before retrying.' : 'Ready could not be verified. Reload the source and review the latest receipt before trying again.');
        setView(await getExecution(workspaceSlug, projectSlug, number)); onReady();
      } catch { setConfirmed(''); setMessage('The result is unknown. Check the latest receipt before trying again.'); }
    }); }}>
      <fieldset disabled={pending || dirty || closed || !view.memorySha} className="min-w-0 space-y-3">
        <label className="block text-sm">Configured model / deployment<select required value={deploymentKey} onChange={event => { setDeploymentKey(event.target.value); setConfirmed(''); }} className="block w-full min-w-0 rounded border bg-background p-2">
          <option value="">Choose a deployment</option>{view.deployments.map(item => <option key={item.key} value={item.key}>{item.label} · {item.configuredModel}</option>)}
        </select></label>
        <p className="text-xs text-muted-foreground">The model is operator-configured. Provider routing must remain qualified for this deployment.</p>
        <p className="text-sm">Approved Rules are always included. Select other relevant approved notes:</p>
        {view.notes.map(note => <label key={note.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={note.type === 'Rules' || selected.includes(note.id)} disabled={note.type === 'Rules'} onChange={event => { setSelected(ids => event.target.checked ? [...ids, note.id] : ids.filter(id => id !== note.id)); setConfirmed(''); }} /><span className="min-w-0 break-words">{note.title} · {note.type} · revision {note.revision}</span></label>)}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked ? reviewKey : '')} /><span>I reviewed this task and approved context, and authorize a potentially billable execution.</span></label>
        <Button type="submit" disabled={!confirmed || !deploymentKey}>{pending ? 'Recording…' : retry ? 'Start reviewed retry' : 'Mark Ready and run'}</Button>
      </fieldset>
      {dirty && <p className="text-sm">Save or review your task edits before marking Ready.</p>}
      {closed && <p className="text-sm">Closed tasks cannot run.</p>}
    </form>}
    {view.attempts.map((attempt, index) => <article key={attempt.id} className="min-w-0 space-y-2 border-t pt-3">
      <p className="break-words text-sm font-medium">{attempt.state.replaceAll('_', ' ')} · {attempt.configuredModel}</p>
      <p className="break-words text-xs text-muted-foreground">{attempt.createdAt} · {attempt.id}</p>
      <p className="text-sm">{attempt.receipt}</p>
      {attempt.cancelAcknowledged && <p className="text-sm">Provider acknowledged the cancellation request; this alone does not confirm the run stopped.</p>}
      {attempt.result && <details><summary className="cursor-pointer text-sm">Review agent result</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{attempt.result}</pre></details>}
      {index === 0 && active && view.canManage && <Button variant="outline" disabled={pending} onClick={() => start(async () => {
        try {
          const result = await cancelRun(workspaceSlug, projectSlug, attempt.id);
          if (result.kind === 'denied') { setView({ kind: 'denied' }); onDenied(); return; }
          setMessage(result.kind === 'cancelled' ? 'Cancelled before launch.' : 'Cancellation requested. Check the receipt for terminal confirmation.');
          setView(await getExecution(workspaceSlug, projectSlug, number));
        } catch { setMessage('Cancellation could not be confirmed. Check the latest receipt.'); }
      })}>Request cancellation</Button>}
    </article>)}
  </section>;
}
