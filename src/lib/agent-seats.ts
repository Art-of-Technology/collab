import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { HandoffError } from '@/lib/agent-handoffs';
import { AGENT_APP_SLUG, createAgentToken } from '@/lib/agent-tokens';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { SEAT_TAKES } from '@/lib/issue-assignee';

export { HandoffError };
type DB = Prisma.TransactionClient | typeof prisma;
type Caller = Pick<AppAuthContext, 'user' | 'app' | 'workspace'>;

export const SEAT_ROLES = ['developer', 'reviewer', 'release', 'security'] as const;
/** Issues one agent account that is not a seat may hand to seats per UTC day. */
export const ASSIGN_CAP = 5;

interface SeatInput {
  workspaceId: string; actorId: string; projectId: string; role: string; ownerId: string | null;
  name: string; expiresInDays: number; isDefault?: boolean;
}

/**
 * A seat is an agent token's service account tied to one project and one role. It is created with its
 * token in one step; asking again under the same name gives the same seat a further token.
 */
export async function createSeat(input: SeatInput) {
  if (!(SEAT_ROLES as readonly string[]).includes(input.role)) throw new HandoffError('invalid_role', 'A seat is a developer, a reviewer, a release or a security seat');
  const minted = await createAgentToken({
    workspaceId: input.workspaceId, actorId: input.actorId, name: input.name, access: 'write', expiresInDays: input.expiresInDays,
    seat: (tx, account) => writeSeat(tx, input, account),
  });
  if (minted.error) return { error: minted.error };
  const { seat, ...token } = minted;
  return { seat, token };
}

async function writeSeat(tx: Prisma.TransactionClient, input: SeatInput, account: { id: string; name: string | null }) {
  // One seat change at a time per project, so "the first of its role is the default" and "one release seat" are decided on settled rows.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${input.projectId}`}))`;
  if (!await tx.project.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true } })) {
    throw new HandoffError('project_not_found', 'Project not found in this workspace', 404);
  }
  const existing = await tx.agentSeat.findUnique({ where: { userId: account.id } });
  const same = !!existing && !existing.retiredAt && existing.projectId === input.projectId && existing.role === input.role;
  if (existing && !existing.retiredAt && !same) {
    throw new HandoffError('seat_exists', `${existing.name} is already a ${existing.role} seat; retire it before giving the name another project or role`, 409);
  }
  if (!same && input.ownerId && !await tx.workspace.findFirst({
    where: { id: input.workspaceId, OR: [{ ownerId: input.ownerId }, { members: { some: { userId: input.ownerId, status: true } } }] }, select: { id: true },
  })) throw new HandoffError('owner_not_found', "The seat's owner is not an active member of this workspace");
  const others = await tx.agentSeat.findMany({
    where: { projectId: input.projectId, role: input.role, retiredAt: null, userId: { not: account.id } }, select: { id: true, isDefault: true },
  });
  if (input.role === 'release' && others.length) throw new HandoffError('release_seat_exists', 'This project already has a release seat; retire it first', 409);
  const isDefault = same ? existing.isDefault : !!input.isDefault || !others.some(seat => seat.isDefault);
  if (!same && isDefault) await tx.agentSeat.updateMany({ where: { id: { in: others.filter(seat => seat.isDefault).map(seat => seat.id) } }, data: { isDefault: false } });
  const data = { workspaceId: input.workspaceId, projectId: input.projectId, role: input.role, ownerId: same ? existing.ownerId : input.ownerId,
    name: account.name ?? input.name.trim(), isDefault, retiredAt: null };
  const seat = await tx.agentSeat.upsert({ where: { userId: account.id }, create: { ...data, userId: account.id }, update: data });
  // An account that had work before it took this seat keeps only what the seat may hold.
  const unassigned = same ? [] : await unassignOpen(tx, seat, input.actorId, 'seat_created', seat);
  await tx.appAuditLog.create({ data: {
    workspaceId: input.workspaceId, actorId: input.actorId, action: 'agent_seat.created',
    details: { seatId: seat.id, serviceUserId: account.id, projectId: seat.projectId, role: seat.role, ownerId: seat.ownerId, isDefault, unassigned },
  } });
  return seat;
}

