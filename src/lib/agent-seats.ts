import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { HandoffError } from '@/lib/agent-handoffs';
import { AGENT_APP_SLUG, createAgentToken } from '@/lib/agent-tokens';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { assertAssignable } from '@/lib/issue-assignee';
import { connectedRepositories } from '@/lib/agent-repository';
import { ROLE_CATALOGUE } from '@/lib/agent-role-catalogue';
import { SEAT_RANK_REFUSAL, seatOwnerAccess } from '@/lib/workspace-authority';

export { HandoffError };
type DB = Prisma.TransactionClient | typeof prisma;
type Caller = Pick<AppAuthContext, 'user' | 'app' | 'workspace'>;

export const SEAT_ROLES = ROLE_CATALOGUE.roles.map(role => role.id);
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
/** A seat that has had no room for this long gives up the work no run has started on. */
export const NO_ROOM_MOVE_MS = 10 * 60_000;
/** A seat that has had no room for this long gives up, between runs, the work a run has started on and pushed (CLB-809). */
export const STARTED_MOVE_MS = 30 * 60_000;
/** The audit rows that open and end a spell in which a seat's runner says the seat has no room: see `markNoRoom`. */
const NO_ROOM = 'agent_seat.no_room', ROOM_BACK = 'agent_seat.room_back';
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
  /** The seat's own pick among its project's connected repositories. Without one the seat follows its project. */
  repositoryId?: string;
  /** The workspace's own role the seat has (CLB-628); `role` is then that role's base role. */
  customRoleId?: string;
}

/**
 * Creates a seat for one project and role. If a token is minted, creation is atomic and minting again
 * under the same name gives the seat another token. A workspace's custom role (`customRoleId`, CLB-628) uses its built-in base role.
 */
export async function createSeat(input: Omit<SeatInput, 'role'> & { role?: string }) {
  if (input.customRoleId) {
    const custom = await prisma.agentCustomRole.findFirst({ where: { id: input.customRoleId, workspaceId: input.workspaceId }, select: { baseRole: true, retiredAt: true } });
    if (!custom || (input.role !== undefined && input.role !== custom.baseRole)) throw new HandoffError('invalid_role', 'Choose one of your organisation\'s roles');
    if (custom.retiredAt) throw new HandoffError('role_retired', 'This role is retired: no new seat takes it', 409);
    return createSeatOf({ ...input, role: custom.baseRole });
  }
  return createSeatOf({ ...input, role: input.role ?? '' });
}

