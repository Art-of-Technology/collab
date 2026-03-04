/**
 * Coclaw API Key Resolver
 *
 * Resolves the AI provider API key for a user. Checks the user's personal
 * encrypted keys first, then falls back to the system-level environment
 * variable. When using the system key, enforces a daily usage cap.
 */

import { prisma } from '@/lib/prisma';
import { decryptVariables, type SecretVariable } from '@/lib/secrets/crypto';
import { PROVIDER_ENV_MAP, type ApiKeyResolution, type UsageCap, type UsageStats } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DAILY_MESSAGE_LIMIT = Number(
  process.env.COCLAW_SYSTEM_KEY_DAILY_LIMIT ?? 50,
);
const DEFAULT_DAILY_TOKEN_LIMIT = Number(
  process.env.COCLAW_SYSTEM_KEY_TOKEN_LIMIT ?? 500_000,
);

/** Note title prefix used for Coclaw API key notes. */
const COCLAW_KEY_NOTE_TITLE_PREFIX = 'Coclaw API Key -';

// ---------------------------------------------------------------------------
// Key Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the API key for a given user + workspace + provider.
 *
 * Priority:
 * 1. User's stored key (encrypted Note with type API_KEYS, scope PERSONAL)
 * 2. System environment variable (e.g. ANTHROPIC_API_KEY)
 *
 * Throws if no key is available or the system key is over quota.
 */
export async function resolveApiKey(
  userId: string,
  workspaceId: string,
  provider = 'anthropic',
): Promise<ApiKeyResolution> {
  // --- 1. Try user's stored key -------------------------------------------
  const userKey = await getUserStoredKey(userId, workspaceId, provider);
  if (userKey) {
    return { key: userKey, source: 'user', provider };
  }

  // --- 2. Fall back to system key -----------------------------------------
  const envVar = PROVIDER_ENV_MAP[provider];
  const systemKey = envVar ? process.env[envVar] : undefined;

  if (!systemKey) {
    throw new Error(
      `No API key configured for provider "${provider}". ` +
      'Please add your own key in Settings → AI Provider Keys.',
    );
  }

  // --- 3. Check daily usage cap -------------------------------------------
  await enforceUsageCap(userId, workspaceId);

  return { key: systemKey, source: 'system', provider };
}

// ---------------------------------------------------------------------------
// User Key CRUD (backed by encrypted Notes)
// ---------------------------------------------------------------------------

/**
 * Retrieve the user's stored key for a provider by decrypting the
 * corresponding Note's secretVariables.
 */
async function getUserStoredKey(
  userId: string,
  workspaceId: string,
  provider: string,
): Promise<string | null> {
  const note = await prisma.note.findFirst({
    where: {
      authorId: userId,
      workspaceId,
      type: 'API_KEYS',
      scope: 'PERSONAL',
      isEncrypted: true,
      title: `${COCLAW_KEY_NOTE_TITLE_PREFIX} ${provider}`,
    },
    select: { secretVariables: true },
  });

  if (!note?.secretVariables) return null;

  try {
    const vars = JSON.parse(note.secretVariables) as SecretVariable[];
    const decrypted = decryptVariables(vars, workspaceId);
    const entry = decrypted.find((v) => v.key === 'api_key');
    return entry?.value ?? null;
  } catch (err) {
    console.error('[CoclawKeyResolver] Failed to decrypt user key:', err);
    return null;
  }
}

/**
 * Store (or update) a user's API key for a given provider.
 * Creates an encrypted Note with type API_KEYS and scope PERSONAL.
 */
