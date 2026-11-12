import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';

export type MembershipChange = 'changed' | 'unchanged' | 'not_found' | 'owner' | 'agent';

/**
 * Make a person a member of a workspace without an invitation, or switch them off there.
 * The caller checks that the actor may manage members in that workspace.
 */
export async function setWorkspaceMembership(input: {
  actorId: string; workspaceId: string; userId: string; active: boolean;
}): Promise<MembershipChange> {
  const [workspace, user, actor] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { ownerId: true } }),
    prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }),
    prisma.user.findUnique({ where: { id: input.actorId }, select: { role: true } }),
  ]);
  if (!workspace || !user) return 'not_found';
  // An account with no email is an agent token's service account: the Agent tokens page has its own rules for those.
  if (!user.email) return 'agent';
  // The owner is in the workspace through ownership, not through a membership that could be switched.
  if (workspace.ownerId === input.userId) return 'owner';

  try {
    return await prisma.$transaction(async tx => {
      const key = { userId: input.userId, workspaceId: input.workspaceId };
      // The member list can switch the same row at the same moment; holding it keeps what is recorded equal to what changed.
      await tx.$queryRaw`SELECT "id" FROM "WorkspaceMember" WHERE "userId" = ${input.userId} AND "workspaceId" = ${input.workspaceId} FOR UPDATE`;
      const member = await tx.workspaceMember.findUnique({ where: { userId_workspaceId: key }, select: { status: true } });
      if (!!member?.status === input.active) return 'unchanged';
      if (input.active) {
        // Someone new to the workspace must be a person the actor already works with; a stranger needs an
        // invitation they accept, and reads the same as an account that does not exist.
        if (!member && actor?.role !== 'SYSTEM_ADMIN' && !await tx.workspace.findFirst({
          where: { AND: [postWorkspaceAccessWhere(input.actorId), postWorkspaceAccessWhere(input.userId)] }, select: { id: true },
        })) return 'not_found';
        // A new row is created, never upserted: if another request adds the same person first, this one fails on
        // the unique key instead of recording a change it did not make.
        if (member) await tx.workspaceMember.update({ where: { userId_workspaceId: key }, data: { status: true } });
        else await tx.workspaceMember.create({ data: { ...key, role: 'MEMBER' } });
      } else {
        await tx.workspaceMember.update({ where: { userId_workspaceId: key }, data: { status: false } });
      }
      await tx.appAuditLog.create({ data: {
        workspaceId: input.workspaceId, actorId: input.actorId,
        action: input.active ? 'workspace_member.added' : 'workspace_member.switched_off',
        details: { userId: input.userId },
      } });
      return 'changed';
    });
  } catch (error) {
    // Lost the race to add the same person: they are in, and this request changed nothing.
    if ((error as { code?: string } | null)?.code === 'P2002') return 'unchanged';
    throw error;
  }
}

export type WorkspaceSwitchState = 'owner' | 'on' | 'off';

/** A person's place in each of the given workspaces, for the switches of the user workspaces screens. */
export async function membershipRows(userId: string, workspaces: { id: string; name: string; slug: string; ownerId: string }[]) {
  const active = new Set((await prisma.workspaceMember.findMany({
    where: { userId, status: true, workspaceId: { in: workspaces.map(row => row.id) } }, select: { workspaceId: true },
  })).map(row => row.workspaceId));
  return workspaces.map(({ id, name, slug, ownerId }) => {
    const state: WorkspaceSwitchState = ownerId === userId ? 'owner' : active.has(id) ? 'on' : 'off';
    return { id, name, slug, state };
  });
}
