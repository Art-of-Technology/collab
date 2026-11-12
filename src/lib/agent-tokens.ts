import { randomBytes } from 'crypto';
import { encryptToken } from '@/lib/apps/crypto';
import { prisma } from '@/lib/prisma';

// Agent tokens belong to their own system app (scripts/setup-agent-apps.mjs), so a workspace's
// agent tokens are exactly that app's tokens there, and those tokens' users are its service accounts.
export const AGENT_APP_SLUG = 'collab-agent';

export type AgentTokenAccess = 'read' | 'write';

async function agentApp() {
  const app = await prisma.app.findUnique({
    where: { slug: AGENT_APP_SLUG },
    select: { id: true, status: true, isSystemApp: true, scopes: { select: { scope: true } } },
  });
  return app?.isSystemApp ? app : null;
}

async function serviceAccounts(db: Pick<typeof prisma, 'appToken' | 'user'>, appId: string, workspaceId: string) {
  const tokens = await db.appToken.findMany({ where: { appId, workspaceId }, select: { userId: true } });
  const ids = [...new Set(tokens.map(token => token.userId).filter((id): id is string => !!id))];
  return ids.length ? db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
}

/** Unrevoked agent tokens of a workspace, or null while the agent app is not provisioned and published. */
export async function listAgentTokens(workspaceId: string) {
  const app = await agentApp();
  if (app?.status !== 'PUBLISHED') return null;
  const tokens = await prisma.appToken.findMany({
    where: { appId: app.id, workspaceId, isRevoked: false },
    select: { id: true, userId: true, scopes: true, createdAt: true, tokenExpiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const names = new Map((await serviceAccounts(prisma, app.id, workspaceId)).map(user => [user.id, user.name]));
  // Other workspaces an account was let into (setAgentWorkspaceAccess): its tokens work there too.
  const elsewhere = names.size ? await prisma.workspaceMember.findMany({
    where: { userId: { in: [...names.keys()] }, status: true, workspaceId: { not: workspaceId } },
    select: { userId: true, workspace: { select: { id: true, name: true, slug: true } } },
  }) : [];
  return tokens.map(token => ({
    id: token.id,
    name: names.get(token.userId ?? '') ?? 'Unknown',
    workspaces: elsewhere.filter(row => row.userId === token.userId)
      .map(({ workspace }) => ({ id: workspace.id, name: workspace.name, slug: workspace.slug })),
    access: (token.scopes.every(scope => scope.endsWith(':read')) ? 'read' : 'write') as AgentTokenAccess,
    createdAt: token.createdAt,
    expiresAt: token.tokenExpiresAt,
    expired: !!token.tokenExpiresAt && token.tokenExpiresAt < new Date(),
  }));
}

/**
 * Mint a token for a named service account: a member with no email, password or sign-in,
 * so everything done with the token is attributed to that name.
 */
export async function createAgentToken(input: {
  workspaceId: string; actorId: string; name: string; access: AgentTokenAccess; expiresInDays: number;
}) {
  const app = await agentApp();
  if (app?.status !== 'PUBLISHED') return { error: 'unavailable' as const };
  const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { id: true } });
  if (!workspace) return { error: 'not_found' as const };

  const ceiling = app.scopes.map(row => row.scope);
  const scopes = input.access === 'write' ? ceiling : ceiling.filter(scope => scope.endsWith(':read'));
  const token = `collab_at_${Date.now().toString(36)}_${randomBytes(32).toString('base64url')}`;
  const accessToken = Buffer.from(await encryptToken(token)).toString('base64');
  const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
  const wanted = input.name.trim();

  const created = await prisma.$transaction(async tx => {
    // One mint at a time per name and workspace, so two cannot both find no account and create it twice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-token:${input.workspaceId}:${wanted.toLowerCase()}`}))`;
    // Only accounts this app already owns here are reused: a person who shares the name never is.
    const account = (await serviceAccounts(tx, app.id, input.workspaceId)).find(user => user.name?.trim().toLowerCase() === wanted.toLowerCase())
      ?? await tx.user.create({ data: { name: wanted }, select: { id: true, name: true } });
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${account.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "WorkspaceMember" WHERE "userId" = ${account.id} AND "workspaceId" = ${input.workspaceId} FOR UPDATE`;
    const membership = await tx.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: account.id, workspaceId: input.workspaceId } }, select: { status: true },
    });
    const live = await tx.appToken.count({ where: { appId: app.id, workspaceId: input.workspaceId, userId: account.id, isRevoked: false, tokenExpiresAt: { gte: new Date() } } });
    if (!membership?.status) {
      // Switched off or removed while tokens were still usable: minting must not make those work again.
      if (live) return { error: 'paused' as const };
    }
    if (!live) {
      const others = await tx.workspaceMember.updateManyAndReturn({ where: { userId: account.id, status: true, workspaceId: { not: input.workspaceId } }, data: { status: false }, select: { workspaceId: true } });
      for (const { workspaceId } of others) await tx.appAuditLog.create({ data: {
        workspaceId, actorId: input.actorId, action: 'agent_token.workspace_removed',
        details: { serviceUserId: account.id, name: account.name, homeWorkspaceId: input.workspaceId },
      } });
    }
    await tx.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: account.id, workspaceId: input.workspaceId } },
      update: membership?.status ? {} : { status: true, role: 'MEMBER' },
      create: { userId: account.id, workspaceId: input.workspaceId, role: 'MEMBER' },
    });
    const row = await tx.appToken.create({
      data: { appId: app.id, workspaceId: input.workspaceId, userId: account.id, installationId: null, accessToken, tokenExpiresAt: expiresAt, scopes },
      select: { id: true },
    });
    // The audit row is the only record of who minted the token.
    await tx.appAuditLog.create({ data: {
      workspaceId: input.workspaceId, actorId: input.actorId, action: 'agent_token.created',
      details: { tokenId: row.id, serviceUserId: account.id, name: account.name, scopes, expiresAt: expiresAt.toISOString() },
    } });
    return { id: row.id, name: account.name ?? wanted };
  });
  if (created.error) return { error: created.error };
  return { id: created.id, name: created.name, scopes, expiresAt, token };
}

/** Revoke one agent token of this workspace. False when it is absent or already revoked. */
export async function revokeAgentToken(input: { workspaceId: string; actorId: string; tokenId: string }) {
  const app = await agentApp();
  if (!app) return false;
  const scope = { appId: app.id, workspaceId: input.workspaceId };
  return prisma.$transaction(async tx => {
    const token = await tx.appToken.findFirst({ where: { id: input.tokenId, ...scope, isRevoked: false }, select: { id: true, userId: true } });
    if (!token) return false;
    if (token.userId) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${token.userId} FOR UPDATE`;
    const updated = await tx.appToken.updateMany({ where: { id: token.id, ...scope, isRevoked: false }, data: { isRevoked: true, revokedAt: new Date() } });
    if (!updated.count) return false;
    let name: string | null = null;
    if (token.userId) {
      const live = await tx.appToken.count({ where: { ...scope, userId: token.userId, isRevoked: false, tokenExpiresAt: { gte: new Date() } } });
      // An account with no usable token left stops being an active member, in every workspace it was let into:
      // a later token with its name starts again in this workspace only.
      name = (await tx.user.findUnique({ where: { id: token.userId }, select: { name: true } }))?.name ?? null;
      if (!live) {
        const changed = await tx.workspaceMember.updateManyAndReturn({ where: { userId: token.userId, status: true }, data: { status: false }, select: { workspaceId: true } });
        for (const { workspaceId } of changed.filter(row => row.workspaceId !== input.workspaceId)) await tx.appAuditLog.create({ data: {
          workspaceId, actorId: input.actorId, action: 'agent_token.workspace_removed',
          details: { tokenId: token.id, serviceUserId: token.userId, name, homeWorkspaceId: input.workspaceId },
        } });
      }
    }
    await tx.appAuditLog.create({ data: {
      workspaceId: input.workspaceId, actorId: input.actorId, action: 'agent_token.revoked',
      details: { tokenId: token.id, serviceUserId: token.userId, name },
    } });
    return true;
  });
}

/**
 * Let the service account behind a token work in another workspace as a member, or stop it there.
 * It applies to every token of that account. False when the token or the other workspace is not found,
 * or when there is nothing to stop there.
 * The caller checks that the actor may do this in both workspaces.
 */
export async function setAgentWorkspaceAccess(input: {
  workspaceId: string; actorId: string; tokenId: string; targetWorkspaceId: string; allowed: boolean;
}) {
  const app = await agentApp();
  if (!app || input.targetWorkspaceId === input.workspaceId) return false;
  const where = { id: input.tokenId, appId: app.id, workspaceId: input.workspaceId, isRevoked: false };
  return prisma.$transaction(async tx => {
    const userId = (await tx.appToken.findFirst({ where, select: { userId: true } }))?.userId;
    if (!userId || !await tx.workspace.findUnique({ where: { id: input.targetWorkspaceId }, select: { id: true } })) return false;
    // Revoking locks the same row, so the token is read again: a revocation that switched the account off
    // everywhere must not be followed by this switching it back on.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (!await tx.appToken.count({ where })) return false;
    if (input.allowed && !await tx.appToken.count({ where: { appId: app.id, workspaceId: input.workspaceId, userId, isRevoked: false, tokenExpiresAt: { gte: new Date() } } })) return false;
    const key = { userId, workspaceId: input.targetWorkspaceId };
    await tx.$queryRaw`SELECT "id" FROM "WorkspaceMember" WHERE "userId" = ${userId} AND "workspaceId" = ${input.targetWorkspaceId} FOR UPDATE`;
    const active = !!(await tx.workspaceMember.findUnique({ where: { userId_workspaceId: key }, select: { status: true } }))?.status;
    // Already let in: nothing to do. Not in: nothing to take away, so a workspace the agent never used is not found.
    if (active === input.allowed) return active;
    if (input.allowed) {
      await tx.workspaceMember.upsert({ where: { userId_workspaceId: key }, update: { status: true, role: 'MEMBER' }, create: { ...key, role: 'MEMBER' } });
    } else {
      await tx.workspaceMember.updateMany({ where: key, data: { status: false } });
    }
    const name = (await tx.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? null;
    // Recorded in the workspace whose members changed.
    await tx.appAuditLog.create({ data: {
      workspaceId: input.targetWorkspaceId, actorId: input.actorId,
      action: input.allowed ? 'agent_token.workspace_added' : 'agent_token.workspace_removed',
      details: { tokenId: input.tokenId, serviceUserId: userId, name, homeWorkspaceId: input.workspaceId },
    } });
    return true;
  });
}
