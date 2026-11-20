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
/** With this many days or fewer left, a fetched token is renewed: the runner's next ask carries a new one as well. */
export const RUNNER_RENEW_DAYS = 7;
/** What a runner says about itself. Anything but `working` means its seats have no room. */
export const RUNNER_STATES = ['working', 'paused', 'disk_full'] as const;
// No 0, O, 1, I, L or U: the code is read off one screen and typed into another.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

const hash = (credential: string) => createHash('sha256').update(credential).digest('hex');
/** A code as it is stored: what a person typed, without the dash, spaces or lower case. */
const stored = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
const inWorkspace = (workspaceId: string, userId: string) =>
  ({ id: workspaceId, OR: [{ ownerId: userId }, { members: { some: { userId, status: true } } }] });

/**
 * A runner asks to be connected. It gets its credential now and a short code to show; the credential fetches nothing
 * until a person has typed the code into Collab, so nothing secret is ever typed or shown to a person.
 */
export async function startPairing(name: string) {
  const now = new Date();
  return prisma.$transaction(async tx => {
    // One at a time, so the cap is counted on settled rows.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('agent-runner-pairing'))`;
    await tx.agentRunner.deleteMany({ where: { workspaceId: null, pairingExpiresAt: { lt: now } } });
    if (await tx.agentRunner.count({ where: { workspaceId: null } }) >= PAIRING_CAP) {
      throw new HandoffError('pairing_busy', 'Too many runners are waiting to be connected; try again in a few minutes', 429);
    }
    const credential = `collab_rc_${randomBytes(32).toString('base64url')}`;
    const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const expiresAt = new Date(now.getTime() + PAIRING_MS);
    await tx.agentRunner.create({ data: { name, credentialHash: hash(credential), pairingCode: code, pairingExpiresAt: expiresAt } });
    return { code: `${code.slice(0, 4)}-${code.slice(4)}`, credential, expiresAt };
  });
}

/**
 * End a runner inside a transaction: its credential is refused from now on, the tokens it fetched are revoked, and the
 * room it reported is forgotten, so the runner that comes after it starts with no figure. A report takes the runner's
 * row before it writes, so none of this runner's lands after this.
 */
