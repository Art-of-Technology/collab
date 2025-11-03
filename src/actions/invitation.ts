'use server';

import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/auth';

/**
 * Get pending workspace invitations for a user
 */
export async function getPendingInvitations(email: string) {
  if (!email) {
    throw new Error('Email is required');
  }

  const pendingInvitations = await prisma.workspaceInvitation.findMany({
    where: {
      email,
      status: "pending",
      expiresAt: {
        gte: new Date()
      }
    },
    include: {
      workspace: true,
      invitedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return pendingInvitations;
}

/**
 * Check if a user has any workspaces
 */
export async function checkUserHasWorkspaces() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const count = await prisma.workspaceMember.count({
    where: {
      userId: session.user.id,
      status: true
    }
  });

  // Check if user is an owner of any workspace
  const ownedCount = await prisma.workspace.count({
    where: {
      ownerId: session.user.id
    }
  });

  return (count > 0 || ownedCount > 0);
}

/**
 * Get workspace invitation by token
 */
export async function getInvitationByToken(token: string) {
  if (!token) {
    throw new Error('Token is required');
  }

  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { token },
    include: {
      workspace: true,
      invitedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        }
      }
    }
  });

  if (!invitation) {
    throw new Error('Invitation not found or expired');
  }

  // Check if invitation has expired
  if (invitation.expiresAt < new Date()) {
    throw new Error('Invitation has expired');
  }

  return invitation;
}

/**
 * Accept workspace invitation
 */
export async function acceptInvitation(token: string) {
  const session = await getAuthSession();

  if (!session?.user) {
    throw new Error('You must be logged in to accept an invitation');
  }

  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { token },
    include: { workspace: true }
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.status !== 'pending') {
    throw new Error('This invitation has already been processed');
  }

  if (invitation.expiresAt < new Date()) {
    throw new Error('This invitation has expired');
  }

  if (invitation.email !== session.user.email) {
    throw new Error('This invitation was not sent to your email address');
  }

  // Check if user is already a member of the workspace
  const existingMember = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: invitation.workspaceId,
      status: true,
      user: {
        email: session.user.email
      }
    }
  });

  if (existingMember) {
    throw new Error('You are already a member of this workspace');
  }

  await prisma.$transaction(async (tx) => {
    // Create workspace member
    await tx.workspaceMember.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId: session.user.id,
        role: 'MEMBER'
      }
    });

    // Update invitation status
    await tx.workspaceInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'accepted'
      }
    });
  });

  return {
    success: true,
    workspaceId: invitation.workspaceId,
    workspaceName: invitation.workspace.name,
    workspaceSlug: invitation.workspace.slug
  };
} 