export async function storeUserKey(
  userId: string,
  workspaceId: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  const { encryptVariables } = await import('@/lib/secrets/crypto');

  const title = `${COCLAW_KEY_NOTE_TITLE_PREFIX} ${provider}`;
  const encrypted = encryptVariables(
    [{ key: 'api_key', value: apiKey, masked: true, description: `${provider} API key` }],
    workspaceId,
  );

  const existing = await prisma.note.findFirst({
    where: {
      authorId: userId,
      workspaceId,
      type: 'API_KEYS',
      scope: 'PERSONAL',
      title,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.note.update({
      where: { id: existing.id },
      data: { secretVariables: JSON.stringify(encrypted) },
    });
  } else {
    await prisma.note.create({
      data: {
        title,
        content: '',
        type: 'API_KEYS',
        scope: 'PERSONAL',
        isEncrypted: true,
        isRestricted: true,
        isAiContext: false,
        secretVariables: JSON.stringify(encrypted),
        authorId: userId,
        workspaceId,
      },
    });
  }
}

/**
 * Remove a user's stored key for a given provider.
 * Returns true if a key was found and deleted.
 */
export async function removeUserKey(
  userId: string,
  workspaceId: string,
  provider: string,
): Promise<boolean> {
  const title = `${COCLAW_KEY_NOTE_TITLE_PREFIX} ${provider}`;
  const note = await prisma.note.findFirst({
    where: {
      authorId: userId,
      workspaceId,
      type: 'API_KEYS',
      scope: 'PERSONAL',
      title,
    },
    select: { id: true },
  });

  if (!note) return false;

  await prisma.note.delete({ where: { id: note.id } });
  return true;
}

/**
 * List which providers a user has configured keys for.
 * Returns provider names + last-updated timestamps only — never actual keys.
 */
export async function listConfiguredProviders(
  userId: string,
  workspaceId: string,
): Promise<{ provider: string; configured: boolean; lastUpdated: Date | null }[]> {
  const notes = await prisma.note.findMany({
    where: {
      authorId: userId,
      workspaceId,
      type: 'API_KEYS',
      scope: 'PERSONAL',
      isEncrypted: true,
      title: { startsWith: COCLAW_KEY_NOTE_TITLE_PREFIX },
    },
    select: { title: true, updatedAt: true },
  });

  const configuredSet = new Map<string, Date>();
  for (const note of notes) {
    const provider = note.title.replace(`${COCLAW_KEY_NOTE_TITLE_PREFIX} `, '');
    configuredSet.set(provider, note.updatedAt);
  }

  const allProviders = Object.keys(PROVIDER_ENV_MAP);
  return allProviders.map((p) => ({
    provider: p,
    configured: configuredSet.has(p),
    lastUpdated: configuredSet.get(p) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Usage Tracking & Caps
// ---------------------------------------------------------------------------

function getUsageCap(): UsageCap {
  return {
    maxMessagesPerDay: DEFAULT_DAILY_MESSAGE_LIMIT,
    maxTokensPerDay: DEFAULT_DAILY_TOKEN_LIMIT,
  };
}

function todayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Enforce the daily usage cap for users on the shared system key.
 * Throws an error if the cap is exceeded.
 */
async function enforceUsageCap(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const cap = getUsageCap();
  const today = todayDate();

  const log = await prisma.coclawUsageLog.findUnique({
    where: { userId_workspaceId_date: { userId, workspaceId, date: today } },
  });

  if (log && log.messageCount >= cap.maxMessagesPerDay) {
    throw new Error(
      `Daily usage limit reached (${cap.maxMessagesPerDay} messages/day on shared key). ` +
      'Please configure your own API key in Settings → AI Provider Keys.',
    );
  }

  if (log && log.tokenCount >= cap.maxTokensPerDay) {
    throw new Error(
      `Daily token limit reached (${cap.maxTokensPerDay} tokens/day on shared key). ` +
      'Please configure your own API key in Settings → AI Provider Keys.',
    );
  }
}

/**
 * Increment the daily usage counter. Called after each successful Coclaw message.
 */
export async function incrementUsage(
  userId: string,
  workspaceId: string,
  source: 'user' | 'system',
  messageCount = 1,
  tokenCount = 0,
): Promise<void> {
  const today = todayDate();

  await prisma.coclawUsageLog.upsert({
    where: { userId_workspaceId_date: { userId, workspaceId, date: today } },
    create: {
      userId,
      workspaceId,
      date: today,
      apiKeySource: source,
      messageCount,
      tokenCount,
    },
    update: {
      messageCount: { increment: messageCount },
      tokenCount: { increment: tokenCount },
      apiKeySource: source,
    },
  });
}

/**
 * Get usage statistics for a user+workspace.
 */
export async function getUsageStats(
  userId: string,
  workspaceId: string,
): Promise<UsageStats> {
  const today = todayDate();
  const cap = getUsageCap();

  const log = await prisma.coclawUsageLog.findUnique({
    where: { userId_workspaceId_date: { userId, workspaceId, date: today } },
  });

  return {
    date: today.toISOString().split('T')[0],
    messageCount: log?.messageCount ?? 0,
    tokenCount: log?.tokenCount ?? 0,
    apiKeySource: (log?.apiKeySource as 'user' | 'system') ?? null,
    limits: {
      maxMessagesPerDay: cap.maxMessagesPerDay,
      maxTokensPerDay: cap.maxTokensPerDay,
      isOverLimit: (log?.messageCount ?? 0) >= cap.maxMessagesPerDay,
    },
  };
}
