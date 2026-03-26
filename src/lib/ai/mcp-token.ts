/**
 * MCP Token Provisioning
 *
 * Automatically generates/retrieves MCP access tokens for authenticated users.
 * These tokens are used to authenticate with the Collab MCP server via
 * Anthropic's MCP connector, giving the AI agent access to all workspace tools.
 *
 * Resilience: If decryption fails (e.g. APP_TOKENS_KEY rotation), ALL stale
 * tokens for the user+workspace are batch-revoked and a fresh one is issued.
 * The stream route can call invalidateMcpToken() to force re-provisioning
 * when Anthropic reports MCP errors.
 */

import { randomBytes } from 'crypto';
import { encryptToken, decryptToken } from '@/lib/apps/crypto';

// MCP server app configuration — matches the deployed MCP server's OAuth client
const MCP_APP_CLIENT_ID = process.env.MCP_APP_CLIENT_ID || '0f3fa5b9-81e8-42c2-b572-107e636ea3e8';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp-collab.weez.boo';

// Full scope set for the AI agent — needs read+write access to everything
const MCP_AGENT_SCOPES = [
  'user:read',
  'workspace:read',
  'issues:read',
  'issues:write',
  'projects:read',
  'projects:write',
  'comments:read',
  'comments:write',
  'labels:read',
  'labels:write',
  'views:read',
  'views:write',
  'context:read',
  'context:write',
  'knowledge:read',
  'secrets:read',
  'profile:read',
];

// In-memory cache to avoid DB lookups on every message
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Get or create an MCP access token for the given user+workspace.
 * This is called server-side from the streaming API route.
 */
export async function getMcpToken(
  prisma: any,
  userId: string,
  workspaceId: string
): Promise<string> {
  const cacheKey = `${userId}:${workspaceId}`;

  // 1. Check in-memory cache
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  // 2. Find the MCP app by client ID
  const mcpApp = await findMcpApp(prisma);
  if (!mcpApp) {
    throw new Error(
      'MCP app not found. Ensure the Collab MCP server app is registered with client_id: ' +
        MCP_APP_CLIENT_ID
    );
  }

  // 3. Find ALL existing non-revoked tokens for this user+workspace+app
  const existingTokens = await prisma.appToken.findMany({
    where: {
      appId: mcpApp.id,
      userId,
      workspaceId,
      installationId: null,
      isRevoked: false,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Try to decrypt the newest token first
  for (const token of existingTokens) {
    try {
      const decrypted = await decryptToken(
        Buffer.from(token.accessToken, 'base64')
      );

      // Check if it hasn't expired
      if (token.tokenExpiresAt && token.tokenExpiresAt < new Date()) {
        continue; // expired, skip
      }

      tokenCache.set(cacheKey, {
        token: decrypted,
        expiresAt: Date.now() + CACHE_TTL,
      });
      return decrypted;
    } catch {
      // Decryption failed (likely key rotation) — continue to next
    }
  }

  // 4. No valid token found — batch-revoke ALL stale ones
  if (existingTokens.length > 0) {
    const staleIds = existingTokens.map((t: any) => t.id);
    await prisma.appToken.updateMany({
      where: { id: { in: staleIds } },
      data: { isRevoked: true, revokedAt: new Date() },
    });
    console.log(`[mcp-token] Revoked ${staleIds.length} stale token(s) for user=${userId} workspace=${workspaceId}`);
  }

  // 5. Generate a fresh token
  return createFreshToken(prisma, mcpApp.id, userId, workspaceId, cacheKey);
}

/**
 * Invalidate the cached MCP token and revoke it in DB.
 * Call this when Anthropic reports an MCP-related error so the next
 * getMcpToken() call creates a fresh one.
 */
export async function invalidateMcpToken(
  prisma: any,
  userId: string,
  workspaceId: string
): Promise<void> {
  const cacheKey = `${userId}:${workspaceId}`;
  tokenCache.delete(cacheKey);

  const mcpApp = await findMcpApp(prisma);
  if (!mcpApp) return;

  // Revoke ALL tokens for this user+workspace
  const result = await prisma.appToken.updateMany({
    where: {
      appId: mcpApp.id,
      userId,
      workspaceId,
      installationId: null,
      isRevoked: false,
    },
    data: { isRevoked: true, revokedAt: new Date() },
  });

  if (result.count > 0) {
    console.log(`[mcp-token] Invalidated ${result.count} token(s) for user=${userId} workspace=${workspaceId}`);
  }
}

/**
 * Get the MCP server URL for the Anthropic MCP connector.
 */
export function getMcpServerUrl(): string {
  return MCP_SERVER_URL;
}

// ── Internal helpers ──

async function createFreshToken(
  prisma: any,
  appId: string,
  userId: string,
  workspaceId: string,
  cacheKey: string
): Promise<string> {
  const accessToken = generateAccessToken();
  const encrypted = await encryptToken(accessToken);
  const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000); // 1 year

  await prisma.appToken.create({
    data: {
      appId,
      workspaceId,
      userId,
      installationId: null,
      accessToken: Buffer.from(encrypted).toString('base64'),
      tokenExpiresAt: expiresAt,
      scopes: MCP_AGENT_SCOPES,
      isRevoked: false,
    },
  });

  tokenCache.set(cacheKey, {
    token: accessToken,
    expiresAt: Date.now() + CACHE_TTL,
  });

  console.log(`[mcp-token] Created fresh token for user=${userId} workspace=${workspaceId}`);
  return accessToken;
}

// Cache the MCP app lookup
let mcpAppCache: { id: string; slug: string } | null = null;
let mcpAppCacheTime = 0;

async function findMcpApp(prisma: any): Promise<{ id: string; slug: string } | null> {
  if (mcpAppCache && Date.now() - mcpAppCacheTime < 60 * 60 * 1000) {
    return mcpAppCache;
  }

  // Find by OAuth client ID
  const oauthClient = await prisma.appOAuthClient.findUnique({
    where: { clientId: MCP_APP_CLIENT_ID },
    select: {
      app: {
        select: { id: true, slug: true },
      },
    },
  });

  if (oauthClient?.app) {
    mcpAppCache = oauthClient.app;
    mcpAppCacheTime = Date.now();
    return oauthClient.app;
  }

  // Fallback: find by slug
  const app = await prisma.app.findFirst({
    where: {
      OR: [
        { slug: 'collab-mcp-server' },
        { slug: 'mcp-server' },
        { isSystemApp: true, slug: { contains: 'mcp' } },
      ],
    },
    select: { id: true, slug: true },
  });

  if (app) {
    mcpAppCache = app;
    mcpAppCacheTime = Date.now();
    return app;
  }

  return null;
}

function generateAccessToken(): string {
  const random = randomBytes(32).toString('base64url');
  const timestamp = Date.now().toString(36);
  return `collab_at_${timestamp}_${random}`;
}