async function createSeatOf(input: SeatInput) {
  const role = ROLE_CATALOGUE.getRole(input.role);
  if (!role) throw new HandoffError('invalid_role', `Choose a seat role: ${SEAT_ROLES.join(', ')}`);
  // A runner is given only the seats of the person it was admitted for, so a seat without an owner would reach no runner.
  if (input.byRunner && !input.ownerId) throw new HandoffError('owner_required', 'A seat run by a runner needs an owner: it goes to the runner admitted for that person');
  const minted = await createAgentToken({
    workspaceId: input.workspaceId, actorId: input.actorId, name: input.name, access: 'write', expiresInDays: input.expiresInDays,
    seat: (tx, account, agents, owners) => writeSeat(tx, input, role, account, agents, owners), mint: !input.byRunner, seatOwnerId: input.ownerId,
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

async function writeSeat(tx: Prisma.TransactionClient, input: SeatInput, role: (typeof ROLE_CATALOGUE.roles)[number], account: { id: string; name: string | null }, agents: () => Promise<{ id: string; name: string | null }[]>,
  owners: Awaited<ReturnType<typeof seatOwnerAccess>>) {
  // One seat change at a time per project, so "the first of its role is the default" and "one release seat" are decided on settled rows.
  if (input.own) await lockMemberSeatProject(tx, input.workspaceId, input.projectId);
  else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${input.projectId}`}))`;
    if (!await tx.project.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true } })) throw new HandoffError('project_not_found', 'Project not found in this workspace', 404);
  }
  if (input.repositoryId) {
    if (role.repository === 'none') throw new HandoffError('repository_not_needed', `A ${input.role} seat works in no repository, so it picks none`);
    // Read among the seat's own project's rows, so an id of another project's repository names nothing here.
    if (!(await connectedRepositories(tx, input.projectId)).some(repository => repository.id === input.repositoryId)) {
      throw new HandoffError('invalid_repository', "Choose one of this project's connected repositories");
    }
  }
  // A role retired after it was read is not taken: retiring waits for this transaction, or this one sees it retired.
  if (input.customRoleId && !(await tx.$queryRaw<unknown[]>`SELECT 1 FROM "AgentCustomRole" WHERE "id" = ${input.customRoleId} AND "retiredAt" IS NULL FOR SHARE`).length) {
    throw new HandoffError('role_retired', 'This role is retired: no new seat takes it', 409);
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
  const same = !!existing && !existing.retiredAt && existing.projectId === input.projectId && existing.role === input.role
    && existing.customRoleId === (input.customRoleId ?? null);
  if (existing && !existing.retiredAt && !same) {
    // A seat with the workspace's own role is named by that role, as it is everywhere it is shown.
    const held = existing.customRoleId ? (await tx.agentCustomRole.findUnique({ where: { id: existing.customRoleId }, select: { name: true } }))?.name ?? existing.role : existing.role;
    throw new HandoffError('seat_exists', `${existing.name} is already a ${held} seat; retire it before giving the name another project or role`, 409);
  }
  if (same && existing.byRunner !== !!input.byRunner) throw new HandoffError('seat_exists', `${existing.name} is run by hand; retire it before giving the seat to a runner`, 409);
  // Someone else's seat, the one asked for again or the one made here, needs the rank rule (CLB-1185); throwing undoes the mint's writes.
  const verdict = owners(same ? existing.ownerId : null, !same);
  if (verdict === 'changed') throw new HandoffError('not_found', 'Seat not found', 404);
  if (verdict === 'refused') throw new HandoffError('outranked', SEAT_RANK_REFUSAL, 403);
  // Tokens a person once saw, or another person's runner fetched, would work the seat beside its runner's. And a token
  // a runner fetched for the seat before it was retired would work the seat made again by hand, whoever owns it now.
  if (!same && await tx.appToken.count({ where: { userId: account.id, isRevoked: false, tokenExpiresAt: { gte: new Date() }, ...(!input.byRunner && { runnerId: { not: null } }) } })) {
    throw new HandoffError('tokens_exist', input.byRunner ? `${account.name ?? input.name} still has usable tokens; revoke them before a runner runs the seat`
      : `${account.name ?? input.name} still has usable tokens a runner fetched; revoke them before the seat is made again`, 409);
  }
  if (!same && input.ownerId && (verdict === 'inactive' || !await tx.workspace.findFirst({
    where: { id: input.workspaceId, OR: [{ ownerId: input.ownerId }, { members: { some: { userId: input.ownerId, status: true } } }] }, select: { id: true },
  }))) throw new HandoffError('owner_not_found', "The seat's owner is not an active member of this workspace");
  const others = await tx.agentSeat.findMany({
    where: { projectId: input.projectId, role: input.role, retiredAt: null, userId: { not: account.id } }, select: { id: true, isDefault: true },
  });
  if (role.maxPerProject !== null && others.length >= role.maxPerProject) {
    const limit = role.maxPerProject === 1 ? `a ${role.id} seat; retire it first` : `${role.maxPerProject} ${role.id} seats; retire one first`;
    throw new HandoffError(`${role.id}_seat_exists`, `This project already has ${limit}`, 409);
  }
  const isDefault = same ? existing.isDefault : !!input.isDefault || !others.some(seat => seat.isDefault);
  if (!same && isDefault) await tx.agentSeat.updateMany({ where: { id: { in: others.filter(seat => seat.isDefault).map(seat => seat.id) } }, data: { isDefault: false } });
  // A seat made again starts with no figure: the one it kept was reported for the seat it was, perhaps for someone else's runner.
  // Its pick is the one this request names. Like the owner, the pick is the seat's from then on: asking again for the
  // same seat, which the form does with the project's default filled in, gives a further token and moves nothing.
  const data = { workspaceId: input.workspaceId, projectId: input.projectId, role: input.role, ownerId: same ? existing.ownerId : input.ownerId,
    name: account.name ?? input.name.trim(), isDefault, retiredAt: null, byRunner: !!input.byRunner, repositoryId: same ? existing.repositoryId : input.repositoryId ?? null,
    customRoleId: input.customRoleId ?? null,
    ...(!same && { room: null, roomProgram: null, roomAt: null }) };
  const seat = await tx.agentSeat.upsert({ where: { userId: account.id }, create: { ...data, userId: account.id }, update: data });
  // An account that had work before it took this seat keeps only what the seat may hold.
  const unassigned = same ? [] : await unassignOpen(tx, seat, input.actorId, 'seat_created', { projectId: input.projectId, role: seat.role });
  await tx.appAuditLog.create({ data: {
    workspaceId: input.workspaceId, actorId: input.actorId, action: 'agent_seat.created',
    details: { seatId: seat.id, serviceUserId: account.id, projectId: seat.projectId, role: seat.role, ownerId: seat.ownerId, isDefault, unassigned, ...(seat.byRunner && { byRunner: true }),
      ...(seat.repositoryId && { repositoryId: seat.repositoryId }), ...(seat.customRoleId && { customRoleId: seat.customRoleId }) },
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
  const misfit = keep ? Prisma.sql`AND (i."projectId" <> ${keep.projectId} OR NOT (COALESCE(i."agentRequestRole", '') = ANY(${(ROLE_CATALOGUE.getRole(keep.role)?.issueKinds ?? []).map(kind => kind ?? '')})))` : Prisma.empty;
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

/**
 * The caller's seat, or null for a person, for a token that is not a seat, and for a retired seat. A seat without a
 * project (scope whole workspace, CLB-613) is refused: it has no inbox, checkout or requests until CLB-615.
 */
export async function seatFor(db: DB, context: Pick<AppAuthContext, 'user'>) {
  const seat = await db.agentSeat.findFirst({ where: { userId: context.user.id, retiredAt: null } });
  if (!seat) return null;
  if (seat.projectId === null) throw new HandoffError('workspace_seat', 'A seat without a project cannot do this yet', 403);
  return { ...seat, projectId: seat.projectId };
}

export async function requireSeat(db: DB, context: Pick<AppAuthContext, 'user'>) {
  const seat = await seatFor(db, context);
  if (!seat) throw new HandoffError('seat_required', 'This call needs a seat token', 403);
  return seat;
}

/** What a read of a seat's room gives: a number, no room, or unknown. The last two say why. */
// `live` marks an unknown seat whose runner is seen and working: by the runner's own rules that is a seat whose next
// program is signed in, not held, and simply has no fresh reading.
export type SeatRoom = { kind: 'room'; room: number; program: string | null; at: Date } | { kind: 'no_room' | 'unknown'; reason: string; live?: true };

/**
 * A seat's room, for everything that shows it or places work by it. `runner` is the runner of the seat's person: the
 * one admitted for the seat's owner in the seat's workspace and not removed, or null when there is none. A number
 * needs a figure newer than `ROOM_FRESH_MS` and above 0, from a runner that asked within `IDLE_MS` and did not say it
 * is paused or full; a runner that never reported a state counts as working. What the runner says about itself comes
 * before the figure: a paused runner's seat has no room however fresh its figure is. Unknown means "place the work as
 * before": a seat run by hand, a seat nothing was reported for, and a figure that is too old.
 */
export function seatRoom(seat: { byRunner: boolean; room: number | null; roomProgram: string | null; roomAt: Date | null },
  runner: { state: string | null; lastSeenAt: Date | null } | null, now = new Date()): SeatRoom {
  const none = (reason: string): SeatRoom => ({ kind: 'no_room', reason }), unknown = (reason: string): SeatRoom => ({ kind: 'unknown', reason });
  if (!seat.byRunner) return unknown('the seat is run by hand');
  if (!runner) return none('no runner is connected');
  if (!(runner.lastSeenAt && runner.lastSeenAt.getTime() > now.getTime() - IDLE_MS)) return none('the runner is offline');
  if (runner.state && runner.state !== 'working') {
    return none(runner.state === 'paused' ? 'the runner is paused' : runner.state === 'disk_full' ? "the runner's disk is full" : 'the runner is not working');
  }
  if (seat.room === null || !seat.roomAt) return { ...unknown('no figure was reported'), ...(runner.state === 'working' && { live: true as const }) };
  if (seat.roomAt.getTime() <= now.getTime() - ROOM_FRESH_MS) return { ...unknown(`the figure is older than ${ROOM_FRESH_MS / 60_000} minutes`), ...(runner.state === 'working' && { live: true as const }) };
  if (seat.room <= 0) return none('its runner reports no room');
  return { kind: 'room', room: seat.room, program: seat.roomProgram, at: seat.roomAt };
}

/**
 * What a runner itself says, whatever the clock says about the runner: it is paused or its disk is full, or the seat's
 * fresh figure is 0. These are the causes of no room that no stored time marks; a runner that is offline or gone has one.
 */
export const saysNoRoom = (seat: { room: number | null; roomAt: Date | null }, state: string | null, now: Date) =>
  (!!state && state !== 'working') || (seat.room !== null && seat.room <= 0 && !!seat.roomAt && seat.roomAt.getTime() > now.getTime() - ROOM_FRESH_MS);

/**
 * Since when a seat's runner has said the seat has no room is kept as rows of the audit log under the seat's account,
 * the way the daily cap is counted from rows: `agent_seat.no_room` opens a spell and `agent_seat.room_back` ends it.
 * Call it in the transaction of every report that says something, for each seat of the runner, with what the runner
 * had said until then (`before`) and says now (`after`). Afterwards a seat's last row is `agent_seat.no_room` exactly
 * when the report leaves it without room, so a report that gives the seat room ends the spell and no earlier row can
 * count again. A spell also opens anew when the runner had not been saying so although the last row is open: a figure
 * that grew too old in between was unknown, not none.
 * shortcut: a seat retired during a spell and made again while its runner stays paused or full counts from the row of
 * its earlier life, so its work can move up to 10 minutes early; an `AgentSeat.noRoomSince` column, reset when a seat
 * is made, would be exact.
 */
export async function markNoRoom(tx: Prisma.TransactionClient, workspaceId: string, seats: { id: string; userId: string; before: boolean; after: boolean }[], now: Date) {
  if (!seats.length) return;
  const last = new Map((await tx.$queryRaw<{ actorId: string; action: string; createdAt: Date }[]>`SELECT DISTINCT ON ("actorId") "actorId", "action", "createdAt" FROM "AppAuditLog"
    WHERE "actorId" = ANY(${seats.map(seat => seat.userId)}) AND "action" IN (${NO_ROOM}, ${ROOM_BACK}) ORDER BY "actorId", "createdAt" DESC, "id" DESC`).map(row => [row.actorId, row]));
  const rows = seats.flatMap(seat => {
    const latest = last.get(seat.userId), spell = latest?.action === NO_ROOM;
    const action = seat.after ? (!spell || !seat.before) && NO_ROOM : spell && ROOM_BACK;
    // Stamped with the report's own time, which the caller takes once it holds the runner's row, and always after the
    // seat's last row: the rows are read back in the order of their times, so a report handled later is later, whatever a clock said.
    return action ? [{ workspaceId, actorId: seat.userId, action, details: { seatId: seat.id }, createdAt: new Date(Math.max(now.getTime(), (latest?.createdAt.getTime() ?? 0) + 1)) }] : [];
  });
  if (rows.length) await tx.appAuditLog.createMany({ data: rows });
}

/**
 * For a seat that has no room now (`seatRoom`): the moment it had had none for `wait`, from which its work leaves it:
 * `NO_ROOM_MOVE_MS` for work no run has started on, `STARTED_MOVE_MS` for started work. Null when Collab cannot tell
 * since when. A runner that is offline has had none since its last call: the `IDLE_MS` of silence that made it offline
 * count toward the wait and are not waited for a second time. With no runner it is counted from when the last one was
 * removed, or from the seat's first day. Otherwise the runner said so, and the seat's open spell says since when
 * (`markNoRoom`); a seat with no open spell is not moved from.
 */
export async function noRoomDue(db: DB, seat: { userId: string; workspaceId: string; ownerId: string | null; createdAt: Date }, now = new Date(),
  wait = NO_ROOM_MOVE_MS): Promise<Date | null> {
  // The same runner `seatsWithRoom` reads: the one admitted last that was not removed.
  const runners = seat.ownerId ? await db.agentRunner.findMany({ where: { workspaceId: seat.workspaceId, ownerId: seat.ownerId }, orderBy: { admittedAt: 'desc' },
    select: { lastSeenAt: true, admittedAt: true, removedAt: true } }) : [];
  const runner = runners.find(row => !row.removedAt);
  if (!runner) return new Date(Math.max(seat.createdAt.getTime(), ...runners.map(row => row.removedAt!.getTime())) + wait);
  if (!(runner.lastSeenAt && runner.lastSeenAt.getTime() > now.getTime() - IDLE_MS)) {
    const seen = runner.lastSeenAt ?? runner.admittedAt;
    return seen && new Date(seen.getTime() + Math.max(IDLE_MS, wait));
  }
  const last = await db.appAuditLog.findFirst({ where: { actorId: seat.userId, action: { in: [NO_ROOM, ROOM_BACK] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { action: true, createdAt: true } });
  return last?.action === NO_ROOM ? new Date(last.createdAt.getTime() + wait) : null;
}

/**
 * The seats of a project that are not retired, of one role when one is named, oldest first: the order they had before
 * work was placed by room. Each comes with what placing reads: its room, and the runs its owner has open right now on
 * any seat of the workspace (a seat without an owner counts its own).
 */
export async function seatsWithRoom(db: DB, projectId: string, role?: string, now = new Date()) {
  const seats = await db.agentSeat.findMany({ where: { projectId, retiredAt: null, ...(role && { role }) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, workspaceId: true, userId: true, name: true, role: true, isDefault: true, lastSeenAt: true, byRunner: true, ownerId: true, createdAt: true,
      room: true, roomProgram: true, roomAt: true, owner: { select: { id: true, name: true } } } });
  if (!seats.length) return [];
  const { workspaceId } = seats[0], owners = seats.flatMap(seat => seat.ownerId ?? []);
  // A person has one runner per workspace; should two ever stand, the one admitted last is the person's.
  const runners = await db.agentRunner.findMany({ where: { workspaceId, ownerId: { in: owners }, removedAt: null }, orderBy: { admittedAt: 'desc' }, select: { ownerId: true, state: true, lastSeenAt: true } });
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
  // A number is above 0, so unknown and no room sort below every number. The one exception is a stopgap until every
  // runner reports a figure (CLB-812): a seat whose runner works but sent none stands level with the most room, or
  // work would only ever go to the seats that already report.
  const best = Math.max(0, ...seats.map(({ room }) => room.kind === 'room' ? room.room : 0));
  const standing = ({ room }: T) => room.kind === 'room' ? room.room : room.kind === 'unknown' ? (room.live && best) || -1 : -2;
  return [...seats].sort((a, b) => standing(b) - standing(a) || a.openRuns - b.openRuns || +b.isDefault - +a.isDefault);
}

/**
 * Rule 2 limits a live project seat to its project's issues. Under Rule 8, comment and attachment routes
 * pass `commentOn` so the seat can also reply to a request that names it as the reporter.
 * Retired seats and seats without a project cannot write, even as reporters. Accounts without a seat pass this guard.
 */
export async function seatWriteGuard(db: DB, context: Pick<AppAuthContext, 'user'>, projectId: string,
  commentOn?: { agentRequestRole: string | null; reporterId: string | null }): Promise<void> {
  const seat = await db.agentSeat.findUnique({ where: { userId: context.user.id }, select: { projectId: true, retiredAt: true } });
  if (!seat) return;
  if (seat.retiredAt) throw new HandoffError('seat_scope', 'This seat is retired', 403);
  if (seat.projectId === null) throw new HandoffError('wrong_project', "A seat writes only to its own project's issues", 403);
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
 * the one in effect. Anything else was decided by someone else and stands (`assign_by_person`), and an issue a run is open on keeps its
 * seat (`already_running`). The placement is on
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
  // Work under a run keeps its seat (CLB-780): a run may have started since the lead read that none had.
  if (current.assigneeId && await tx.agentRun.count({ where: { issueId: issue.id, endedAt: null } })) {
    throw new HandoffError('already_running', 'A run is open on this issue: it keeps its seat until the run has ended', 409);
  }
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
  // Someone else's seat is decided on before the transaction, on its person as read now (CLB-1185); inside it a seat of anyone else reads as absent.
  const observed = await prisma.agentSeat.findFirst({ where, select: { ownerId: true } });
  if (!observed) throw new HandoffError('not_found', 'Seat not found', 404);
  const access = await seatOwnerAccess(input.actorId, input.workspaceId, observed.ownerId);
  return prisma.$transaction(async tx => {
    const found = await tx.agentSeat.findFirst({ where, select: { projectId: true } });
    if (!found) throw new HandoffError('not_found', 'Seat not found', 404);
    const lockKey = found.projectId === null ? `agent-seat-workspace:${input.workspaceId}` : `agent-seat:${found.projectId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "id" = ${input.seatId} FOR UPDATE`;
    const seat = await tx.agentSeat.findFirst({ where: { ...where, projectId: found.projectId } });
    const verdict = seat && access(seat.ownerId);
    if (!seat || verdict === 'changed') throw new HandoffError('not_found', 'Seat not found', 404);
    if (verdict === 'refused') throw new HandoffError('outranked', SEAT_RANK_REFUSAL, 403);
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
      // When projectId is null, workspaceId keeps the default in the retiring seat's workspace.
      const next = await tx.agentSeat.findFirst({ where: { workspaceId: seat.workspaceId, projectId: seat.projectId, role: seat.role, retiredAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (next) await tx.agentSeat.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    await tx.appAuditLog.create({ data: {
      workspaceId: input.workspaceId, actorId: input.actorId, action: 'agent_seat.retired',
      details: { seatId: seat.id, serviceUserId: seat.userId, projectId: seat.projectId, role: seat.role, unassigned, revokedTokens: revoked.map(token => token.id) },
    } });
    return { unassigned, revokedTokens: revoked.length };
  });
}
