import type { AgentDefinition } from './types';
import { cleoAgent } from './cleo';
import { coclawAgent } from './coclaw';

// Code-defined agents — Cleo (direct Anthropic) + Coclaw (per-user gateway proxy)
const CODE_AGENTS: Record<string, AgentDefinition> = {
  cleo: cleoAgent,
  coclaw: coclawAgent,
};

// In-memory cache for DB-backed agents
let agentCache: Map<string, AgentDefinition> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isCacheValid(): boolean {
  return agentCache !== null && Date.now() - cacheTimestamp < CACHE_TTL;
}

/**
 * Get all available agents (Cleo + Coclaw).
 * DB agent support is preserved but not active yet — will be enabled later.
 */
export async function getAllAgents(_prisma?: any): Promise<AgentDefinition[]> {
  if (isCacheValid() && agentCache) {
    return Array.from(agentCache.values());
  }

  // Code-defined agents only for now
  agentCache = new Map(Object.entries(CODE_AGENTS));
  cacheTimestamp = Date.now();
  return Object.values(CODE_AGENTS);
}

/**
 * Get a specific agent by slug. Tries DB first, falls back to code definitions.
 */
export async function getAgent(
  slug: string,
  prisma?: any
): Promise<AgentDefinition | null> {
  if (isCacheValid() && agentCache) {
    return agentCache.get(slug) ?? null;
  }

  // Populate cache
  await getAllAgents(prisma);

  return agentCache?.get(slug) ?? CODE_AGENTS[slug] ?? null;
}

/**
 * Get the default agent.
 */
export async function getDefaultAgent(
  prisma?: any
): Promise<AgentDefinition> {
  const agents = await getAllAgents(prisma);
  return agents.find((a) => a.isDefault) ?? agents[0] ?? cleoAgent;
}

/**
 * Invalidate the agent cache (call after DB updates).
 */
export function invalidateAgentCache(): void {
  agentCache = null;
  cacheTimestamp = 0;
}

/**
 * Get a code-defined agent (no DB needed, for use in seed scripts etc.)
 */
export function getCodeAgent(slug: string): AgentDefinition | undefined {
  return CODE_AGENTS[slug];
}

/**
 * Get all code-defined agents.
 */
export function getAllCodeAgents(): AgentDefinition[] {
  return Object.values(CODE_AGENTS);
}
