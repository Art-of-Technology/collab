/**
 * Coclaw Spawn Helpers
 *
 * Shared utilities for building CoclawSpawnConfig. Used by:
 * - stream/route.ts (on first chat message)
 * - status/route.ts (auto-respawn on page load)
 */

import { prisma } from '@/lib/prisma';
import { resolveApiKey, getGitHubToken, getGitHubTokenStatus } from '@/lib/coclaw/key-resolver';
import { getMcpToken } from '@/lib/ai/mcp-token';
import { decryptVariable } from '@/lib/secrets/crypto';
import type { CoclawSpawnConfig } from '@/lib/coclaw/types';

/**
 * Build a CoclawSpawnConfig for a user.
 *
 * Returns null if no API key is available (user or system).
 * This is used for auto-respawn — we don't want to throw if there's no key.
 */
export async function buildSpawnConfig(
  userId: string,
  workspaceId: string,
): Promise<CoclawSpawnConfig | null> {
  // 1. Resolve API key (user key → system fallback)
  let apiKeyResolution;
  try {
    apiKeyResolution = await resolveApiKey(userId, workspaceId);
  } catch {
    // No key available — can't spawn
    return null;
  }

  // 2. Get MCP token for Collab tools
  const mcpToken = await getMcpToken(prisma, userId, workspaceId).catch(() => '');

  // 3. Load enabled channel configs from DB
  let channels: CoclawSpawnConfig['channels'] = [];
  try {
    const dbChannels = await prisma.coclawChannelConfig.findMany({
      where: { userId, workspaceId, enabled: true },
    });
    channels = dbChannels
      .map((c) => {
        let config: Record<string, unknown> = {};
        try {
          const decrypted = decryptVariable(c.config, workspaceId);
          config = JSON.parse(decrypted) as Record<string, unknown>;
        } catch {
          // Skip channels with bad config
        }
        return { channelType: c.channelType, config, enabled: c.enabled };
      })
      .filter((c) => Object.keys(c.config).length > 0);
  } catch {
    // Channel loading failure is non-fatal
  }

  // 5. Resolve GitHub integration token
  let githubToken: string | undefined;
  let githubDefaultOwner: string | undefined;
  let githubDefaultRepo: string | undefined;
  try {
    const ghToken = await getGitHubToken(userId, workspaceId);
    if (ghToken) {
      githubToken = ghToken;
      // Also fetch default owner/repo metadata
      const ghStatus = await getGitHubTokenStatus(userId, workspaceId);
      githubDefaultOwner = ghStatus.defaultOwner;
      githubDefaultRepo = ghStatus.defaultRepo;
    }
  } catch {
    // GitHub token is optional — continue without it
  }

  return {
    provider: apiKeyResolution.provider,
    apiKey: apiKeyResolution.key,
    apiKeySource: apiKeyResolution.source,
    collabApiUrl: `${process.env.COLLAB_INTERNAL_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api`,
    mcpToken,
    userId,
    workspaceId,
    memoryBackend: 'collab',
    qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
    qdrantCollection: process.env.QDRANT_COLLECTION || 'collab_context',
    embeddingProvider,
    embeddingModel,
    embeddingDimensions,
    channels,
    githubToken,
    githubDefaultOwner,
    githubDefaultRepo,
    port: 0, // Allocated by instance manager
  };
}
