import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CliError } from './client.mjs';

// Only a locally configured executable/argv is run. Remote content is never code.
export function deliverWake(callback, args, event, timeout, signal) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.COLLAB_TOKEN;
    const child = spawn(callback, args, { shell: false, windowsHide: true, env, stdio: ['pipe', 'ignore', 'ignore'] });
    let failed = false;
    const stop = () => { failed = true; child.kill('SIGKILL'); };
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.on('error', () => { failed = true; });
    child.stdin.on('error', () => { failed = true; });
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      if (failed || code !== 0) reject(new CliError('wake_callback_failed', 'Wake callback failed or timed out; inbox work remains unchanged. Check the adapter before restarting.', 1));
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
  durationMs, intervalMs, callbackTimeoutMs, signal }) {
  const deadline = Date.now() + durationMs;
  let lastDelivery, deliveredAt = 0, callbacks = 0;
  try {
    while (!signal?.aborted && Date.now() < deadline) {
      const claimed = queue(await read('claimed', Math.max(1000, deadline - Date.now())));
      if (signal?.aborted || Date.now() >= deadline) break;
      const unseen = queue(await read('unseen', Math.max(1000, deadline - Date.now())));
      if (signal?.aborted || Date.now() >= deadline) break;
      const payload = { version: 1, event: 'collab.inbox.pending', origin, workspaceId, agent, claimed, unseen };
      const deliveryId = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      if (claimed.items.length || unseen.items.length) {
        // Coalesce unchanged queues; remind once per minute until the agent drains them.
        // No persisted ACK: restarting may repeat a notification, never lose queued work.
        if (deliveryId !== lastDelivery || Date.now() - deliveredAt >= 60000) {
          await deliverWake(callback, callbackArgs, { ...payload, deliveryId }, Math.min(callbackTimeoutMs, deadline - Date.now()), signal);
          lastDelivery = deliveryId; deliveredAt = Date.now(); callbacks++;
        }
      } else lastDelivery = undefined;
      await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())), undefined, { signal });
    }
  } catch (error) {
    if (!signal?.aborted) throw error;
  }
  return { agent, workspaceId, callbacks, stopped: signal?.aborted || false, timedOut: !signal?.aborted };
}
