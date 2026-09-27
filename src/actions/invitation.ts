'use server';

import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/auth';
import { getCurrentUser } from '@/lib/session';
import { readWorkspaceInvitation, acceptWorkspaceInvitation } from '@/lib/workspace-invitations';

/**
 * Get pending workspace invitations for a user
 */
export async function getPendingInvitations(email: string) {
  if (!email) {
    throw new Error('Email is required');
  }

  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.email !== email) {
    throw new Error('Unauthorized');
  }

  const pendingInvitations = await prisma.workspaceInvitation.findMany({
    where: {
      email: currentUser.email,
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
  if (!token) throw new Error('Token is required');
  const result = await readWorkspaceInvitation(token);
  if (result.error) {
    const messages = {
      unauthorized: 'Unauthorized',
      forbidden: 'This invitation is for a different email. Please sign in with the invited account.',
      missing: 'Invitation not found or expired',
      processed: 'This invitation has already been processed.',
      expired: 'Invitation has expired',
    };
    throw new Error(messages[result.error]);
  }
  return result.invitation;
}

/**
 * Accept workspace invitation
 */
export async function acceptInvitation(token: string) {
  try {
    const result = await acceptWorkspaceInvitation(token, false);
    if (result.error) {
      const messages = {
        unauthorized: 'You must be logged in to accept this invitation.',
        missing: 'We could not find this invitation. It may have been withdrawn.',
        processed: 'This invitation has already been processed.',
        expired: 'This invitation has expired.',
        forbidden: 'This invitation is for a different email. Please sign in with the invited account.',
        'already-member': 'You are already a member of this workspace.',
        'inactive-member': 'We couldn’t accept the invitation. Please try again.',
        conflict: 'This invitation changed. Please reload and try again.',
      };
      return { success: false, message: messages[result.error] } as const;
    }
    return {
      success: true,
      workspaceId: result.workspace.id,
      workspaceName: result.workspace.name,
      workspaceSlug: result.workspace.slug,
    };
  } catch (error) {
    console.error('Failed to accept invitation:', error);
    return { success: false, message: 'We couldn’t accept the invitation. Please try again.' } as const;
  }
}
