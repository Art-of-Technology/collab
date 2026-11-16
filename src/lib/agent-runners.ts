import { createHash, randomBytes, randomInt } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { HandoffError } from '@/lib/agent-handoffs';
import { createAgentToken } from '@/lib/agent-tokens';

export { HandoffError };
type DB = Prisma.TransactionClient | typeof prisma;

/** A pairing waits this long for a person. After that its code and its credential never work. */
const PAIRING_MS = 15 * 60_000;
/** Pairings that may wait at once on the whole deployment: starting one needs no sign-in. */
const PAIRING_CAP = 50;
/** A token a runner fetches lasts this many days. */
export const RUNNER_TOKEN_DAYS = 30;
// No 0, O, 1, I, L or U: the code is read off one screen and typed into another.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

const hash = (credential: string) => createHash('sha256').update(credential).digest('hex');
/** A code as it is stored: what a person typed, without the dash, spaces or lower case. */
const stored = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
const inWorkspace = (workspaceId: string, userId: string) =>
  ({ id: workspaceId, OR: [{ ownerId: userId }, { members: { some: { userId, status: true } } }] });

/**
 * A runner asks to be admitted. It gets its credential now and a short code to show; the credential fetches nothing
 * until a person has typed the code into Collab, so nothing secret is ever typed or shown to a person.
 */
export async function startPairing(name: string) {
  const now = new Date();
  return prisma.$transaction(async tx => {
    // One at a time, so the cap is counted on settled rows.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('agent-runner-pairing'))`;
    await tx.agentRunner.deleteMany({ where: { workspaceId: null, pairingExpiresAt: { lt: now } } });
    if (await tx.agentRunner.count({ where: { workspaceId: null } }) >= PAIRING_CAP) {
      throw new HandoffError('pairing_busy', 'Too many runners are waiting to be admitted; try again in a few minutes', 429);
    }
    const credential = `collab_rc_${randomBytes(32).toString('base64url')}`;
    const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const expiresAt = new Date(now.getTime() + PAIRING_MS);
    await tx.agentRunner.create({ data: { name, credentialHash: hash(credential), pairingCode: code, pairingExpiresAt: expiresAt } });
    return { code: `${code.slice(0, 4)}-${code.slice(4)}`, credential, expiresAt };
  });
}

/** End a runner inside a transaction: its credential is refused from now on and the tokens it fetched are revoked. */
async function end(tx: Prisma.TransactionClient, workspaceId: string, actorId: string, runner: { id: string; name: string }, reason: 'removed' | 'replaced') {
  // The row first: a fetch that is making a token holds it, so this waits for that token and revokes it too.
  await tx.$queryRaw`SELECT "id" FROM "AgentRunner" WHERE "id" = ${runner.id} FOR UPDATE`;
  const now = new Date();
  if (!(await tx.agentRunner.updateMany({ where: { id: runner.id, removedAt: null }, data: { removedAt: now } })).count) return 0;
  const revoked = await tx.appToken.updateManyAndReturn({ where: { runnerId: runner.id, isRevoked: false }, data: { isRevoked: true, revokedAt: now }, select: { id: true } });
  await tx.appAuditLog.create({ data: { workspaceId, actorId, action: 'agent_runner.removed',
    details: { runnerId: runner.id, name: runner.name, reason, revokedTokens: revoked.map(token => token.id) } } });
  return revoked.length;
}

/**
 * A person admits the runner that shows `code`. A member admits a runner for themselves; only the workspace's owner
 * admits one for someone else. A person has one runner per workspace: admitting another ends the one before, the way
 * a rebuilt machine replaces a lost one.
 */
