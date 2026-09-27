import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export async function readWorkspaceInvitation(token: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'unauthorized' } as const;
  if (!token) return { error: 'missing' } as const;

  const recipient = await prisma.workspaceInvitation.findUnique({
    where: { token }, select: { email: true },
  });
  if (!recipient) return { error: 'missing' } as const;
  if (recipient.email !== user.email) return { error: 'forbidden' } as const;

  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { token, email: user.email },
    include: {
      workspace: true,
      invitedBy: { select: { id: true, name: true, email: true, image: true } },
    },
  });
  if (!invitation) return { error: 'missing' } as const;
  if (invitation.status !== 'pending') return { error: 'processed' } as const;
  if (invitation.expiresAt < new Date()) return { error: 'expired' } as const;
  return { invitation };
}

export async function acceptWorkspaceInvitation(token: string, consumeExistingMembership: boolean) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: 'unauthorized' } as const;
  if (!token) return { error: 'missing' } as const;

  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({
      where: { id: currentUser.id }, select: { id: true, email: true },
    });
    if (!user) return { error: 'unauthorized' } as const;
    const invitation = await tx.workspaceInvitation.findUnique({
      where: { token },
      select: { id: true, token: true, email: true, workspaceId: true, status: true, expiresAt: true },
    });
    if (!invitation) return { error: 'missing' } as const;
    if (invitation.email !== user.email) return { error: 'forbidden' } as const;
    if (invitation.status !== 'pending') return { error: 'processed' } as const;
    if (invitation.expiresAt < new Date()) return { error: 'expired' } as const;

    const membership = await tx.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: invitation.workspaceId } },
    });
    if (membership && !membership.status) return { error: 'inactive-member' } as const;
    if (membership && !consumeExistingMembership) return { error: 'already-member' } as const;

    const claim = await tx.workspaceInvitation.updateMany({
      where: {
        id: invitation.id, token, email: user.email, workspaceId: invitation.workspaceId,
        status: 'pending', expiresAt: { gte: new Date() },
      },
      data: { status: 'accepted' },
    });
    if (claim.count !== 1) return { error: 'conflict' } as const;
    if (membership) return { error: 'already-member' } as const;

    await tx.workspaceMember.create({
      data: { userId: user.id, workspaceId: invitation.workspaceId, role: 'MEMBER' },
    });
    const workspace = await tx.workspace.findUnique({
      where: { id: invitation.workspaceId }, select: { id: true, name: true, slug: true },
    });
    if (!workspace) throw new Error('Invited workspace no longer exists');
    return { workspace };
  }, { isolationLevel: 'Serializable' });
}
