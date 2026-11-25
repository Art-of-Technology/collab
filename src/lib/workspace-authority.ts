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
  | "runners.manage";

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
};

/** The level a stored role gives an active member. Built-in names match in any letter case. */
export function levelOfRole(role: string): "OWNER" | "ADMIN" | "STANDARD" {
  const name = String(role).toUpperCase();
  if (name === "OWNER") return "OWNER";
  if (name === "ADMIN") return "ADMIN";
  return "STANDARD";
}

/**
 * Who the user is in the workspace. The workspace's `ownerId` is the primary
 * owner whatever its membership row says. Null for anyone without access.
 */
export async function getWorkspaceAuthority(userId: string, workspaceId: string): Promise<WorkspaceAuthority | null> {
  const [workspace, user] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.user.findUnique({
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