export async function admitRunner(input: { workspaceId: string; actorId: string; code: string; ownerId?: string | null }) {
  const { workspaceId, actorId } = input, ownerId = input.ownerId ?? actorId;
  return prisma.$transaction(async tx => {
    const workspace = await tx.workspace.findFirst({ where: inWorkspace(workspaceId, actorId), select: { ownerId: true } });
    if (!workspace) throw new HandoffError('not_found', 'Workspace not found', 404);
    if (ownerId !== actorId) {
      if (workspace.ownerId !== actorId) throw new HandoffError('owner_only', "Only the workspace's owner admits a runner for someone else", 403);
      // A person: an agent's service account has no email and no logins a runner could run under.
      if (!await tx.user.findFirst({ where: { id: ownerId, email: { not: null }, OR: [{ ownedWorkspaces: { some: { id: workspaceId } } },
        { workspaceMemberships: { some: { workspaceId, status: true } } }] }, select: { id: true } })) {
        throw new HandoffError('owner_not_found', "The runner's person is not an active member of this workspace");
      }
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-runner:${workspaceId}:${ownerId}`}))`;
    const now = new Date();
    // The code is used up by the update that finds it, so two people cannot admit the same runner.
    const [runner] = await tx.agentRunner.updateManyAndReturn({ where: { pairingCode: stored(input.code), workspaceId: null, pairingExpiresAt: { gt: now } },
      data: { workspaceId, ownerId, admittedById: actorId, admittedAt: now, pairingCode: null, pairingExpiresAt: null }, select: { id: true, name: true } });
    if (!runner) throw new HandoffError('code_not_found', 'No runner is waiting with this code. A code works once and for 15 minutes: start the pairing on the runner again', 404);
    const before = await tx.agentRunner.findMany({ where: { workspaceId, ownerId, removedAt: null, id: { not: runner.id } }, select: { id: true, name: true } });
    for (const old of before) await end(tx, workspaceId, actorId, old, 'replaced');
    await tx.appAuditLog.create({ data: { workspaceId, actorId, action: 'agent_runner.admitted',
      details: { runnerId: runner.id, name: runner.name, ownerId, replaced: before.map(old => old.id) } } });
    return { runner: { ...runner, ownerId }, replaced: before.map(old => old.name) };
  });
}

/** Remove a runner: a person their own, the workspace's owner anyone's. Someone else's runner reads as absent. */
export async function removeRunner(input: { workspaceId: string; actorId: string; runnerId: string }) {
  return prisma.$transaction(async tx => {
    const workspace = await tx.workspace.findUnique({ where: { id: input.workspaceId }, select: { ownerId: true } });
    const runner = await tx.agentRunner.findFirst({ where: { id: input.runnerId, workspaceId: input.workspaceId, removedAt: null }, select: { id: true, name: true, ownerId: true } });
    if (!workspace || !runner || (runner.ownerId !== input.actorId && workspace.ownerId !== input.actorId)) throw new HandoffError('not_found', 'Runner not found', 404);
    return { revokedTokens: await end(tx, input.workspaceId, input.actorId, runner, 'removed') };
  });
}

/** The runners a person may see: their own, and for the workspace's owner everyone's. Null when the workspace is not the person's. */
export async function listRunners(workspaceId: string, viewerId: string) {
  const workspace = await prisma.workspace.findFirst({ where: inWorkspace(workspaceId, viewerId), select: { ownerId: true } });
  if (!workspace) return null;
  const owner = workspace.ownerId === viewerId;
  const runners = await prisma.agentRunner.findMany({ where: { workspaceId, removedAt: null, ...(!owner && { ownerId: viewerId }) }, orderBy: { admittedAt: 'desc' },
    select: { id: true, name: true, ownerId: true, admittedAt: true, lastSeenAt: true, owner: { select: { name: true } } } });
  const seats = await prisma.agentSeat.groupBy({ by: ['ownerId'], where: { workspaceId, byRunner: true, retiredAt: null, ownerId: { in: runners.map(runner => runner.ownerId!) } }, _count: true });
  return { owner, runners: runners.map(({ owner: person, ...runner }) => ({ ...runner, ownerName: person?.name ?? null,
    seats: seats.find(row => row.ownerId === runner.ownerId)?._count ?? 0 })) };
}

/** Which of these seat accounts a runner holds a usable token for, with the runner and when it fetched the token. */
export async function fetchedBy(db: DB, userIds: string[]) {
  const tokens = userIds.length ? await db.appToken.findMany({ where: { userId: { in: userIds }, runnerId: { not: null }, isRevoked: false, tokenExpiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' }, select: { userId: true, runnerId: true, createdAt: true } }) : [];
  const runners = tokens.length ? await db.agentRunner.findMany({ where: { id: { in: tokens.map(token => token.runnerId!) } }, select: { id: true, name: true } }) : [];
  // The newest token wins: later entries replace earlier ones.
  return new Map(tokens.map(token => [token.userId!, { runner: runners.find(runner => runner.id === token.runnerId)?.name ?? null, fetchedAt: token.createdAt }]));
}

/** A project's seats that a runner runs, each with whether a runner has fetched its token and when the seat last asked for work. */
export async function runnerSeats(db: DB, projectId: string) {
  const seats = await db.agentSeat.findMany({ where: { projectId, byRunner: true, retiredAt: null }, orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { id: true, userId: true, name: true, role: true, lastSeenAt: true, owner: { select: { name: true } } } });
  const fetched = await fetchedBy(db, seats.map(seat => seat.userId));
  return seats.map(({ userId, owner, ...seat }) => ({ ...seat, owner: owner?.name ?? null, runner: fetched.get(userId)?.runner ?? null, fetchedAt: fetched.get(userId)?.fetchedAt ?? null }));
}

/**
 * What a runner asks with its credential: the seats that are its to run, which are the seats made for a runner, not
 * retired, in its workspace and owned by the person it was admitted for. `have` lists the ids of the tokens the runner
 * holds. A seat for which it holds a usable token is answered without one, and the runner's tokens for that seat from
 * before the one it holds end. A seat for which it holds none gets a new token: a first ask, a lost file, a lost
 * answer and a token revoked by a person all read the same. A token ends only when the runner shows it holds a newer
 * one, or when a second newer one is made: answers can arrive late or out of order, so the token a new one replaces
 * keeps working until then, and a runner has at most two usable tokens for a seat. A stored token is never decrypted
 * to be sent again. The credential does nothing else.
 */
export async function fetchSeats(credential: string, have: string[]) {
  const refused = () => new HandoffError('runner_refused', 'This runner credential is not accepted', 401);
  const now = new Date();
  const runner = await prisma.agentRunner.findUnique({ where: { credentialHash: hash(credential) } });
  if (!runner || runner.removedAt) throw refused();
  const { workspaceId, ownerId } = runner;
  if (!workspaceId || !ownerId) {
    if (!runner.pairingExpiresAt || runner.pairingExpiresAt < now) throw refused();
    throw new HandoffError('runner_pending', 'No person has admitted this runner yet', 403);
  }
  // A runner runs under a person's logins: when that person is no longer in the workspace it gets nothing.
  if (!await prisma.workspace.findFirst({ where: inWorkspace(workspaceId, ownerId), select: { id: true } })) throw refused();
  if (!runner.lastSeenAt || runner.lastSeenAt.getTime() < now.getTime() - 60_000) await prisma.agentRunner.updateMany({ where: { id: runner.id }, data: { lastSeenAt: now } });

  const seats = await prisma.agentSeat.findMany({ where: { workspaceId, ownerId, byRunner: true, retiredAt: null }, orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, name: true, role: true, project: { select: { id: true, name: true, issuePrefix: true } } } });
  const held = seats.length ? await prisma.appToken.findMany({ where: { runnerId: runner.id, userId: { in: seats.map(seat => seat.userId) }, isRevoked: false, tokenExpiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' }, select: { id: true, userId: true, tokenExpiresAt: true, createdAt: true } }) : [];
  const answer = [];
  for (const { userId, ...seat } of seats) {
    // The newest of the seat's tokens that the runner says it holds.
    const kept = held.find(token => token.userId === userId && have.includes(token.id));
    if (kept) {
      const before = held.filter(token => token.userId === userId && token.createdAt < kept.createdAt).map(token => token.id);
      if (before.length) await prisma.appToken.updateMany({ where: { id: { in: before }, isRevoked: false }, data: { isRevoked: true, revokedAt: now } });
      answer.push({ ...seat, tokenId: kept.id, expiresAt: kept.tokenExpiresAt });
      continue;
    }
    try {
      const minted = await createAgentToken({ workspaceId, actorId: ownerId, name: seat.name, access: 'write', expiresInDays: RUNNER_TOKEN_DAYS, runnerId: runner.id,
        seat: async (tx, account) => {
          // Held to the end: removing the runner waits for this token and revokes it, and a runner removed first gets none.
          if (!(await tx.$queryRaw<unknown[]>`SELECT 1 FROM "AgentRunner" WHERE "id" = ${runner.id} AND "removedAt" IS NULL FOR SHARE`).length) throw refused();
          if (!await tx.agentSeat.count({ where: { id: seat.id, userId: account.id, ownerId, byRunner: true, retiredAt: null } })) throw new HandoffError('seat_changed', 'The seat changed while its token was made');
          // The newest token so far keeps working beside the new one: its answer may still be on its way to the runner.
          const [, ...before] = await tx.appToken.findMany({ where: { runnerId: runner.id, userId: account.id, isRevoked: false }, orderBy: { createdAt: 'desc' }, select: { id: true } });
          if (before.length) await tx.appToken.updateMany({ where: { id: { in: before.map(token => token.id) } }, data: { isRevoked: true, revokedAt: new Date() } });
        } });
      // `problem` names why a seat has no token this time (its member is switched off, or it changed); the next ask tries again.
      answer.push(minted.error ? { ...seat, tokenId: null, expiresAt: null, problem: minted.error }
        : { ...seat, tokenId: minted.id, expiresAt: minted.expiresAt, token: minted.token });
    } catch (error) {
      if (!(error instanceof HandoffError) || error.code === 'runner_refused') throw error;
      answer.push({ ...seat, tokenId: null, expiresAt: null, problem: error.code });
    }
  }
  return { runner: { id: runner.id, name: runner.name, workspaceId, ownerId }, seats: answer };
}
