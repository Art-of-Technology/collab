import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CliError } from './client.mjs';

// Only a locally configured executable/argv is run. Remote content is never code.
export function deliverWake(callback, args, event, timeout, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toUpperCase() === 'COLLAB_TOKEN') delete env[key];
    const child = spawn(callback, args, { shell: false, windowsHide: true, env, stdio: ['pipe', 'ignore', 'ignore'] });
    const failure = new CliError('wake_callback_failed', 'Wake callback failed or timed out; inbox work remains unchanged. Check the adapter before restarting.', 1);
    let error;
    const stop = reason => { error ||= reason; child.kill('SIGKILL'); };
    const cancel = () => stop(signal.reason);
    const timer = setTimeout(() => stop(failure), timeout);
    signal?.addEventListener('abort', cancel, { once: true });
    child.on('error', () => { error ||= failure; });
    child.stdin.on('error', () => { error ||= failure; });
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if ((code !== null && code !== 0) || (exitSignal && (exitSignal !== 'SIGKILL' || !child.killed))) error = failure;
      if (error || code !== 0) reject(error || failure);
      else resolve();
    });
    child.stdin.end(JSON.stringify(event) + '\n');
  });
}

function queue(result) {
  if (!Array.isArray(result?.items) || typeof result.hasMore !== 'boolean' || result.items.length > 50 ||
    result.items.some(item => typeof item.id !== 'string' || item.id.length > 128 || !['open', 'claimed', 'completed'].includes(item.status))) {
    throw new CliError('invalid_response', 'Expected a bounded agent inbox.', 5);
  }
  return { items: result.items.map(({ id, status }) => ({ id, status })), hasMore: result.hasMore };
}

// The server being away for a moment: unreachable, answering 5xx, or throttling. The watcher's only
// write is its heartbeat, and repeating one changes nothing, so a heartbeat whose answer never came
// or was a 5xx counts too. A heartbeat that was answered with something unreadable does not: that
// error carries the status it was answered with.
const serverAway = error => ['transport_failed', 'rate_limited'].includes(error?.code) ||
  (error?.code === 'server_error' && error.details?.status >= 500) ||
  (error?.code === 'outcome_unknown' && !(error.details?.status < 500));

export async function watchInbox({ read, callback, callbackArgs, agent, workspaceId, origin,
  durationMs, intervalMs, callbackTimeoutMs, signal, report, outageMs = 300000 }) {
  const window = new AbortController();
  const timer = setTimeout(() => window.abort(), durationMs);
  const watchSignal = signal ? AbortSignal.any([signal, window.signal]) : window.signal;
  let lastDelivery, deliveredAt = 0, callbacks = 0, failure, skippedPolls = 0, answered = Date.now();
  // Does the server know this watcher? 'perhaps' is a start whose answer never came.
  let started = 'no';
  // The app restarts on every deploy. While the server is away the watcher keeps trying, so it keeps
  // its identity and its health recovers by itself. Five minutes after the last answered poll (when
  // the server calls a watcher stale) it gives up.
  const tolerated = error => serverAway(error) && Date.now() - answered < outageMs;
  try {
    while (!watchSignal.aborted) {
      try {
        if (report && started !== 'yes') {
          try { await report('started', watchSignal); started = 'yes'; }
          catch (error) { if (error?.code === 'outcome_unknown' || watchSignal.aborted) started = 'perhaps'; throw error; }
        }
        const claimed = queue(await read('claimed', watchSignal));
        watchSignal.throwIfAborted();
        const unseen = queue(await read('unseen', watchSignal));
        watchSignal.throwIfAborted();
        await report?.('poll', watchSignal);
        answered = Date.now();
        const payload = { version: 1, event: 'collab.inbox.pending', origin, workspaceId, agent, claimed, unseen };
        const deliveryId = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        if (claimed.items.length || unseen.items.length) {
          // Coalesce unchanged queues; remind once per minute until the agent drains them.
          // No persisted ACK: restarting may repeat a notification, never lose queued work.
          if (deliveryId !== lastDelivery || Date.now() - deliveredAt >= 60000) {
            await deliverWake(callback, callbackArgs, { ...payload, deliveryId }, callbackTimeoutMs, watchSignal);
            lastDelivery = deliveryId; deliveredAt = Date.now();
            callbacks++; await report?.('wake', watchSignal);
          }
        } else lastDelivery = undefined;
      } catch (error) {
        if (watchSignal.aborted || !tolerated(error)) throw error;
        skippedPolls++; // This poll is skipped; the next one tries again.
      }
      await delay(intervalMs, undefined, { signal: watchSignal });
    }
  } catch (error) {
    if (!watchSignal.aborted || (error !== watchSignal.reason && error.cause !== watchSignal.reason)) { failure = error; throw error; }
  } finally {
    clearTimeout(timer);
    while (started !== 'no') {
      try {
        await report(failure ? 'error' : 'stopped', undefined, failure ? (typeof failure.code === 'string' && /^[a-z_]{1,64}$/.test(failure.code) ? failure.code : 'watcher_failed') : undefined);
        break;
      } catch (error) {
        // The window can end while the server is away. Without this last report the server keeps
        // showing the watcher as running and refuses the next one, so an orderly end repeats it like
        // a poll. A watcher that is ending on a failure reports once and goes.
        if (!failure && tolerated(error)) { await delay(intervalMs); continue; }
        // A start the server never saw has nothing to stop, so its refusal of this report is expected;
        // a server that stayed away is not. (A start still in flight can land after this report:
        // that record then turns stale by itself.)
        if (!failure && (started === 'yes' || serverAway(error))) throw error;
        break; // Preserve the original API/callback failure.
      }
    }
  }
  return { agent, workspaceId, callbacks, ...(skippedPolls && { skippedPolls }), ...(report && { healthReported: started === 'yes' }), stopped: watchSignal.reason === signal?.reason, timedOut: watchSignal.reason === window.signal.reason };
}
