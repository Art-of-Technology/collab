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

export async function watchInbox({ read, callback, callbackArgs, agent, workspaceId, origin,
  durationMs, intervalMs, callbackTimeoutMs, signal, report }) {
  const window = new AbortController();
  const timer = setTimeout(() => window.abort(), durationMs);
  const watchSignal = signal ? AbortSignal.any([signal, window.signal]) : window.signal;
  let lastDelivery, deliveredAt = 0, callbacks = 0, failure, reportingStarted = false;
  try {
    if (report) { await report('started', watchSignal); reportingStarted = true; }
    while (!watchSignal.aborted) {
      const claimed = queue(await read('claimed', watchSignal));
      watchSignal.throwIfAborted();
      const unseen = queue(await read('unseen', watchSignal));
      watchSignal.throwIfAborted();
      await report?.('poll', watchSignal);
      const payload = { version: 1, event: 'collab.inbox.pending', origin, workspaceId, agent, claimed, unseen };
      const deliveryId = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      if (claimed.items.length || unseen.items.length) {
        // Coalesce unchanged queues; remind once per minute until the agent drains them.
        // No persisted ACK: restarting may repeat a notification, never lose queued work.
        if (deliveryId !== lastDelivery || Date.now() - deliveredAt >= 60000) {
          await deliverWake(callback, callbackArgs, { ...payload, deliveryId }, callbackTimeoutMs, watchSignal);
          lastDelivery = deliveryId; deliveredAt = Date.now(); callbacks++;
          await report?.('wake', watchSignal);
        }
      } else lastDelivery = undefined;
      await delay(intervalMs, undefined, { signal: watchSignal });
    }
  } catch (error) {
    if (!watchSignal.aborted || (error !== watchSignal.reason && error.cause !== watchSignal.reason)) { failure = error; throw error; }
  } finally {
    clearTimeout(timer);
    if (reportingStarted) {
      try { await report(failure ? 'error' : 'stopped', undefined, failure ? (typeof failure.code === 'string' && /^[a-z_]{1,64}$/.test(failure.code) ? failure.code : 'watcher_failed') : undefined); }
      catch (error) { if (!failure) throw error; } // Preserve the original API/callback failure.
    }
  }
  return { agent, workspaceId, callbacks, ...(report && { healthReported: reportingStarted }), stopped: watchSignal.reason === signal?.reason, timedOut: watchSignal.reason === window.signal.reason };
}
