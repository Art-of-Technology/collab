import type { AgentDefinition } from './types';
import { alexAgent } from './alex';
import { novaAgent } from './nova';

// In-memory cache of code-defined agents (fallback)
const CODE_AGENTS: Record<string, AgentDefinition> = {
  alex: alexAgent,
  nova: novaAgent,
};

// In-memory cache for DB-backed agents
let agentCache: Map<string, AgentDefinition> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isCacheValid(): boolean {
  return agentCache !== null && Date.now() - cacheTimestamp < CACHE_TTL;
}

/**
 * Get all available agents. Merges DB data with code-defined system prompts.
 * Code-defined systemPrompts take precedence to ensure latest action formats are used.
 */
export async function getAllAgents(prisma?: any): Promise<AgentDefinition[]> {
  if (isCacheValid() && agentCache) {
    return Array.from(agentCache.values());
  }

  if (prisma) {
    try {
      const dbAgents = await prisma.aIAgent.findMany({
        where: { isActive: true },
        orderBy: { isDefault: 'desc' },
      });

      if (dbAgents.length > 0) {
        agentCache = new Map();
        for (const agent of dbAgents) {
          // Use code-defined systemPrompt if available (has latest action formats)
          const codeAgent = CODE_AGENTS[agent.slug];
          const def: AgentDefinition = {
            slug: agent.slug,
            name: agent.name,
            avatar: agent.avatar ?? undefined,
            color: agent.color,
            // Prefer code-defined systemPrompt for latest action instructions
            systemPrompt: codeAgent?.systemPrompt || agent.systemPrompt,
            capabilities: (codeAgent?.capabilities || agent.capabilities) as AgentDefinition['capabilities'],
            personality: agent.personality ?? '',
            description: agent.description ?? '',
            isDefault: agent.isDefault,
          };
          agentCache.set(agent.slug, def);
        }
        cacheTimestamp = Date.now();
        return Array.from(agentCache.values());
      }
    } catch {
      // DB not available or table doesn't exist yet - fall through to code agents
    }
  }

  // Fallback to code-defined agents
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
  return agents.find((a) => a.isDefault) ?? agents[0] ?? alexAgent;
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
