import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { HandoffError } from '@/lib/agent-handoffs';
import { AGENT_APP_SLUG, createAgentToken } from '@/lib/agent-tokens';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { SEAT_TAKES, assertAssignable } from '@/lib/issue-assignee';

export { HandoffError };
type DB = Prisma.TransactionClient | typeof prisma;
type Caller = Pick<AppAuthContext, 'user' | 'app' | 'workspace'>;

export const SEAT_ROLES = ['developer', 'reviewer', 'release', 'security', 'lead'] as const;
/** The seats a member adds for themselves, and removes again. Never a lead or a release seat. */
export const MEMBER_ROLES = ['developer', 'reviewer', 'security'] as const;
/** Issues one agent account that is not a seat may hand to seats per UTC day. */
export const ASSIGN_CAP = 5;
/** Open issues one seat may hold from its project's lead seat. */
export const LEAD_CAP = 3;
/** A release seat that has not read its inbox for this long is taken to be away, and so is a runner that has not asked for its seats. */
export const IDLE_MS = 10 * 60_000;
/** A room figure older than this says nothing any more. */
export const ROOM_FRESH_MS = 15 * 60_000;
/** The issues that are not in a status of the done group. */
export const NOT_DONE = { OR: [{ statusId: null }, { projectStatus: { OR: [{ category: { not: 'done' } }, { category: null, isFinal: false }] } }] };
/** The open issues a seat holds because the lead gave them to it: the lead's hand is on the row that made the seat the assignee. */
export const fromLead = (projectId: string, lead: string, seat: string) => ({ projectId, assigneeId: seat, ...NOT_DONE, helpers: { some: { userId: seat, approvedBy: lead } } });

interface SeatInput {
  workspaceId: string; actorId: string; projectId: string; role: string; ownerId: string | null;
  name: string; expiresInDays: number; isDefault?: boolean;
  /** The seat is run by its owner's runner, which fetches its tokens: none is made here, and none is shown to anyone. */
  byRunner?: boolean;
  /** A member adding their own seat: only while the project's switch is on, and never under a name that was someone else's agent. */
  own?: boolean;
  /** With `own`: the names of the seats this request makes in the same form. One that is someone else's agent refuses this seat too. */
  together?: string[];
}

/**
 * A seat is an agent token's service account tied to one project and one role. It is created with its
 * token in one step; asking again under the same name gives the same seat a further token.
 */
export async function createSeat(input: SeatInput) {
  if (!(SEAT_ROLES as readonly string[]).includes(input.role)) throw new HandoffError('invalid_role', 'A seat is a developer, a reviewer, a release, a security or a lead seat');
  // A runner is given only the seats of the person it was admitted for, so a seat without an owner would reach no runner.
  if (input.byRunner && !input.ownerId) throw new HandoffError('owner_required', 'A seat run by a runner needs an owner: it goes to the runner admitted for that person');
  const minted = await createAgentToken({
    workspaceId: input.workspaceId, actorId: input.actorId, name: input.name, access: 'write', expiresInDays: input.expiresInDays,
    seat: (tx, account, agents) => writeSeat(tx, input, account, agents), mint: !input.byRunner,
  });
  if (minted.error) return { error: minted.error };
  const { seat, token: secret, ...token } = minted;
  return { seat, token: secret ? { ...token, token: secret } : null };
}

