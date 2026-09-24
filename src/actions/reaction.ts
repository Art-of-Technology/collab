'use server';

import { postAccessWhere, commentAccessWhere } from '@/lib/post-access';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

async function requireReactionAccess(userId: string, postId?: string, commentId?: string) {
  if (commentId) {
    const where = commentAccessWhere(commentId, userId, postId);
    if (!await prisma.comment.findFirst({ where, select: { id: true } })) throw new Error('Comment not found');
    return { comment: where };
  }
  const where = postAccessWhere(postId ?? '', userId);
  if (!await prisma.post.findFirst({ where, select: { id: true } })) throw new Error('Post not found');
  return { post: where };
}

/**
 * Get reactions for a post
 */
export async function getPostReactions(postId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get user ID for checking if the current user has reacted
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
      id: true
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const access = await requireReactionAccess(user.id, postId);

  // Get reactions for the post
  const reactions = await prisma.reaction.findMany({
    where: {
      ...access,
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
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get user ID for checking if the current user has reacted
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
      id: true
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const access = await requireReactionAccess(user.id, undefined, commentId);

  // Get reactions for the comment
  const reactions = await prisma.reaction.findMany({
    where: {
      ...access,
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
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { type, postId, commentId } = data;
  
  // Validate input
  if (!type) {
    throw new Error('Reaction type is required');
  }
  
  if (!postId && !commentId) {
    throw new Error('Either postId or commentId is required');
  }
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const access = await requireReactionAccess(user.id, postId, commentId);

  // Check if the user has already reacted with this type
  const existingReaction = await prisma.reaction.findFirst({
    where: {
      ...access,
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
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { type, postId, commentId } = data;
  
  // Validate input
  if (!type) {
    throw new Error('Reaction type is required');
  }
  
  if (!postId && !commentId) {
    throw new Error('Either postId or commentId is required');
  }
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const access = await requireReactionAccess(user.id, postId, commentId);

  // Find the user's reaction
  const reaction = await prisma.reaction.findFirst({
    where: {
      ...access,
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