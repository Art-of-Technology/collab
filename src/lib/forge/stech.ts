import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { boundedJson, type ForgeBinding } from './reader';

export type ExecutionDeployment = NonNullable<ForgeBinding['execution']>['deployments'][number];
export type RunFrame = { type: 'started'; runId: string } | { type: 'done'; runId: string; stopReason: string; finalText: string } | { type: 'error' };
export const deploymentIdentity = (deployment: ExecutionDeployment) => createHash('sha256').update(JSON.stringify([deployment.origin, deployment.organization, deployment.agentId, deployment.revision, deployment.configuredModel])).digest('hex');
const runId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const started = z.object({ type: z.literal('started'), runId });
const done = z.object({ type: z.literal('done'), runId, stopReason: z.string().max(100), finalText: z.string().max(100000) });

async function connection(deployment: ExecutionDeployment) {
  const token = (await readFile(deployment.tokenFile, 'utf8')).trim();
  if (!token || token.length > 4096 || /\s/.test(token)) throw new Error('Execution credentials unavailable');
  return {
    base: `${new URL(deployment.origin).origin}/v1/orgs/${encodeURIComponent(deployment.organization)}/agents`,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  };
}

export async function qualifyDeployment(deployment: ExecutionDeployment, request: typeof fetch = fetch) {
  const { base, headers } = await connection(deployment);
  const get = (url: string) => request(url, { headers, signal: AbortSignal.timeout(10000), cache: 'no-store', redirect: 'error' });
  // The provider's response also contains a private runToken; never retain the full row.
  const response = z.object({ deployment: z.object({
    id: z.string(), status: z.string(), artifactSha256: z.string(), agentName: z.string().min(1).max(200),
  }) }).parse(await boundedJson(await get(`${base}/${encodeURIComponent(deployment.agentId)}`)));
  const current = response.deployment;
  if (current.id !== deployment.agentId || current.status !== 'live' || current.artifactSha256 !== deployment.revision) throw new Error('Execution deployment changed');
  const routes = z.object({ channels: z.array(z.object({ deploymentId: z.string().nullable() })).max(20) })
    .parse(await boundedJson(await get(`${base}/${encodeURIComponent(current.agentName)}/channels`)));
  if (routes.channels.some(channel => channel.deploymentId && channel.deploymentId !== deployment.agentId)) throw new Error('Execution routing changed');
  // This is a snapshot check, not a provider-side pin. Qualified routing must stay frozen.
}

export async function* parseRunStream(body: ReadableStream<Uint8Array>): AsyncGenerator<RunFrame> {
  const reader = body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let buffered = '', bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 5 * 1024 * 1024) throw new Error('Execution stream exceeded its limit');
      buffered = (buffered + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
      if (buffered.length > 1024 * 1024) throw new Error('Execution frame exceeded its limit');
      let end: number;
      while ((end = buffered.indexOf('\n\n')) !== -1) {
        const frame = buffered.slice(0, end); buffered = buffered.slice(end + 2);
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const value = JSON.parse(data) as { type?: unknown };
        if (value?.type === 'started') yield started.parse(value);
        else if (value?.type === 'done') yield done.parse(value);
        else if (value?.type === 'error') yield { type: 'error' };
      }
    }
    decoder.decode();
    if (buffered.trim()) throw new Error('Incomplete execution stream');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function openExecution(deployment: ExecutionDeployment, prompt: string, request: typeof fetch = fetch, signal = AbortSignal.timeout(30 * 60 * 1000)) {
  const { base, headers } = await connection(deployment);
  // No idempotent-start contract exists. The caller must persist LAUNCHING before this one POST.
  return request(`${base}/${encodeURIComponent(deployment.agentId)}/run-stream`, {
    method: 'POST', headers: { ...headers, Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }), signal, cache: 'no-store', redirect: 'error',
  });
}

export async function requestExecutionCancellation(deployment: ExecutionDeployment, id: string, request: typeof fetch = fetch) {
  runId.parse(id);
  const { base, headers } = await connection(deployment);
  const response = await request(`${base}/${encodeURIComponent(deployment.agentId)}/runs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST', headers, signal: AbortSignal.timeout(10000), cache: 'no-store', redirect: 'error',
  });
  if (response.status !== 202) throw new Error('Cancellation was not acknowledged');
  const receipt = z.object({ acknowledgedAt: z.string().datetime().nullable() }).passthrough().parse(await boundedJson(response));
  return receipt.acknowledgedAt ? new Date(receipt.acknowledgedAt) : null;
  // API acceptance and runtime acknowledgment are not terminal cancellation.
}