/**
 * Unassign the seat account's issues that are not done, each with an activity entry that says why; with `keep`, only
 * those that seat may not hold. Returns their keys. Written in SQL because the application's client hides issues in
 * Trash, and a restored issue must not bring the assignment back.
 */
async function unassignOpen(tx: Prisma.TransactionClient, seat: { id: string; userId: string }, actorId: string, reason: string, keep?: { projectId: string; role: string }) {
  // Take the account's issues first, so a change to one of them that is already under way finishes before it is read here.
  await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "assigneeId" = ${seat.userId} FOR UPDATE`;
  // An ordinary issue has no request role; '' stands for that in the list of roles the seat takes.
  const misfit = keep ? Prisma.sql`AND (i."projectId" <> ${keep.projectId} OR NOT (COALESCE(i."agentRequestRole", '') = ANY(${SEAT_TAKES[keep.role].map(role => role ?? '')})))` : Prisma.empty;
  const issues = await tx.$queryRaw<{ id: string; issueKey: string | null; workspaceId: string; projectId: string }[]>`
    UPDATE "Issue" i SET "assigneeId" = NULL, "updatedAt" = ${new Date()}
    WHERE i."assigneeId" = ${seat.userId}
      AND NOT EXISTS (SELECT 1 FROM "ProjectStatus" s WHERE s."id" = i."statusId" AND (s."category" = 'done' OR (s."category" IS NULL AND s."isFinal")))
      AND (i."statusId" IS NOT NULL OR LOWER(COALESCE(NULLIF(TRIM(i."statusValue"), ''), NULLIF(TRIM(i."status"), ''), '')) NOT IN ('done', 'complete', 'completed', 'closed', 'resolved', 'cancelled', 'canceled'))
      ${misfit}
    RETURNING i."id", i."issueKey", i."workspaceId", i."projectId"`;
  await tx.$executeRaw`DELETE FROM "IssueAssignee" WHERE "userId" = ${seat.userId} AND "issueId" = ANY(${issues.map(issue => issue.id)})`;
  await tx.issueActivity.createMany({ data: issues.map(issue => ({
    action: 'UNASSIGNED', itemType: 'ISSUE', itemId: issue.id, userId: actorId, workspaceId: issue.workspaceId, projectId: issue.projectId,
    fieldName: 'assignee', oldValue: seat.userId, newValue: '', details: JSON.stringify({ reason, seatId: seat.id }),
  })) });
  return issues.map(issue => issue.issueKey ?? issue.id);
}

/** The caller's seat, or null for a person, for a token that is not a seat, and for a retired seat. */
export function seatFor(db: DB, context: Pick<AppAuthContext, 'user'>) {
  return db.agentSeat.findFirst({ where: { userId: context.user.id, retiredAt: null } });
}

export async function requireSeat(db: DB, context: Pick<AppAuthContext, 'user'>) {
  const seat = await seatFor(db, context);
  if (!seat) throw new HandoffError('seat_required', 'This call needs a seat token', 403);
  return seat;
}

/**
 * Rule 2 for a route that lets seats write: a seat writes only to its own project. No effect for people and
 * for tokens that are not seats. A retired seat writes nothing, so retiring never widens what its tokens may do.
 * Rule 8 is the one way out, and only the route that creates a comment passes `commentOn`: a seat comments on a
 * request it filed, known by the field that only filing a request sets and by its reporter.
 */
export async function seatWriteGuard(db: DB, context: Pick<AppAuthContext, 'user'>, projectId: string,
  commentOn?: { agentRequestRole: string | null; reporterId: string | null }): Promise<void> {
  const seat = await db.agentSeat.findUnique({ where: { userId: context.user.id }, select: { projectId: true, retiredAt: true } });
  if (!seat) return;
  if (seat.retiredAt) throw new HandoffError('seat_scope', 'This seat is retired', 403);
  if (seat.projectId === projectId || (commentOn?.agentRequestRole && commentOn.reporterId === context.user.id)) return;
  throw new HandoffError('wrong_project', "A seat writes only to its own project's issues", 403);
}

const isSeatAccount = async (db: DB, userId: string) => !!await db.agentSeat.findUnique({ where: { userId }, select: { id: true } });

/**
 * Rule 7 for a token that sets an assignee. A seat never does. With `existingIssue`, an agent token that is not
 * a seat is refused when the assignee is a seat: it gives seats work only by creating issues and by asking for a
 * release by label, and its daily cap counts both.
 */
export async function assertTokenMayAssign(db: DB, context: Caller, assigneeId: string | null, existingIssue: boolean): Promise<void> {
  if (await isSeatAccount(db, context.user.id)) throw new HandoffError('seat_scope', 'A seat cannot change who an issue is assigned to', 403);
  if (existingIssue && assigneeId && context.app.slug === AGENT_APP_SLUG && await isSeatAccount(db, assigneeId)) {
    throw new HandoffError('assign_by_person', 'An agent token gives a seat work by creating an issue; an existing issue is assigned to a seat by a person', 403);
  }
}

/**
 * True when this agent account, known not to be a seat, has handed seats its cap of new issues today (UTC). Called
 * inside the transaction that would hand over one more: it holds a lock per token account until that ends.
 */
export async function seatHandoffCapReached(tx: Prisma.TransactionClient, actorId: string): Promise<boolean> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assign-cap:${actorId}`}))`;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return await tx.appAuditLog.count({ where: { actorId, action: 'agent_seat.issue_handed', createdAt: { gte: today } } }) >= ASSIGN_CAP;
}

/** For an issue being created: true when it is for a seat and the cap is reached, so it is filed unassigned. */
export async function assignCapReached(tx: Prisma.TransactionClient, context: Caller, assigneeId: string): Promise<boolean> {
  return context.app.slug === AGENT_APP_SLUG && await isSeatAccount(tx, assigneeId) && seatHandoffCapReached(tx, context.user.id);
}

/**
 * The durable count behind the cap: one audit row per new issue an agent token that is not a seat gave a seat. Unassigning the issue later does not give the slot back.
 * Stamped here, after the account's lock, and not by the database's default (the transaction's start): a write
 * that waited for the lock across midnight UTC is counted on the day it was let through.
 */
export const countSeatHandoff = (tx: Prisma.TransactionClient, workspaceId: string, actorId: string, issueId: string, assigneeId: string) =>
  tx.appAuditLog.create({ data: { workspaceId, actorId, action: 'agent_seat.issue_handed', details: { issueId, assigneeId }, createdAt: new Date() } });

export async function recordSeatHandoff(tx: Prisma.TransactionClient, context: Caller, assigneeId: string, issueId: string): Promise<void> {
  if (context.app.slug === AGENT_APP_SLUG && await isSeatAccount(tx, assigneeId)) await countSeatHandoff(tx, context.workspace.id, context.user.id, issueId, assigneeId);
}

/**
 * Retire a seat. Refused while it has a run open. Its open issues are unassigned, each with an activity entry;
 * finished issues keep its name. Its tokens stay until revoked, but write nothing any more.
 */
export async function retireSeat(input: { workspaceId: string; actorId: string; seatId: string }) {
  const where = { id: input.seatId, workspaceId: input.workspaceId, retiredAt: null };
  return prisma.$transaction(async tx => {
    const found = await tx.agentSeat.findFirst({ where, select: { projectId: true } });
    if (!found) throw new HandoffError('not_found', 'Seat not found', 404);
    // The same order as creating a seat: the project's lock, then the row.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${found.projectId}`}))`;
    await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "id" = ${input.seatId} FOR UPDATE`;
    const seat = await tx.agentSeat.findFirst({ where });
    if (!seat) throw new HandoffError('not_found', 'Seat not found', 404);
    if (await tx.agentRun.count({ where: { seatId: seat.id, endedAt: null } })) {
      throw new HandoffError('already_running', 'This seat has a run open; let it finish, or clear it, before retiring the seat', 409);
    }
    const unassigned = await unassignOpen(tx, seat, input.actorId, 'seat_retired');
    await tx.agentSeat.update({ where: { id: seat.id }, data: { retiredAt: new Date(), isDefault: false } });
    if (seat.isDefault) {
      // Requests for this role keep a seat to go to.
      const next = await tx.agentSeat.findFirst({ where: { projectId: seat.projectId, role: seat.role, retiredAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (next) await tx.agentSeat.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    await tx.appAuditLog.create({ data: {
      workspaceId: input.workspaceId, actorId: input.actorId, action: 'agent_seat.retired',
      details: { seatId: seat.id, serviceUserId: seat.userId, projectId: seat.projectId, role: seat.role, unassigned },
    } });
    return { unassigned };
  });
}