export async function lockMemberSeatProject(tx: Prisma.TransactionClient, workspaceId: string, projectId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${projectId}`}))`;
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} AND "workspaceId" = ${workspaceId} FOR SHARE`;
  const project = await tx.project.findFirst({ where: { id: projectId, workspaceId }, select: { isArchived: true, membersMayAddSeats: true } });
  if (!project) throw new HandoffError('project_not_found', 'Project not found in this workspace', 404);
  if (project.isArchived) throw new HandoffError('project_archived', 'This project is archived: an archived project keeps no seat token a runner fetched. Unarchive it first', 409);
  if (!project.membersMayAddSeats) throw new HandoffError('members_add_off', 'The project owner has not switched this on.', 403);
}

async function writeSeat(tx: Prisma.TransactionClient, input: SeatInput, account: { id: string; name: string | null }, agents: () => Promise<{ id: string; name: string | null }[]>) {
  // One seat change at a time per project, so "the first of its role is the default" and "one release seat" are decided on settled rows.
  if (input.own) await lockMemberSeatProject(tx, input.workspaceId, input.projectId);
  else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${input.projectId}`}))`;
    if (!await tx.project.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true } })) throw new HandoffError('project_not_found', 'Project not found in this workspace', 404);
  }
  const existing = await tx.agentSeat.findUnique({ where: { userId: account.id } });
  if (input.own) {
    // A seat of this role the member was given in the meantime, under any name, is enough, whoever holds the derived
    // name: decided here first, on settled rows.
    if (await tx.agentSeat.count({ where: { projectId: input.projectId, role: input.role, ownerId: input.ownerId, retiredAt: null } })) {
      throw new HandoffError('own_seat_exists', `You already have a ${input.role} seat in this project`, 409);
    }
    // The name is derived, not chosen, so it can meet an agent that is not this member's. Only a seat the member owned comes back.
    if (existing ? existing.ownerId !== input.ownerId : await tx.appToken.count({ where: { userId: account.id } })) {
      throw new HandoffError('name_taken', `An agent named ${account.name ?? input.name} already exists in this workspace. Ask someone who manages the workspace to create this seat`, 409);
    }
    // A member's seats share one form of name, so the form is free only when every name in it is: decided here, on settled
    // rows, among the accounts the mint finds a name in and by the rule above.
    const wanted = (input.together ?? []).map(name => name.trim().toLowerCase());
    for (const other of wanted.length ? await agents() : []) {
      if (other.id === account.id || !wanted.includes(other.name?.trim().toLowerCase() ?? '')) continue;
      const seat = await tx.agentSeat.findUnique({ where: { userId: other.id }, select: { ownerId: true } });
      if (seat ? seat.ownerId !== input.ownerId : await tx.appToken.count({ where: { userId: other.id } })) {
        throw new HandoffError('name_taken', `An agent named ${other.name} already exists in this workspace. Ask someone who manages the workspace to create this seat`, 409);
      }
    }
  }
  const same = !!existing && !existing.retiredAt && existing.projectId === input.projectId && existing.role === input.role;
  if (existing && !existing.retiredAt && !same) {
    throw new HandoffError('seat_exists', `${existing.name} is already a ${existing.role} seat; retire it before giving the name another project or role`, 409);
  }
  if (same && existing.byRunner !== !!input.byRunner) throw new HandoffError('seat_exists', `${existing.name} is run by hand; retire it before giving the seat to a runner`, 409);
  // Tokens a person once saw, or another person's runner fetched, would work the seat beside its runner's. And a token
  // a runner fetched for the seat before it was retired would work the seat made again by hand, whoever owns it now.
  if (!same && await tx.appToken.count({ where: { userId: account.id, isRevoked: false, tokenExpiresAt: { gte: new Date() }, ...(!input.byRunner && { runnerId: { not: null } }) } })) {
    throw new HandoffError('tokens_exist', input.byRunner ? `${account.name ?? input.name} still has usable tokens; revoke them before a runner runs the seat`
      : `${account.name ?? input.name} still has usable tokens a runner fetched; revoke them before the seat is made again`, 409);
  }
  if (!same && input.ownerId && !await tx.workspace.findFirst({
    where: { id: input.workspaceId, OR: [{ ownerId: input.ownerId }, { members: { some: { userId: input.ownerId, status: true } } }] }, select: { id: true },
  })) throw new HandoffError('owner_not_found', "The seat's owner is not an active member of this workspace");
  const others = await tx.agentSeat.findMany({
    where: { projectId: input.projectId, role: input.role, retiredAt: null, userId: { not: account.id } }, select: { id: true, isDefault: true },
  });
  // One lead per project too. Nothing but this check holds it, which is enough under the project's lock taken above.
  if ((input.role === 'release' || input.role === 'lead') && others.length) throw new HandoffError(`${input.role}_seat_exists`, `This project already has a ${input.role} seat; retire it first`, 409);
  const isDefault = same ? existing.isDefault : !!input.isDefault || !others.some(seat => seat.isDefault);
  if (!same && isDefault) await tx.agentSeat.updateMany({ where: { id: { in: others.filter(seat => seat.isDefault).map(seat => seat.id) } }, data: { isDefault: false } });
  const data = { workspaceId: input.workspaceId, projectId: input.projectId, role: input.role, ownerId: same ? existing.ownerId : input.ownerId,
    name: account.name ?? input.name.trim(), isDefault, retiredAt: null, byRunner: !!input.byRunner };
  const seat = await tx.agentSeat.upsert({ where: { userId: account.id }, create: { ...data, userId: account.id }, update: data });
  // An account that had work before it took this seat keeps only what the seat may hold.
  const unassigned = same ? [] : await unassignOpen(tx, seat, input.actorId, 'seat_created', seat);
  await tx.appAuditLog.create({ data: {
    workspaceId: input.workspaceId, actorId: input.actorId, action: 'agent_seat.created',
    details: { seatId: seat.id, serviceUserId: account.id, projectId: seat.projectId, role: seat.role, ownerId: seat.ownerId, isDefault, unassigned, ...(seat.byRunner && { byRunner: true }) },
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

/** What a read of a seat's room gives: a number, no room, or unknown. The last two say why. */
export type SeatRoom = { kind: 'room'; room: number; program: string | null; at: Date } | { kind: 'no_room' | 'unknown'; reason: string };

/**
 * A seat's room, for everything that shows it or places work by it. `runner` is the runner of the seat's person: the
 * one admitted for the seat's owner in the seat's workspace and not removed, or null when there is none. A number
 * needs a figure newer than `ROOM_FRESH_MS` and above 0, from a runner that asked within `IDLE_MS` and did not say it
 * is paused or full; a runner that never reported a state counts as working. What the runner says about itself comes
 * before the figure: a paused runner's seat has no room however fresh its figure is. Unknown means "place the work as
 * before": a seat run by hand, a seat nothing was reported for, and a figure that is too old.
 */
export function seatRoom(seat: { byRunner: boolean; room: number | null; roomProgram: string | null; roomAt: Date | null },
  runner: { state: string | null; lastSeenAt: Date | null; admittedAt?: Date | null } | null, now = new Date()): SeatRoom {
  const none = (reason: string): SeatRoom => ({ kind: 'no_room', reason }), unknown = (reason: string): SeatRoom => ({ kind: 'unknown', reason });
  if (!seat.byRunner) return unknown('the seat is run by hand');
  if (!runner) return none('no runner is connected');
  if (!(runner.lastSeenAt && runner.lastSeenAt.getTime() > now.getTime() - IDLE_MS)) return none('the runner is offline');
  if (runner.state && runner.state !== 'working') {
    return none(runner.state === 'paused' ? 'the runner is paused' : runner.state === 'disk_full' ? "the runner's disk is full" : 'the runner is not working');
  }
  if (seat.room === null || !seat.roomAt || (runner.admittedAt && seat.roomAt <= runner.admittedAt)) return unknown('no figure was reported');
  if (seat.roomAt.getTime() <= now.getTime() - ROOM_FRESH_MS) return unknown(`the figure is older than ${ROOM_FRESH_MS / 60_000} minutes`);
  if (seat.room <= 0) return none('the allowance is used up');
  return { kind: 'room', room: seat.room, program: seat.roomProgram, at: seat.roomAt };
}

/**
 * The seats of a project that are not retired, of one role when one is named, oldest first: the order they had before
 * work was placed by room. Each comes with what placing reads: its room, and the runs its owner has open right now on
 * any seat of the workspace (a seat without an owner counts its own).
 */
export async function seatsWithRoom(db: DB, projectId: string, role?: string, now = new Date()) {
  const seats = await db.agentSeat.findMany({ where: { projectId, retiredAt: null, ...(role && { role }) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, workspaceId: true, userId: true, name: true, role: true, isDefault: true, lastSeenAt: true, byRunner: true, ownerId: true,
      room: true, roomProgram: true, roomAt: true, owner: { select: { id: true, name: true } } } });
  if (!seats.length) return [];
  const { workspaceId } = seats[0], owners = seats.flatMap(seat => seat.ownerId ?? []);
  const runners = await db.agentRunner.findMany({ where: { workspaceId, ownerId: { in: owners }, removedAt: null }, select: { ownerId: true, state: true, lastSeenAt: true, admittedAt: true } });
  const open = await db.agentRun.findMany({ where: { workspaceId, endedAt: null, seat: { OR: [{ ownerId: { in: owners } }, { id: { in: seats.map(seat => seat.id) } }] } },
    select: { seatId: true, seat: { select: { ownerId: true } } } });
  return seats.map(({ room, roomProgram, roomAt, ...seat }) => ({ ...seat,
    room: seatRoom({ byRunner: seat.byRunner, room, roomProgram, roomAt }, runners.find(runner => runner.ownerId === seat.ownerId) ?? null, now),
    openRuns: open.filter(run => seat.ownerId ? run.seat?.ownerId === seat.ownerId : run.seatId === seat.id).length }));
}

/**
 * The one order work is placed by, for the lead's list and for requests. Seats with a number first, most room first;
 * then the seats whose room is unknown; the seats with no room last. Equal standing: the seat whose owner has the
 * fewest open runs, then the role's default seat, then the order given. When every seat is unknown there is nothing to
 * place by, and the order given stands: that is how work was placed before room.
 */
export function byRoom<T extends { room: SeatRoom; openRuns: number; isDefault: boolean }>(seats: T[]): T[] {
  if (seats.every(seat => seat.room.kind === 'unknown')) return [...seats];
  // A number is above 0, so unknown and no room sort below every number.
  const standing = ({ room }: T) => room.kind === 'room' ? room.room : room.kind === 'unknown' ? -1 : -2;
  return [...seats].sort((a, b) => standing(b) - standing(a) || a.openRuns - b.openRuns || +b.isDefault - +a.isDefault);
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
 * Rule 7 for a token that sets an assignee. A seat never does, with one exception: a lead seat gives an existing issue
 * to another seat. Only a caller that goes on to run `leadPlaces` in its write passes `leadPlacesNext`, because that
 * is what holds the lead to its project, its limit and what people decided. With `existingIssue`, an agent token that
 * is not a seat is refused when the assignee is a seat: it gives seats work only by creating issues and by asking for a
 * release by label, and its daily cap counts both.
 */
export async function assertTokenMayAssign(db: DB, context: Caller, assigneeId: string | null, existingIssue: boolean, leadPlacesNext = false): Promise<boolean> {
  const seat = await db.agentSeat.findUnique({ where: { userId: context.user.id }, select: { role: true, retiredAt: true } });
  if (seat) {
    const leads = leadPlacesNext && existingIssue && !!assigneeId && assigneeId !== context.user.id && seat.role === 'lead' && !seat.retiredAt && await isSeatAccount(db, assigneeId);
    if (!leads) throw new HandoffError('seat_scope', 'A seat cannot change who an issue is assigned to', 403);
    return true;
  }
  if (existingIssue && assigneeId && context.app.slug === AGENT_APP_SLUG && await isSeatAccount(db, assigneeId)) {
    throw new HandoffError('assign_by_person', 'An agent token gives a seat work by creating an issue; an existing issue is assigned to a seat by a person', 403);
  }
  return false;
}

/**
 * The lead's exception to rule 7, where it is decided: inside the transaction that sets the assignee of an existing
 * issue, which must be serializable, so two placements that each fit the limit cannot both get in. It does nothing and
 * returns null for a caller that is not a lead seat. A lead gives an issue of its project to another seat of that
 * project, when the issue has no assignee and no lead has placed it before, or when the lead's own placement is still
 * the one in effect. Anything else was decided by someone else and stands (`assign_by_person`). The placement is on
 * the issue's timeline under the lead's name. It returns the seat for the caller's two checks after its update, where
 * the status the request sets is known: the issue is not done (`seat_scope`), and the seat holds at most `LEAD_CAP`
 * open issues from the lead (`lead_cap`).
 */
export async function leadPlaces(tx: Prisma.TransactionClient, context: Pick<AppAuthContext, 'user'>,
  issue: { id: string; workspaceId: string; projectId: string; agentRequestRole: string | null }, to: string): Promise<{ name: string } | null> {
  const me = context.user.id;
  // Both seats' rows, held to the end and read after that: neither is retired while this runs, retiring waits for it,
  // and a retirement that got in first refuses this.
  const rows = await tx.$queryRaw<{ id: string; name: string; userId: string }[]>`SELECT "id", "name", "userId" FROM "AgentSeat" WHERE "userId" IN (${me}, ${to}) ORDER BY "id" FOR SHARE`;
  const lead = await tx.agentSeat.findFirst({ where: { userId: me, role: 'lead', retiredAt: null }, select: { id: true, projectId: true } });
  if (!lead) return null;
  if (lead.projectId !== issue.projectId) throw new HandoffError('wrong_project', "A seat writes only to its own project's issues", 403);
  const seat = rows.find(row => row.userId === to);
  if (!seat || to === me) throw new HandoffError('seat_scope', 'A lead seat assigns issues only to the other seats of its project', 403);
  await assertAssignable(tx, issue, to);
  const current = await tx.issue.findUniqueOrThrow({ where: { id: issue.id }, select: { assigneeId: true, helpers: { where: { approvedBy: me }, select: { userId: true } } } });
  const free = current.assigneeId ? current.helpers.some(row => row.userId === current.assigneeId)
    : !await tx.issueActivity.count({ where: { itemType: 'ISSUE', itemId: issue.id, action: 'LEAD_ASSIGNED' } });
  if (!free) throw new HandoffError('assign_by_person', 'Someone else decided who has this issue, or took it from the seat the lead gave it to: that stands, and a person assigns it', 403);
  await tx.issueActivity.create({ data: { action: 'LEAD_ASSIGNED', itemType: 'ISSUE', itemId: issue.id, userId: me, workspaceId: issue.workspaceId, projectId: issue.projectId,
    fieldName: 'assignee', oldValue: current.assigneeId ?? '', newValue: to, details: JSON.stringify({ seatId: lead.id, toSeatId: seat.id, to: seat.name }) } });
  return { name: seat.name };
}

/**
 * True when this agent account, known not to be a seat, has handed seats its cap of new issues today (UTC). Called
 * inside the transaction that would hand over one more: it holds a lock per token account until that ends.
 */
export async function lockSeatHandoffCap(tx: Prisma.TransactionClient, actorId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assign-cap:${actorId}`}))`;
}

export async function seatHandoffCapReached(tx: Prisma.TransactionClient, actorId: string): Promise<boolean> {
  await lockSeatHandoffCap(tx, actorId);
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
 * finished issues keep its name. The tokens its runner fetched are revoked; a token made by hand stays until
 * revoked, but writes nothing any more.
 */
export async function retireSeat(input: { workspaceId: string; actorId: string; seatId: string; only?: Prisma.AgentSeatWhereInput }) {
  // With `only`, the seat must still match it when it is read under its lock: a seat made again for someone else, in
  // another project or in another role in the meantime is not found.
  const where = { ...input.only, id: input.seatId, workspaceId: input.workspaceId, retiredAt: null };
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
    // Rule 4: a seat that goes leaves no token a runner fetched for it (CLB-517). A token made by hand is the
    // person's to revoke on the Agent tokens page, as before.
    const revoked = await tx.appToken.updateManyAndReturn({ where: { userId: seat.userId, runnerId: { not: null }, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() }, select: { id: true } });
    if (seat.isDefault) {
      // Requests for this role keep a seat to go to.
      const next = await tx.agentSeat.findFirst({ where: { projectId: seat.projectId, role: seat.role, retiredAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (next) await tx.agentSeat.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    await tx.appAuditLog.create({ data: {
      workspaceId: input.workspaceId, actorId: input.actorId, action: 'agent_seat.retired',
      details: { seatId: seat.id, serviceUserId: seat.userId, projectId: seat.projectId, role: seat.role, unassigned, revokedTokens: revoked.map(token => token.id) },
    } });
    return { unassigned, revokedTokens: revoked.length };
  });
}