async function end(tx: Prisma.TransactionClient, workspaceId: string, actorId: string, runner: { id: string; name: string }, reason: 'removed' | 'replaced' | 'goodbye') {
  // The row first: a fetch that is making a token holds it, so this waits for that token and revokes it too.
  await tx.$queryRaw`SELECT "id" FROM "AgentRunner" WHERE "id" = ${runner.id} FOR UPDATE`;
  const now = new Date();
  const [ended] = await tx.agentRunner.updateManyAndReturn({ where: { id: runner.id, removedAt: null }, data: { removedAt: now }, select: { ownerId: true } });
  if (!ended) return 0;
  if (ended.ownerId) {
    const projects = await tx.agentSeat.findMany({ where: { workspaceId, ownerId: ended.ownerId }, distinct: ['projectId'], orderBy: { projectId: 'asc' }, select: { projectId: true } });
    for (const { projectId } of projects) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${projectId}`}))`;
    await tx.agentSeat.updateMany({ where: { workspaceId, ownerId: ended.ownerId, roomAt: { not: null } }, data: { room: null, roomProgram: null, roomAt: null } });
  }
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
      if (workspace.ownerId !== actorId) throw new HandoffError('owner_only', "Only the workspace's owner connects a runner for someone else", 403);
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

/**
 * The owner asks for a renewal now, as when a token may have leaked: every token this runner fetched is revoked at
 * once, and its next ask gets a new one for each of its seats. The seats' agents stay on, so nothing has to be made
 * again by hand; until the runner asks, the seats have no usable token and their work waits.
 * A person renews their own runner, the workspace's owner anyone's. Someone else's runner reads as absent.
 */
export async function renewRunnerTokens(input: { workspaceId: string; actorId: string; runnerId: string }) {
  return prisma.$transaction(async tx => {
    const workspace = await tx.workspace.findUnique({ where: { id: input.workspaceId }, select: { ownerId: true } });
    const found = await tx.agentRunner.findFirst({ where: { id: input.runnerId, workspaceId: input.workspaceId, removedAt: null }, select: { id: true, name: true, ownerId: true } });
    if (!workspace || !found || (found.ownerId !== input.actorId && workspace.ownerId !== input.actorId)) throw new HandoffError('not_found', 'Runner not found', 404);
    // The row first, as removing does: a fetch that is making a token holds it, so this waits for that token and revokes it too.
    await tx.$queryRaw`SELECT "id" FROM "AgentRunner" WHERE "id" = ${found.id} FOR UPDATE`;
    if (!await tx.agentRunner.count({ where: { id: found.id, removedAt: null } })) throw new HandoffError('not_found', 'Runner not found', 404);
    const now = new Date();
    const revoked = await tx.appToken.updateManyAndReturn({ where: { runnerId: found.id, isRevoked: false }, data: { isRevoked: true, revokedAt: now }, select: { id: true } });
    await tx.appAuditLog.create({ data: { workspaceId: input.workspaceId, actorId: input.actorId, action: 'agent_runner.renewed',
      details: { runnerId: found.id, name: found.name, revokedTokens: revoked.map(token => token.id) } } });
    return { revokedTokens: revoked.length };
  });
}

/**
 * A runner says it is going, with its credential, as its last act before its machine is deleted (decided by Cem on
 * 16 Nov 2026 on CLB-517): the tokens it fetched are revoked at once instead of at their expiry, and the credential
 * is refused from now on, so a terminal on that machine keeps nothing. A machine that is lost says nothing, which is
 * what expiry covers. The runner's seats then show no runner, and the machine that comes back pairs again.
 */
export async function runnerGoodbye(credential: string) {
  const runner = await prisma.agentRunner.findUnique({ where: { credentialHash: hash(credential) }, select: { id: true, name: true, workspaceId: true, ownerId: true, removedAt: true } });
  if (!runner || runner.removedAt) throw new HandoffError('runner_refused', 'This runner credential is not accepted', 401);
  const { workspaceId, ownerId } = runner;
  // Never admitted: there is no token and no workspace to record this in, so the waiting pairing is simply dropped.
  if (!workspaceId || !ownerId) {
    await prisma.agentRunner.deleteMany({ where: { id: runner.id, workspaceId: null } });
    return { revokedTokens: 0 };
  }
  // Under the runner's person, who is who a token it fetched was made for.
  return prisma.$transaction(async tx => ({ revokedTokens: await end(tx, workspaceId, ownerId, runner, 'goodbye') }));
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

/** How a seat account stands with its runner: `held` with a usable token, `renewing` when a renewal was not picked up yet, `expired` when its last token ran out. */
export type SeatTokenState = { runner: string | null; fetchedAt: Date | null; expiresAt: Date | null; state: 'held' | 'renewing' | 'expired' };

/**
 * Which of these seat accounts a runner fetched a token for, with the runner, when it fetched the token and when it
 * runs out. A seat with two usable tokens is being renewed and the runner has not used the new one yet: using it is
 * what ends the one before (src/lib/apps/auth-middleware.ts). A seat whose tokens all ran out is `expired`, which is
 * what a runner that stayed away through the renewal window leaves behind. An account with no fetched token at all is
 * absent from the map.
 */
export async function fetchedBy(db: DB, userIds: string[]): Promise<Map<string, SeatTokenState>> {
  const now = new Date();
  const tokens = userIds.length ? await db.appToken.findMany({ where: { userId: { in: userIds }, runnerId: { not: null }, isRevoked: false },
    orderBy: { createdAt: 'desc' }, select: { userId: true, runnerId: true, createdAt: true, tokenExpiresAt: true } }) : [];
  const runners = tokens.length ? await db.agentRunner.findMany({ where: { id: { in: tokens.map(token => token.runnerId!) } }, select: { id: true, name: true } }) : [];
  const states = new Map<string, SeatTokenState>();
  for (const userId of new Set(tokens.map(token => token.userId!))) {
    // Newest first, so the first usable one is the token the seat works with.
    const mine = tokens.filter(token => token.userId === userId);
    const usable = mine.filter(token => token.tokenExpiresAt && token.tokenExpiresAt > now);
    const current = usable[0] ?? mine[0];
    states.set(userId, {
      runner: usable.length ? runners.find(runner => runner.id === current.runnerId)?.name ?? null : null,
      fetchedAt: usable.length ? current.createdAt : null, expiresAt: current.tokenExpiresAt,
      state: !usable.length ? 'expired' : usable.length > 1 ? 'renewing' : 'held',
    });
  }
  return states;
}

/** A project's seats that a runner runs, each with how it stands with its runner and when the seat last asked for work. */
export async function runnerSeats(db: DB, projectId: string) {
  const seats = await db.agentSeat.findMany({ where: { projectId, byRunner: true, retiredAt: null }, orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { id: true, userId: true, name: true, role: true, lastSeenAt: true, owner: { select: { name: true } } } });
  const fetched = await fetchedBy(db, seats.map(seat => seat.userId));
  return seats.map(({ userId, owner, ...seat }) => ({ ...seat, owner: owner?.name ?? null, runner: fetched.get(userId)?.runner ?? null,
    fetchedAt: fetched.get(userId)?.fetchedAt ?? null, expiresAt: fetched.get(userId)?.expiresAt ?? null, state: fetched.get(userId)?.state ?? null }));
}

/**
 * Rule 4 for a project that is archived: its seats keep no token a runner fetched, and a runner's next ask no longer
 * lists them (an archived project's seats are not fetched). Tokens made by hand are left alone. Returns how many were
 * revoked. Unarchiving changes nothing: the runner fetches again. Call it in the transaction that archives the
 * project, which holds the project's row: a token being made for one of its seats is waited for and revoked here too,
 * and a failure leaves the project unarchived with its tokens as they were.
 */
export async function revokeProjectRunnerTokens(tx: Prisma.TransactionClient, workspaceId: string, actorId: string, projectId: string) {
  const seats = await tx.agentSeat.findMany({ where: { projectId, workspaceId, byRunner: true }, select: { userId: true } });
  if (!seats.length) return 0;
  const revoked = await tx.appToken.updateManyAndReturn({ where: { userId: { in: seats.map(seat => seat.userId) }, runnerId: { not: null }, isRevoked: false },
    data: { isRevoked: true, revokedAt: new Date() }, select: { id: true } });
  if (revoked.length) await tx.appAuditLog.create({ data: { workspaceId, actorId, action: 'agent_runner.project_archived',
    details: { projectId, revokedTokens: revoked.map(token => token.id) } } });
  return revoked.length;
}

/**
 * What a runner asks with its credential: the seats that are its to run, which are the seats made for a runner, not
 * retired, in its workspace and owned by the person it was admitted for. `have` lists the ids of the tokens the runner
 * holds. A seat for which it holds a usable token with more than `RUNNER_RENEW_DAYS` left is answered without one. A
 * seat for which it holds none gets a new token: a first ask, a lost file and a lost answer all read the same. Inside
 * the renewal window the ask carries a new token as well, so the seat holds a working new token before the old one
 * ends and is never without one. Not when the seat's agent is switched off or removed, which revoking its last usable
 * token on the Agent tokens page also does: an ask never switches an agent back on, the seat is answered with the
 * problem `paused` beside whatever token the runner holds, and a person who manages agent tokens makes the seat
 * again. A token ends when the runner uses the one that replaces it (src/lib/apps/auth-middleware.ts), or when a
 * second newer one is made: answers can arrive late or out of order, and a renewal the runner never picks up must
 * leave the old token working to its own expiry, so a runner has at most two usable tokens for a seat. A stored token
 * is never decrypted to be sent again.
 *
 * The ask may carry a `report` (CLB-774): the runner's own state, and per seat the room it has left and the program it
 * would run next. A figure is stored, with the time it arrived, only for a seat this ask lists; any other seat's id is
 * answered under `refused` and nothing is stored for it, so a seat retired since the runner's last ask does not cost
 * the runner its answer. An ask without a report makes no report writes and is answered as before. The credential
 * does nothing else.
 */
export async function fetchSeats(credential: string, have: string[],
  report: { state?: typeof RUNNER_STATES[number]; rooms?: { seat: string; room: number; program: string }[] } = {}) {
  const refused = () => new HandoffError('runner_refused', 'This runner credential is not accepted', 401);
  const now = new Date();
  const runner = await prisma.agentRunner.findUnique({ where: { credentialHash: hash(credential) } });
  if (!runner || runner.removedAt) throw refused();
  const { workspaceId, ownerId } = runner;
  if (!workspaceId || !ownerId) {
    if (!runner.pairingExpiresAt || runner.pairingExpiresAt < now) throw refused();
    throw new HandoffError('runner_pending', 'No person has connected this runner yet', 403);
  }
  // A runner runs under a person's logins: when that person is no longer in the workspace it gets nothing.
  if (!await prisma.workspace.findFirst({ where: inWorkspace(workspaceId, ownerId), select: { id: true } })) throw refused();
  if (!runner.lastSeenAt || runner.lastSeenAt.getTime() < now.getTime() - 60_000) await prisma.agentRunner.updateMany({ where: { id: runner.id }, data: { lastSeenAt: now } });

  // The seats that are this runner's to run. A figure is stored under the same conditions, stated again on the seat's row.
  const mine = { workspaceId, ownerId, byRunner: true, retiredAt: null, project: { OR: [{ isArchived: null }, { isArchived: false }] } };
  const retirements = report.rooms?.length ? await prisma.$queryRaw<{ id: string; count: bigint }[]>`
    SELECT "details"->>'seatId' AS "id", count(*) AS "count" FROM "AppAuditLog"
    WHERE "workspaceId" = ${workspaceId} AND "action" = 'agent_seat.retired' AND "details"->>'seatId' = ANY(${report.rooms.map(room => room.seat)})
    GROUP BY "details"->>'seatId'` : [];
  const seats = await prisma.agentSeat.findMany({ where: mine, orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, name: true, role: true, project: { select: { id: true, name: true, issuePrefix: true } } } });
  const notStored: string[] = [];
  // The runner and its person are asked again on their rows, as for a token: a runner removed or replaced, or a
  // person switched off, since this ask began stores nothing.
  if (report.state || report.rooms?.length) await prisma.$transaction(async tx => {
    if (!(await tx.$queryRaw<unknown[]>`SELECT 1 FROM "AgentRunner" WHERE "id" = ${runner.id} AND "removedAt" IS NULL FOR UPDATE`).length) throw refused();
    await tx.$queryRaw`SELECT "id" FROM "WorkspaceMember" WHERE "userId" = ${ownerId} AND "workspaceId" = ${workspaceId} FOR SHARE`;
    if (!await tx.workspace.findFirst({ where: inWorkspace(workspaceId, ownerId), select: { id: true } })) throw refused();
    if (report.state) await tx.agentRunner.update({ where: { id: runner.id }, data: { state: report.state } });
    for (const projectId of [...new Set(seats.filter(seat => report.rooms?.some(room => room.seat === seat.id)).map(seat => seat.project.id))].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${projectId}`}))`;
    }
    for (const { seat: id, room, program } of report.rooms ?? []) {
      const [{ count }] = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS "count" FROM "AppAuditLog"
        WHERE "workspaceId" = ${workspaceId} AND "action" = 'agent_seat.retired' AND "details"->>'seatId' = ${id}`;
      if (count !== (retirements.find(seat => seat.id === id)?.count ?? BigInt(0)) || !seats.some(seat => seat.id === id) || !(await tx.agentSeat.updateMany({ where: { id, ...mine },
        data: { room, roomProgram: program, roomAt: now } })).count) notStored.push(id);
    }
  });
  const held = seats.length ? await prisma.appToken.findMany({ where: { runnerId: runner.id, userId: { in: seats.map(seat => seat.userId) }, isRevoked: false, tokenExpiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' }, select: { id: true, userId: true, tokenExpiresAt: true, createdAt: true } }) : [];
  const renewFrom = new Date(now.getTime() + RUNNER_RENEW_DAYS * 86_400_000);
  const answer = [];
  for (const { userId, ...seat } of seats) {
    // The newest of the seat's tokens that the runner says it holds.
    const kept = held.find(token => token.userId === userId && have.includes(token.id));
    if (kept && kept.tokenExpiresAt && kept.tokenExpiresAt > renewFrom) {
      answer.push({ ...seat, tokenId: kept.id, expiresAt: kept.tokenExpiresAt });
      continue;
    }
    // A renewal that cannot be made leaves the runner the token it holds, which works until its own expiry.
    const holding = kept ? { ...seat, tokenId: kept.id, expiresAt: kept.tokenExpiresAt } : { ...seat, tokenId: null, expiresAt: null };
    try {
      const minted = await createAgentToken({ workspaceId, actorId: ownerId, name: seat.name, access: 'write', expiresInDays: RUNNER_TOKEN_DAYS, runnerId: runner.id,
        seat: async (tx, account) => {
          // Held to the end: removing the runner waits for this token and revokes it, and a runner removed first gets none.
          if (!(await tx.$queryRaw<unknown[]>`SELECT 1 FROM "AgentRunner" WHERE "id" = ${runner.id} AND "removedAt" IS NULL FOR SHARE`).length) throw refused();
          // The person again, on the row that switching a member off holds: someone switched off first gets no token.
          await tx.$queryRaw`SELECT "id" FROM "WorkspaceMember" WHERE "userId" = ${ownerId} AND "workspaceId" = ${workspaceId} FOR SHARE`;
          if (!await tx.workspace.findFirst({ where: inWorkspace(workspaceId, ownerId), select: { id: true } })) throw refused();
          await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "id" = ${seat.id} FOR SHARE`;
          if (!await tx.agentSeat.count({ where: { id: seat.id, userId: account.id, workspaceId, ownerId, projectId: seat.project.id, name: seat.name, role: seat.role, byRunner: true, retiredAt: null } })) throw new HandoffError('seat_changed', 'The seat changed while its token was made');
          // The project's row, held like the seat's: archiving it revokes what a runner fetched, so a token made
          // while it is being archived would be the one token left behind. The archive waits for this one and revokes it.
          if (!(await tx.$queryRaw<unknown[]>`SELECT 1 FROM "Project" WHERE "id" = ${seat.project.id} AND "isArchived" IS NOT TRUE FOR SHARE`).length) {
            throw new HandoffError('seat_changed', "The seat's project was archived while its token was made");
          }
          // The token the runner says it holds keeps working beside the new one, so a renewal never takes away the
          // token the seat is working with; when it holds none, the newest token so far keeps working, because its
          // answer may still be on its way to the runner. Everything else ends.
          const live = await tx.appToken.findMany({ where: { runnerId: runner.id, userId: account.id, isRevoked: false }, orderBy: { createdAt: 'desc' }, select: { id: true } });
          const spare = kept?.id ?? live[0]?.id;
          const before = live.filter(token => token.id !== spare);
          if (before.length) await tx.appToken.updateMany({ where: { id: { in: before.map(token => token.id) } }, data: { isRevoked: true, revokedAt: new Date() } });
        } });
      // `problem` names why no token was made this time (its member is switched off, or the seat changed); the next ask tries again.
      answer.push(minted.error ? { ...holding, problem: minted.error }
        : { ...seat, tokenId: minted.id, expiresAt: minted.expiresAt, token: minted.token });
    } catch (error) {
      if (!(error instanceof HandoffError) || error.code === 'runner_refused') throw error;
      answer.push({ ...holding, problem: error.code });
    }
  }
  return { runner: { id: runner.id, name: runner.name, workspaceId, ownerId }, seats: answer, ...(notStored.length > 0 && { refused: notStored }) };
}
