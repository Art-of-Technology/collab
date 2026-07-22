/**
 * Server-side initialization — runs once per process.
 * Import from root layout or middleware to boot background services.
 */
import { registerQdrantListeners } from '@/lib/qdrant-event-listeners';
import { registerCoclawListeners } from '@/lib/coclaw/coclaw-event-listeners';
import { prisma } from '@/lib/prisma';
import { getAllCodeAgents } from '@/lib/ai/agents/registry';

const init = globalThis as any;

if (!init.__qdrantListenersRegistered) {
  registerQdrantListeners();
  init.__qdrantListenersRegistered = true;
}

if (!init.__coclawListenersRegistered) {
  registerCoclawListeners();
  init.__coclawListenersRegistered = true;
}

// Seed code-defined AI agents into the DB (upsert — idempotent)
if (!init.__aiAgentsSeeded) {
  init.__aiAgentsSeeded = true;
  const agents = getAllCodeAgents();
  Promise.all(
    agents.map((a) =>
      prisma.aIAgent.upsert({
        where: { slug: a.slug },
        update: {
          name: a.name,
          color: a.color,
          avatar: a.avatar ?? null,
          personality: a.personality ?? null,
          description: a.description ?? null,
          systemPrompt: a.systemPrompt,
          capabilities: a.capabilities,
          isDefault: a.isDefault ?? false,
          isActive: true,
        },
        create: {
          slug: a.slug,
          name: a.name,
          color: a.color,
          avatar: a.avatar ?? null,
          personality: a.personality ?? null,
          description: a.description ?? null,
          systemPrompt: a.systemPrompt,
          capabilities: a.capabilities,
          isDefault: a.isDefault ?? false,
          isActive: true,
        },
      }),
    ),
  )
    .then(() => console.log(`[server-init] Seeded ${agents.length} AI agents`))
    .catch((err) => console.error('[server-init] Failed to seed AI agents:', err));
}
