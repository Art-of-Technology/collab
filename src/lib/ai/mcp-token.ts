/**
 * Assistant token provisioning
 *
 * The in-app assistant runs the MCP tools as the signed-in member. Each tool call goes
 * through the app API with a bearer token, so the assistant keeps one token per member
 * and workspace. They belong to their own system app (scripts/setup-agent-apps.mjs), which
 * keeps them apart from a member's connector sign-in and CLI logins.
 *
 * Resilience: If decryption fails (e.g. APP_TOKENS_KEY rotation), ALL stale
 * tokens for the user+workspace are batch-revoked and a fresh one is issued.
 * The stream route calls refreshMcpToken() when a token stops working.
 */

import { randomBytes } from 'crypto';
import { encryptToken, decryptToken } from '@/lib/apps/crypto';
import { MCP_SCOPES } from '@/lib/mcp-oauth';

const ASSISTANT_APP_SLUG = 'collab-assistant';

// In-memory cache to avoid DB lookups on every message
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// One token operation at a time per member and workspace, so a chat that starts while a dead token is
// being replaced waits for the replacement instead of creating a token the replacement then revokes.
// shortcut: per process only, a second replica can still race; lock in the database when production runs more than one.
const turns = new Map<string, Promise<unknown>>();
function inTurn<T>(key: string, task: () => Promise<T>): Promise<T> {
  const result = (turns.get(key) ?? Promise.resolve()).then(task);
  const done = result.catch(() => undefined);
  turns.set(key, done);
  void done.then(() => { if (turns.get(key) === done) turns.delete(key); });
  return result;
}

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
  const cached = tokenCache.get(cacheKey);
  // A cached token needs no turn; anything else waits for a replacement that may be under way.
  return cached && cached.expiresAt > Date.now() ? cached.token : inTurn(cacheKey, () => acquire(prisma, userId, workspaceId));
}

async function acquire(prisma: any, userId: string, workspaceId: string): Promise<string> {
  const cacheKey = `${userId}:${workspaceId}`;

  // 1. Check in-memory cache
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  // 2. Find the assistant app
  const mcpApp = await findMcpApp(prisma);
  if (!mcpApp) {
    throw new Error('Assistant app not found. Run scripts/setup-agent-apps.mjs --apply.');
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
        // Never cached past its own expiry.
        expiresAt: Math.min(Date.now() + CACHE_TTL, token.tokenExpiresAt?.getTime() ?? Infinity),
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

/** Drop the cached token and revoke the member's assistant tokens for this workspace. */
async function invalidate(
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

/** Replace a token that stopped working. Chats that hit the same dead token share one replacement. */
export function refreshMcpToken(prisma: any, userId: string, workspaceId: string, failedToken: string): Promise<string> {
  return inTurn(`${userId}:${workspaceId}`, async () => {
    const current = await acquire(prisma, userId, workspaceId);
    if (current !== failedToken) return current;
    await invalidate(prisma, userId, workspaceId);
    return acquire(prisma, userId, workspaceId);
  });
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
      scopes: [...MCP_SCOPES],
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

// Only the provisioned, published system app: never another app that merely looks similar.
async function findMcpApp(prisma: any): Promise<{ id: string } | null> {
  const app = await prisma.app.findUnique({
    where: { slug: ASSISTANT_APP_SLUG },
    select: { id: true, status: true, isSystemApp: true },
  });
  return app?.isSystemApp && app.status === 'PUBLISHED' ? app : null;
}

function generateAccessToken(): string {
  const random = randomBytes(32).toString('base64url');
  const timestamp = Date.now().toString(36);
  return `collab_at_${timestamp}_${random}`;
}
