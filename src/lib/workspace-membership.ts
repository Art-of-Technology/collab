import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { levelOfRole, may, mayActOn } from '@/lib/workspace-authority';

export type MembershipChange = 'changed' | 'unchanged' | 'not_found' | 'owner' | 'agent' | 'rank';

type MemberTarget = { memberId: string } | { userId: string };

async function lockedRanks(tx: Prisma.TransactionClient, actorId: string, workspaceId: string, target: MemberTarget) {
  const userId = 'userId' in target ? target.userId : null;
  const memberId = 'memberId' in target ? target.memberId : null;
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${actorId}, ${userId}) ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "WorkspaceMember" WHERE "workspaceId" = ${workspaceId}
    AND ("userId" IN (${actorId}, ${userId}) OR id = ${memberId}) ORDER BY id FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { id: actorId },
    select: { role: true, workspaceMemberships: { where: { workspaceId, status: true }, select: { role: true } } },
  });
  if (!user) throw new MemberMutationError('User not found', 403);
  const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
  const membership = user.workspaceMemberships[0];
  const level = workspace?.ownerId === actorId ? 'PRIMARY_OWNER' : membership ? levelOfRole(membership.role) : null;
  return { workspace, actor: { userId: actorId, level, platformAdmin: user.role === 'SYSTEM_ADMIN' } } as const;
}

export class MemberMutationError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function switchMemberStatus(actorId: string, workspaceId: string, memberId: string, status: boolean, avatars: boolean) {
  return prisma.$transaction(async tx => {
    const { workspace, actor } = await lockedRanks(tx, actorId, workspaceId, { memberId });
    if (!workspace) throw new MemberMutationError('Workspace not found', 404);
    if (!may(actor, 'members.manage')) throw new MemberMutationError('Only workspace owners and admins can update member status', 403);
    const member = await tx.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
    if (!member) throw new MemberMutationError('Member not found', 404);
    if (member.userId === workspace.ownerId || !mayActOn(actor, { userId: member.userId, level: levelOfRole(member.role) }, { holdsChangeRoles: false })) {
      throw new MemberMutationError('You can only switch on or off members below your own level', 403);
    }
    return tx.workspaceMember.update({
      where: { id: member.id }, data: { status },
      include: { user: { select: {
        id: true, name: true, email: true, useCustomAvatar: avatars, avatarAccessory: avatars,
        avatarBrows: avatars, avatarEyes: avatars, avatarEyewear: avatars, avatarHair: avatars,
        avatarMouth: avatars, avatarNose: avatars, avatarSkinTone: avatars,
      } } },
    });
  });
}

export async function removeMember(actorId: string, workspaceId: string, userId: string) {
  return prisma.$transaction(async tx => {
    const { workspace, actor } = await lockedRanks(tx, actorId, workspaceId, { userId });
    if (!workspace) throw new Error('Workspace not found');
    const leaving = actorId === userId;
    if (leaving && userId === workspace.ownerId) throw new Error('The primary owner cannot leave the workspace');
    if (!leaving && !may(actor, 'members.manage')) throw new Error('Only Owners and Admins can remove other members');
    const member = await tx.workspaceMember.findFirst({ where: { workspaceId, userId, status: true } });
    if (!member) throw new Error('Member not found');
    if (!leaving && (userId === workspace.ownerId || !mayActOn(actor, { userId, level: levelOfRole(member.role) }, { holdsChangeRoles: false }))) {
      throw new Error('You can only remove members below your own level');
    }
    await tx.workspaceMember.delete({ where: { id: member.id } });
    return { success: true };
  });
}

export async function setWorkspaceMembership(input: {
  actorId: string; workspaceId: string; userId: string; active: boolean;
}): Promise<MembershipChange> {
  try {
    return await prisma.$transaction(async tx => {
      const { workspace, actor } = await lockedRanks(tx, input.actorId, input.workspaceId, { userId: input.userId });
      if (!actor.level && !actor.platformAdmin) return 'rank';
      if (!workspace) return 'not_found';
      if (workspace.ownerId === input.userId) return 'owner';
      if (actor.level && !may(actor, 'members.manage')) return 'rank';
      const user = await tx.user.findUnique({ where: { id: input.userId }, select: { email: true } });
      if (!user) return 'not_found';
      if (!user.email) return 'agent';
      const key = { userId: input.userId, workspaceId: input.workspaceId };
      const member = await tx.workspaceMember.findUnique({ where: { userId_workspaceId: key }, select: { status: true, role: true } });
      // The rank rule; someone new joins as a standard role. A platform admin who is not a member keeps the answer this path gave before it.
      const target = { userId: input.userId, level: member ? levelOfRole(member.role) : 'STANDARD' as const };
      if (actor.level !== null && !mayActOn(actor, target, { holdsChangeRoles: false })) return 'rank';
      if (!!member?.status === input.active) return 'unchanged';
      if (input.active) {
        // Someone new to the workspace must be a person the actor already works with; a stranger needs an
        // invitation they accept, and reads the same as an account that does not exist.
        if (!member && !actor.platformAdmin && !await tx.workspace.findFirst({
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
    if (error instanceof MemberMutationError) return 'rank';
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
