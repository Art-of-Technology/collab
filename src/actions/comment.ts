'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

/**
 * Get comments for a post
 */
export async function getComments(postId: string) {
  // First, get all top-level comments (those without a parent)
  const topLevelComments = await prisma.comment.findMany({
    where: {
      postId,
      parentId: null, // Only get comments without a parent
    },
    orderBy: {
      createdAt: 'desc',
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
      reactions: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      },
    },
  });

  // Then, get all replies (comments with a parentId)
  const replies = await prisma.comment.findMany({
    where: {
      postId,
      NOT: {
        parentId: null, // Only get comments with a parent
      },
    },
    orderBy: {
      createdAt: 'asc', // Sort replies chronologically
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
      reactions: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      },
    },
  });

  // Group replies by their parentId for easier assignment
  const repliesByParentId = replies.reduce((acc, reply) => {
    const parentId = reply.parentId as string;
    if (!acc[parentId]) {
      acc[parentId] = [];
    }
    acc[parentId].push(reply);
    return acc;
  }, {} as Record<string, any[]>);

  return {
    topLevelComments,
    repliesByParentId
  };
}

/**
 * Create a new comment
 */
export async function createComment(data: {
  postId: string;
  message: string;
  html?: string;
  parentId?: string | null;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { postId, message, html, parentId } = data;
  
  // Validate input
  if (!message || !message.trim()) {
    throw new Error('Comment message is required');
  }
  
  if (!postId) {
    throw new Error('Post ID is required');
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
  
  // Verify the post exists
  const post = await prisma.post.findUnique({
    where: {
      id: postId
    }
  });
  
  if (!post) {
    throw new Error('Post not found');
  }
  
  // If parentId is provided, verify it exists
  if (parentId) {
    const parentComment = await prisma.comment.findUnique({
      where: {
        id: parentId
      }
    });
    
    if (!parentComment) {
      throw new Error('Parent comment not found');
    }
  }
  
  // Create the comment
  const comment = await prisma.comment.create({
    data: {
      message: message.trim(),
      html: html || null,
      post: {
        connect: {
          id: postId
        }
      },
      author: {
        connect: {
          id: user.id
        }
      },
      parent: parentId
        ? {
            connect: {
              id: parentId
            }
          }
        : undefined
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
        }
      }
    }
  });
  
  return comment;
}

/**
 * Update a comment
 */
export async function updateComment(commentId: string, data: {
  message: string;
  html?: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { message, html } = data;
  
  // Validate input
  if (!message || !message.trim()) {
    throw new Error('Comment message is required');
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
  
  // Verify the comment exists and belongs to the user
  const comment = await prisma.comment.findUnique({
    where: {
      id: commentId
    }
  });
  
  if (!comment) {
    throw new Error('Comment not found');
  }
  
  if (comment.authorId !== user.id) {
    throw new Error('You can only edit your own comments');
  }
  
  // Update the comment
  const updatedComment = await prisma.comment.update({
    where: {
      id: commentId
    },
    data: {
      message: message.trim(),
      html: html || null,
      updatedAt: new Date() // Force update of the timestamp
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
        }
      }
    }
  });
  
  return updatedComment;
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
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
  
  // Verify the comment exists and belongs to the user
  const comment = await prisma.comment.findUnique({
    where: {
      id: commentId
    }
  });
  
  if (!comment) {
    throw new Error('Comment not found');
  }
  
  if (comment.authorId !== user.id) {
    throw new Error('You can only delete your own comments');
  }
  
  // Delete the comment and its replies recursively
  await deleteCommentRecursive(commentId);
  
  return true;
}

/**
 * Recursive helper to delete a comment and all its replies
 */
async function deleteCommentRecursive(commentId: string) {
  // First, get all replies to this comment
  const replies = await prisma.comment.findMany({
    where: {
      parentId: commentId
    },
    select: {
      id: true
    }
  });
  
  // Recursively delete each reply
  for (const reply of replies) {
    await deleteCommentRecursive(reply.id);
  }
  
  // Delete this comment
  await prisma.comment.delete({
    where: {
      id: commentId
    }
  });
} 