import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * The one place where a workspace's levels and their rules are written.
 * Keep it free of `next` and session imports, so that routes, server actions
 * and the token API can all ask it.
 */

/** The four levels, highest first. */
export type WorkspaceLevel = "PRIMARY_OWNER" | "OWNER" | "ADMIN" | "STANDARD";

export type WorkspaceAction =
  | "workspace.delete"
  | "workspace.transfer"
  | "owners.manage"
  | "workspace.settings"
  | "roles.edit"
  | "apps.manage"
  | "members.manage"
  | "members.invite"
  | "content.manage"
  | "spend.view"
  | "integrations.manage"
  | "runners.manage"
  | "seats.manage";

export interface WorkspaceAuthority {
  userId: string;
  /** Null for a platform admin who is neither the owner nor an active member. */
  level: WorkspaceLevel | null;
  /** The role on the user's active membership row, if there is one. */
  role: string | null;
  platformAdmin: boolean;
}

/** What `mayActOn` and `rolesMayGrant` need to know about the actor or target. */
type Ranked = Pick<WorkspaceAuthority, "userId" | "level"> | null | undefined;

const RANK: Record<WorkspaceLevel, number> = { STANDARD: 0, ADMIN: 1, OWNER: 2, PRIMARY_OWNER: 3 };

const MINIMUM: Record<WorkspaceAction, WorkspaceLevel> = {
  "workspace.delete": "PRIMARY_OWNER",
  "workspace.transfer": "PRIMARY_OWNER",
  "owners.manage": "PRIMARY_OWNER",
  "workspace.settings": "OWNER",
  "roles.edit": "OWNER",
  "apps.manage": "OWNER",
  "members.manage": "ADMIN",
  "members.invite": "ADMIN",
  // Other people's notes, Context folders and files, posts through a token, and deleting an issue for good.
  "content.manage": "ADMIN",
  "spend.view": "ADMIN",
  // Someone else's git connection, and someone else's runner.
  "integrations.manage": "OWNER",
  "runners.manage": "OWNER",
  // Someone else's agent seat, besides MANAGE_AGENTS (CLB-1185).
  "seats.manage": "ADMIN",
};

/** The level a stored role gives an active member. Built-in names match in any letter case. */
export function levelOfRole(role: string): "OWNER" | "ADMIN" | "STANDARD" {
  if (/^OWNER$/i.test(role)) return "OWNER";
  if (/^ADMIN$/i.test(role)) return "ADMIN";
  return "STANDARD";
}

/**
 * Who the user is in the workspace. The workspace's `ownerId` is the primary
 * owner whatever its membership row says. Null for anyone without access.
 */
export async function getWorkspaceAuthority(
  userId: string,
  workspaceId: string,
  db: Pick<Prisma.TransactionClient | typeof prisma, "workspace" | "user"> = prisma,
): Promise<WorkspaceAuthority | null> {
  const [workspace, user] = await Promise.all([
    db.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    db.user.findUnique({
      where: { id: userId },
      select: { role: true, workspaceMemberships: { where: { workspaceId, status: true }, select: { role: true } } },
    }),
  ]);
  if (!workspace || !user) return null;

  const platformAdmin = user.role === "SYSTEM_ADMIN";
  const role = user.workspaceMemberships[0]?.role ?? null;
  if (workspace.ownerId === userId) return { userId, level: "PRIMARY_OWNER", role, platformAdmin };
  if (role !== null) return { userId, level: levelOfRole(role), role, platformAdmin };
  if (platformAdmin) return { userId, level: null, role: null, platformAdmin };
  return null;
}

function rankOf(level: WorkspaceLevel | null | undefined): number | null {
  return level && Object.prototype.hasOwnProperty.call(RANK, level) ? RANK[level] : null;
}

/** Whether the level allows the action. A platform admin's own answers stay with each caller. */
export function may(authority: Pick<WorkspaceAuthority, "level"> | null | undefined, action: WorkspaceAction): boolean {
  const held = rankOf(authority?.level);
  if (held === null || !Object.prototype.hasOwnProperty.call(MINIMUM, action)) return false;
  return held >= RANK[MINIMUM[action]];
}

