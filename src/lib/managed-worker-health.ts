export function managedStatus(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const worker = value as { generation: string | null; closed: boolean; leaseUntil: string | null; heartbeatAt: string;
    state: string; taskId?: string | null; usage?: { day: string; estimatedUSD: number; chargedUSD: number; reservedUSD: number; unknownUSD: number; restarts: number;
      inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } };
  const online = !worker.closed && Date.parse(worker.leaseUntil || '') > Date.now();
  return { generation: worker.generation, closed: worker.closed, leaseUntil: worker.leaseUntil, heartbeatAt: worker.heartbeatAt,
    state: worker.state, usage: worker.usage, online, working: online && worker.state === 'working' };
}
