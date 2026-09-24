'use server';

import { requirePostAccess, requireCommentAccess } from '@/lib/post-access';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/request-session';

/**
 * Get reactions for a post
 */
export async function getPostReactions(postId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await requirePostAccess(postId);
  
  // Get user ID for checking if the current user has reacted
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
    },
    select: {
      id: true
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Get reactions for the post
  const reactions = await prisma.reaction.findMany({
    where: {
      postId,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        },
      },
    },
  });
  
  // Check if the current user has reacted to this post
  const hasReacted = reactions.some(reaction => reaction.authorId === user.id);
  
  // Group reactions by type
  const reactionsByType = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.type]) {
      acc[reaction.type] = [];
    }
    acc[reaction.type].push(reaction);
    return acc;
  }, {} as Record<string, any[]>);
  
  return {
    reactions,
    reactionsByType,
    hasReacted,
  };
}

/**
 * Get reactions for a comment
 */
export async function getCommentReactions(commentId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await requireCommentAccess(commentId);
  
  // Get user ID for checking if the current user has reacted
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
    },
    select: {
      id: true
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Get reactions for the comment
  const reactions = await prisma.reaction.findMany({
    where: {
      commentId,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });
  
  // Check if the current user has reacted to this comment
  const hasReacted = reactions.some(reaction => reaction.authorId === user.id);
  
  return {
    reactions,
    hasReacted,
  };
}

/**
 * Add a reaction to a post or comment
 */
export async function addReaction(data: {
  type: string;
  postId?: string;
  commentId?: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  const { type, postId, commentId } = data;
  
  // Validate input
  if (!type) {
    throw new Error('Reaction type is required');
  }
  
  if (Boolean(postId) === Boolean(commentId)) {
    throw new Error('Exactly one of postId or commentId is required');
  }

  if (postId) await requirePostAccess(postId);
  else await requireCommentAccess(commentId!);
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Check if the user has already reacted with this type
  const existingReaction = await prisma.reaction.findFirst({
    where: {
      authorId: user.id,
      postId,
      commentId,
      type,
    },
  });
  
  // If the user already reacted, return the existing reaction
  if (existingReaction) {
    return existingReaction;
  }
  
  // Create the reaction
  const reaction = await prisma.reaction.create({
    data: {
      type,
      author: {
        connect: {
          id: user.id,
        },
      },
      ...(postId
        ? {
            post: {
              connect: {
                id: postId,
              },
            },
          }
        : {}),
      ...(commentId
        ? {
            comment: {
              connect: {
                id: commentId,
              },
            },
          }
        : {}),
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });
  
  return reaction;
}

/**
 * Remove a reaction from a post or comment
 */
export async function removeReaction(data: {
  type: string;
  postId?: string;
  commentId?: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  const { type, postId, commentId } = data;
  
  // Validate input
  if (!type) {
    throw new Error('Reaction type is required');
  }
  
  if (Boolean(postId) === Boolean(commentId)) {
    throw new Error('Exactly one of postId or commentId is required');
  }

  if (postId) await requirePostAccess(postId);
  else await requireCommentAccess(commentId!);
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Find the user's reaction
  const reaction = await prisma.reaction.findFirst({
    where: {
      authorId: user.id,
      postId,
      commentId,
      type,
    },
  });
  
  if (!reaction) {
    throw new Error('Reaction not found');
  }
  
  // Delete the reaction
  await prisma.reaction.delete({
    where: {
      id: reaction.id,
    },
  });
  
  return { success: true };
} 