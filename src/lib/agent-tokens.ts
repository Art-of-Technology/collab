import { createHash, randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { encryptToken } from '@/lib/apps/crypto';
import { prisma } from '@/lib/prisma';
import { SEAT_RANK_REFUSAL, seatOwnerAccess } from '@/lib/workspace-authority';

// Agent tokens belong to their own system app (scripts/setup-agent-apps.mjs), so a workspace's
// agent tokens are exactly that app's tokens there, and those tokens' users are its service accounts.
export const AGENT_APP_SLUG = 'collab-agent';

export type AgentTokenAccess = 'read' | 'write';

export const agentMintErrors = {
  not_found: [404, 'Workspace not found'],
  seat_not_found: [404, 'Seat not found'],
  outranked: [403, SEAT_RANK_REFUSAL],
  unavailable: [503, 'Agent tokens are not set up on this deployment'],
  runner_seat: [409, 'This seat is run by a runner, which fetches its tokens itself. No token is made for it by hand.'],
} as const;

async function liveSeatOwner(db: Pick<typeof prisma, 'agentSeat'>, userId?: string | null) {
  if (!userId) return null;
  const seat = await db.agentSeat.findUnique({ where: { userId, retiredAt: null }, select: { ownerId: true } });
  return seat?.ownerId ?? null;
}

async function agentApp() {
  const app = await prisma.app.findUnique({
    where: { slug: AGENT_APP_SLUG },
    select: { id: true, status: true, isSystemApp: true, scopes: { select: { scope: true } } },
  });
  return app?.isSystemApp ? app : null;
}

async function serviceAccounts(db: Pick<typeof prisma, 'appToken' | 'user' | 'agentSeat'>, appId: string, workspaceId: string) {
  const tokens = await db.appToken.findMany({ where: { appId, workspaceId }, select: { userId: true } });
  // A seat a runner runs has no token until the runner fetches one; its account is the app's all the same.
  const seats = await db.agentSeat.findMany({ where: { workspaceId, byRunner: true }, select: { userId: true } });
  const ids = [...new Set([...tokens, ...seats].map(row => row.userId).filter((id): id is string => !!id))];
  return ids.length ? db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
}

const personSelect = (workspaceId: string) => ({
  id: true, name: true, email: true,
  workspaceMemberships: { where: { workspaceId }, select: { displayName: true } },
}) satisfies Prisma.UserSelect;

/** A person as an owner is picked or shown: the name they set for this workspace, then their email, since two accounts can share a name. */
function personLabel(user: { id: string; name: string | null; email: string | null; workspaceMemberships: { displayName: string | null }[] }) {
  const name = user.workspaceMemberships[0]?.displayName || user.name;
  return name && user.email ? `${name} (${user.email})` : name || user.email || user.id;
}

/**
 * The people who can own a seat in a workspace (its owner and active members with a sign-in), its live seats, and the
 * workspace's own roles a new seat can take (CLB-628): those that are not retired.
 */
export async function listSeatOwnerChoices(workspaceId: string) {
  const [people, seats, customRoles] = await Promise.all([
    prisma.user.findMany({
      where: { email: { not: null }, OR: [{ ownedWorkspaces: { some: { id: workspaceId } } }, { workspaceMemberships: { some: { workspaceId, status: true } } }] },
      select: personSelect(workspaceId),
    }),
    prisma.agentSeat.findMany({
      where: { workspaceId, retiredAt: null },
      select: { id: true, name: true, role: true, isDefault: true, project: { select: { name: true } }, owner: { select: personSelect(workspaceId) },
        customRole: { select: { name: true } } },
    }),
    prisma.agentCustomRole.findMany({ where: { workspaceId, retiredAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, baseRole: true } }),
  ]);
  return {
    people: people.map(user => ({ id: user.id, name: personLabel(user) })).sort((a, b) => a.name.localeCompare(b.name)),
    seats: seats.map(seat => ({ id: seat.id, name: seat.name, role: seat.role, customRole: seat.customRole?.name ?? null, project: seat.project?.name ?? null,
      isDefault: seat.isDefault, owner: seat.owner && personLabel(seat.owner) })),
    customRoles,
  };
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
  // A token whose account is a seat is that seat's token, however it was minted.
  const seats = names.size ? await prisma.agentSeat.findMany({
    where: { userId: { in: [...names.keys()] } },
    select: { id: true, userId: true, role: true, isDefault: true, retiredAt: true, project: { select: { name: true } },
      owner: { select: personSelect(workspaceId) }, customRole: { select: { name: true } } },
  }) : [];
  const seatOf = (userId: string | null) => {
    const seat = seats.find(row => row.userId === userId);
    // The owner is the person whose sign-in runs the seat; without one, no person's subscription pays for it.
    return seat ? { id: seat.id, role: seat.role, customRole: seat.customRole?.name ?? null, project: seat.project?.name ?? null, isDefault: seat.isDefault, retired: !!seat.retiredAt,
      owner: seat.owner && personLabel(seat.owner) } : null;
  };
  return tokens.map(token => ({
    id: token.id,
    name: names.get(token.userId ?? '') ?? 'Unknown',
    seat: seatOf(token.userId),
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
export async function createAgentToken<S = undefined>(input: {
  workspaceId: string; actorId: string; name: string; access: AgentTokenAccess; expiresInDays: number;
  /**
   * Makes the account a seat in the minting transaction (src/lib/agent-seats.ts); when it throws, nothing is minted. `agents` reads the accounts a name is looked up in here, as they are when it is called.
   * `owners` is the rank rule's verdict on a seat's person, decided before the transaction (CLB-1185): the seat decides whose seat it acts on.
   */
  seat?: (tx: Prisma.TransactionClient, account: { id: string; name: string | null }, agents: () => Promise<{ id: string; name: string | null }[]>,
    owners: Awaited<ReturnType<typeof seatOwnerAccess>>) => Promise<S>;
  /** False makes the account (and its seat) without a token: a runner fetches the first one. */
  mint?: boolean;
  /** The runner this token is fetched by (src/lib/agent-runners.ts). */
  runnerId?: string;
  /** With `seat`: the person a seat made here belongs to, decided on with the account's live seat's. */
  seatOwnerId?: string | null;
}) {
  const app = await agentApp();
  if (app?.status !== 'PUBLISHED') return { error: 'unavailable' as const };
  const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { id: true } });
  if (!workspace) return { error: 'not_found' as const };

  const ceiling = app.scopes.map(row => row.scope);
  const scopes = input.access === 'write' ? ceiling : ceiling.filter(scope => scope.endsWith(':read'));
  const token = `collab_at_${Date.now().toString(36)}_${randomBytes(32).toString('base64url')}`;
  // Encrypting derives a key, so an account made without a token does not pay for one.
  const accessToken = input.mint === false ? '' : Buffer.from(await encryptToken(token)).toString('base64');
  const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
  const wanted = input.name.trim();
  // Someone else's seat needs the rank rule (CLB-1185): the person of the account's live seat, and of a seat made here,
  // are decided on before the transaction. A runner fetches only its own person's seats, which its `seat` checks.
  const named = input.runnerId ? undefined : (await serviceAccounts(prisma, app.id, input.workspaceId)).find(user => user.name?.trim().toLowerCase() === wanted.toLowerCase());
  const heldOwner = await liveSeatOwner(prisma, named?.id);
  const owners = await seatOwnerAccess(input.actorId, input.workspaceId, heldOwner, input.seatOwnerId);

  const created = await prisma.$transaction(async tx => {
    // One mint at a time per name and workspace, so two cannot both find no account and create it twice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-token:${input.workspaceId}:${wanted.toLowerCase()}`}))`;
    // Only accounts this app already owns here are reused: a person who shares the name never is.
    const found = (await serviceAccounts(tx, app.id, input.workspaceId)).find(user => user.name?.trim().toLowerCase() === wanted.toLowerCase());
    if (found) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${found.id} FOR UPDATE`;
    if (!input.seat) {
      const verdict = owners(await liveSeatOwner(tx, found?.id));
      if (verdict === 'changed') return { error: 'seat_not_found' as const };
      if (verdict === 'refused') return { error: 'outranked' as const };
    }
    const account = found ?? await tx.user.create({ data: { name: wanted }, select: { id: true, name: true } });
    // The token of a seat a runner runs goes to that runner only: nobody makes one by hand, under its name or as a seat.
    if (input.mint !== false && !input.runnerId && await tx.agentSeat.count({ where: { userId: account.id, byRunner: true, retiredAt: null } })) return { error: 'runner_seat' as const };
    await tx.$queryRaw`SELECT "id" FROM "WorkspaceMember" WHERE "userId" = ${account.id} AND "workspaceId" = ${input.workspaceId} FOR UPDATE`;
    const membership = await tx.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: account.id, workspaceId: input.workspaceId } }, select: { status: true },
    });
    const live = await tx.appToken.count({ where: { appId: app.id, workspaceId: input.workspaceId, userId: account.id, isRevoked: false, tokenExpiresAt: { gte: new Date() } } });
    if (!membership?.status) {
      // Switched off or removed while tokens were still usable: minting must not make those work again.
      // A runner's ask never switches an agent back on, with or without tokens: that takes a person who manages them.
      if ((live && input.mint !== false) || input.runnerId) return { error: 'paused' as const };
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
    const seat = await input.seat?.(tx, account, () => serviceAccounts(tx, app.id, input.workspaceId), owners);
    if (input.mint === false) return { id: null, name: account.name ?? wanted, seat };
    const row = await tx.appToken.create({
      data: { appId: app.id, workspaceId: input.workspaceId, userId: account.id, installationId: null, accessToken, tokenHash: createHash('sha256').update(token).digest('hex'), tokenExpiresAt: expiresAt, scopes,
        // Stamped here, after the name's lock, so an account's tokens sort in the order they were made.
        runnerId: input.runnerId ?? null, createdAt: new Date() },
      select: { id: true },
    });
    // The audit row is the only record of who minted the token.
    await tx.appAuditLog.create({ data: {
      workspaceId: input.workspaceId, actorId: input.actorId, action: 'agent_token.created',
      details: { tokenId: row.id, serviceUserId: account.id, name: account.name, scopes, expiresAt: expiresAt.toISOString(), ...(input.runnerId && { runnerId: input.runnerId }) },
    } });
    return { id: row.id, name: account.name ?? wanted, seat };
  });
  if (created.error) return { error: created.error };
  // Without a token there is none to hand back: `id` is null and `token` is absent.
  return { id: created.id, name: created.name, seat: created.seat as S, scopes, expiresAt, ...(created.id && { token }) };
}

async function tokenSeatOwners(actorId: string, workspaceId: string, where: Prisma.AppTokenWhereInput) {
  const userId = (await prisma.appToken.findFirst({ where, select: { userId: true } }))?.userId;
  const owners = await seatOwnerAccess(actorId, workspaceId, await liveSeatOwner(prisma, userId));
  return async (tx: Prisma.TransactionClient, currentUserId: string | null) => owners(await liveSeatOwner(tx, currentUserId));
}

/** Revoke one agent token of this workspace. False when it is absent or already revoked; `outranked` when it is the token of a seat of someone at or above the actor. */
export async function revokeAgentToken(input: { workspaceId: string; actorId: string; tokenId: string }) {
  const app = await agentApp();
  if (!app) return false;
  const scope = { appId: app.id, workspaceId: input.workspaceId };
  const owners = await tokenSeatOwners(input.actorId, input.workspaceId, { id: input.tokenId, ...scope, isRevoked: false });
  return prisma.$transaction(async tx => {
    const token = await tx.appToken.findFirst({ where: { id: input.tokenId, ...scope, isRevoked: false }, select: { id: true, userId: true } });
    if (!token) return false;
    if (token.userId) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${token.userId} FOR UPDATE`;
    const verdict = await owners(tx, token.userId);
    if (verdict === 'changed') return false;
    if (verdict === 'refused') return 'outranked' as const;
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
 * The caller checks permission in the home workspace and, for grants, in the target workspace.
 */
export async function setAgentWorkspaceAccess(input: {
  workspaceId: string; actorId: string; tokenId: string; targetWorkspaceId: string; allowed: boolean;
}) {
  const app = await agentApp();
  if (!app || input.targetWorkspaceId === input.workspaceId) return false;
  const where = { id: input.tokenId, appId: app.id, workspaceId: input.workspaceId, isRevoked: false };
  const owners = await tokenSeatOwners(input.actorId, input.workspaceId, where);
  return prisma.$transaction(async tx => {
    const userId = (await tx.appToken.findFirst({ where, select: { userId: true } }))?.userId;
    if (!userId || !await tx.workspace.findUnique({ where: { id: input.targetWorkspaceId }, select: { id: true } })) return false;
    // Revoking locks the same row, so the token is read again: a revocation that switched the account off
    // everywhere must not be followed by this switching it back on.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (!await tx.appToken.count({ where })) return false;
    const verdict = await owners(tx, userId);
    if (verdict === 'changed') return false;
    if (verdict === 'refused') return 'outranked' as const;
    const key = { userId, workspaceId: input.targetWorkspaceId };
    await tx.$queryRaw`SELECT "id" FROM "WorkspaceMember" WHERE "userId" = ${userId} AND "workspaceId" = ${input.targetWorkspaceId} FOR UPDATE`;
    const active = !!(await tx.workspaceMember.findUnique({ where: { userId_workspaceId: key }, select: { status: true } }))?.status;
    // Already let in: nothing to do. Not in: nothing to take away, so a workspace the agent never used is not found.
    if (active === input.allowed) return active;
    // A new workspace needs an account that can still act: one with a usable token.
    if (input.allowed && !await tx.appToken.count({ where: { appId: app.id, workspaceId: input.workspaceId, userId, isRevoked: false, tokenExpiresAt: { gte: new Date() } } })) return false;
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