/**
 * The rank rule: never on yourself; an Admin or above acts on a strictly lower
 * level; a standard role acts on standard roles only, when it holds change-roles.
 */
export function mayActOn(actor: Ranked, target: Ranked, { holdsChangeRoles }: { holdsChangeRoles: boolean }): boolean {
  const mine = rankOf(actor?.level);
  const theirs = rankOf(target?.level);
  if (mine === null || theirs === null || actor!.userId === target!.userId) return false;
  if (mine === RANK.STANDARD) return holdsChangeRoles && theirs === RANK.STANDARD;
  return theirs < mine;
}

/**
 * The roles the actor may give someone: those strictly below its own level, so
 * Owner only for the primary owner. A standard role that holds change-roles
 * may give standard roles only.
 */
export function rolesMayGrant(actor: Ranked, roleNames: string[], { holdsChangeRoles }: { holdsChangeRoles: boolean }): string[] {
  const mine = rankOf(actor?.level);
  if (mine === null) return [];
  if (mine === RANK.STANDARD) return holdsChangeRoles ? roleNames.filter((name) => levelOfRole(name) === "STANDARD") : [];
  return roleNames.filter((name) => RANK[levelOfRole(name)] < mine);
}

/** The actor's verdict on what belongs to another person: acts on it (`below`), the person has no level any more (`inactive`), or neither. */
export type PersonAccess = "below" | "inactive" | "denied";

/**
 * The actor's verdict on what belongs to each of these people (a runner, a seat): an actor allowed `action` acts on a
 * person strictly below them; a person with no level counts as below everyone, which each caller decides on. The
 * actor's level and theirs come from ONE snapshot, so a verdict is always one that was true at some instant, and are
 * read the way `getWorkspaceAuthority` reads one person: the workspace's owner is the primary owner, an active
 * membership gives its role's level. `platformAdmin` is the actor's, from the same snapshot; whether it counts stays with
 * each caller. Read outside any transaction: it takes a connection of its own. With no workspace nobody acts on anyone.
 */
export async function accessOnPeople(actorId: string, workspaceId: string, personIds: string[], action: WorkspaceAction) {
  const [workspace, members, platformAdmins] = await prisma.$transaction([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findMany({ where: { workspaceId, status: true, userId: { in: [actorId, ...personIds] } }, select: { userId: true, role: true } }),
    prisma.user.count({ where: { id: actorId, role: "SYSTEM_ADMIN" } }),
  ], { isolationLevel: "RepeatableRead" });
  const rolesByUserId = new Map(members.map((member) => [member.userId, member.role]));
  const levelOf = (userId: string): WorkspaceLevel | null => {
    const role = rolesByUserId.get(userId);
    return userId === workspace?.ownerId ? "PRIMARY_OWNER" : role === undefined ? null : levelOfRole(role);
  };
  const actor = { userId: actorId, level: levelOf(actorId) };
  const access = (personId: string): PersonAccess => {
    if (!workspace || !may(actor, action)) return "denied";
    const person = { userId: personId, level: levelOf(personId) };
    if (!person.level) return "inactive";
    return mayActOn(actor, person, { holdsChangeRoles: false }) ? "below" : "denied";
  };
  return { access, platformAdmin: platformAdmins > 0, levelOf };
}

/** What a refused act on someone else's seat answers. */
export const SEAT_RANK_REFUSAL = "A seat of someone at or above your own level is managed by someone above them";

export async function seatOwnerAccess(actorId: string, workspaceId: string, observedOwnerId: string | null, requestedOwnerId: string | null = null) {
  const personId = observedOwnerId ?? requestedOwnerId;
  let rank: PersonAccess = "below";
  if (personId && personId !== actorId) {
    const snapshot = await accessOnPeople(actorId, workspaceId, [personId], "seats.manage");
    rank = snapshot.platformAdmin ? (snapshot.levelOf(personId) ? "below" : "inactive") : snapshot.access(personId);
  }
  return (liveOwnerId = observedOwnerId, creating = false): "pass" | "refused" | "changed" | "inactive" => {
    if (liveOwnerId !== observedOwnerId) return "changed";
    if (!liveOwnerId && !creating) return "pass";
    if (creating && rank === "inactive") return "inactive";
    return rank === "denied" ? "refused" : "pass";
  };
}
