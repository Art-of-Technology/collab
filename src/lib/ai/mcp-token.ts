/**
 * MCP Token Provisioning
 *
 * Automatically generates/retrieves MCP access tokens for authenticated users.
 * These tokens are used to authenticate with the Collab MCP server via
 * Anthropic's MCP connector, giving the AI agent access to all workspace tools.
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
  'notes:read',
  'notes:write',
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

  // 3. Look for existing valid token
  const existingToken = await prisma.appToken.findFirst({
    where: {
      appId: mcpApp.id,
      userId,
      workspaceId,
      installationId: null, // System app tokens have no installation
      isRevoked: false,
      OR: [
        { tokenExpiresAt: null },
        { tokenExpiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existingToken) {
    try {
      const decrypted = await decryptToken(
        Buffer.from(existingToken.accessToken, 'base64')
      );
      tokenCache.set(cacheKey, {
        token: decrypted,
        expiresAt: Date.now() + CACHE_TTL,
      });
      return decrypted;
    } catch {
      // Token decryption failed — revoke and create a new one
      await prisma.appToken.update({
        where: { id: existingToken.id },
        data: { isRevoked: true, revokedAt: new Date() },
      });
    }
  }

  // 4. Generate a new token
  const accessToken = generateAccessToken();
  const encrypted = await encryptToken(accessToken);
  const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000); // 1 year

  await prisma.appToken.create({
    data: {
      appId: mcpApp.id,
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

  return accessToken;
}

/**
 * Get the MCP server URL for the Anthropic MCP connector.
 */
export function getMcpServerUrl(): string {
  return MCP_SERVER_URL;
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
