'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { NotificationService, NotificationType } from '@/lib/notification-service';
import { sanitizeHtmlToPlainText } from '@/lib/html-sanitizer';
import { extractMentionUserIds } from '@/utils/mentions';

/**
 * Get comments for a task
 */
export async function getTaskComments(taskId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  try {
    // Check if task exists
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { 
        id: true,
        workspaceId: true 
      }
    });
    
    if (!task) {
      throw new Error('Task not found');
    }
    
    // Get the user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email
      },
      select: { id: true }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if user has access to the task's workspace (either as owner or member)
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: task.workspaceId,
        OR: [
          { ownerId: user.id }, // User is the owner
          { members: { some: { userId: user.id } } } // User is a member
        ]
      },
      select: { id: true }
    });
    
    if (!hasAccess) {
      throw new Error('Access denied');
    }
    
    // Get all comments for the task
    const comments = await prisma.taskComment.findMany({
      where: {
        taskId: taskId
      },
      orderBy: {
        createdAt: 'asc'
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
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
        },
        reactions: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
                useCustomAvatar: true
              }
            }
          }
        },
        parent: true
      }
    });
    
    return {
      comments,
      currentUserId: user.id
    };
  } catch (error) {
    console.error('Error getting task comments:', error);
    throw error;
  }
}

/**
 * Add a comment to a task
 */
export async function addTaskComment(taskId: string, content: string, parentId?: string, html?: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  if (!content.trim()) {
    throw new Error('Comment content cannot be empty');
  }
  
  try {
    // Check if task exists
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { 
        id: true,
        workspaceId: true 
      }
    });
    
    if (!task) {
      throw new Error('Task not found');
    }
    
    // Get the user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email
      },
      select: { id: true }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if user has access to the task's workspace (either as owner or member)
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: task.workspaceId,
        OR: [
          { ownerId: user.id }, // User is the owner
          { members: { some: { userId: user.id } } } // User is a member
        ]
      },
      select: { id: true }
    });
    
    if (!hasAccess) {
      throw new Error('Access denied');
    }
    
    // If parentId is provided, check if it exists
    if (parentId) {
      const parentComment = await prisma.taskComment.findFirst({
        where: {
          id: parentId,
          taskId: taskId
        }
      });
      
      if (!parentComment) {
        throw new Error('Parent comment not found');
      }
    }
    
    // Create the comment
    const comment = await prisma.taskComment.create({
      data: {
        content,
        html: html || null,
        taskId,
        authorId: user.id,
        parentId: parentId || null
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
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
        },
        reactions: true
      }
    });
    
    // Process mentions and create mention notifications
    const mentionedUserIds = extractMentionUserIds(html || content);
    const previewBase = sanitizeHtmlToPlainText(html || content);
    
    try {
      // Handle mentions first (includes auto-follow)
      if (mentionedUserIds.length > 0) {
        await NotificationService.createTaskCommentMentionNotifications(
          taskId,
          comment.id,
          mentionedUserIds,
          user.id,
          previewBase
        );
      }

      // Send notifications to task followers (excluding mentioned users to avoid duplicates)
      await NotificationService.notifyTaskFollowers({
        taskId,
        senderId: user.id,
        type: NotificationType.TASK_COMMENT_ADDED,
        content: `New comment added: ${previewBase.substring(0, 100)}${previewBase.length > 100 ? '...' : ''}`,
        excludeUserIds: mentionedUserIds // Exclude mentioned users from general notifications
      });

      // Auto-follow the commenter if they're not already following
      await NotificationService.addTaskFollower(taskId, user.id);
    } catch (error) {
      console.error('Failed to send comment notifications:', error);
      // Don't fail the comment creation if notifications fail
    }
    
    // Revalidate the task page
    revalidatePath(`/${task.workspaceId}/tasks/${taskId}`);
    
    return comment;
  } catch (error) {
    console.error('Error adding task comment:', error);
    throw error;
  }
}

/**
 * Toggle like on a task comment
 */
export async function toggleTaskCommentLike(taskId: string, commentId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  try {
    // Get the user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email
      },
      select: { id: true }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if comment exists and belongs to the task
    const comment = await prisma.taskComment.findFirst({
      where: {
        id: commentId,
        taskId: taskId,
      },
    });
    
    if (!comment) {
      throw new Error('Comment not found');
    }
    
    // Check if user has access to the task's workspace
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { workspaceId: true },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: task.workspaceId,
        OR: [
          { ownerId: user.id }, // User is the owner
          { members: { some: { userId: user.id } } } // User is a member
        ]
      },
      select: { id: true }
    });

    if (!hasAccess) {
      throw new Error('Access denied');
    }
    
    // Check if the user already liked this comment
    const existingReaction = await prisma.taskCommentReaction.findFirst({
      where: {
        taskCommentId: commentId,
        authorId: user.id,
        type: "LIKE"
      },
    });
    
    // If reaction exists, remove it (toggle off)
    if (existingReaction) {
      await prisma.taskCommentReaction.delete({
        where: { id: existingReaction.id },
      });
      
      // Return the updated comment with reactions
      const updatedComment = await prisma.taskComment.findUnique({
        where: { id: commentId },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
              useCustomAvatar: true
            }
          },
          reactions: {
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  useCustomAvatar: true
                }
              }
            }
          }
        }
      });
      
      return {
        status: "removed",
        message: "Like removed",
        comment: updatedComment,
        isLiked: false
      };
    }
    
    // Otherwise, create the reaction (toggle on)
    await prisma.taskCommentReaction.create({
      data: {
        type: "LIKE",
        taskCommentId: commentId,
        authorId: user.id,
      },
    });
    
    // Return the updated comment with reactions
    const updatedComment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            useCustomAvatar: true
          }
        },
        reactions: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
                useCustomAvatar: true
              }
            }
          }
        }
      }
    });
    
    return {
      status: "added",
      message: "Like added",
      comment: updatedComment,
      isLiked: true
    };
  } catch (error) {
    console.error('Error toggling task comment like:', error);
    throw error;
  }
}

/**
 * Get comment likes for a task comment
 */
export async function getTaskCommentLikes(taskId: string, commentId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  try {
    // Get the user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email
      },
      select: { id: true }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Get the likes for this comment
    const likes = await prisma.taskCommentReaction.findMany({
      where: {
        taskCommentId: commentId,
        type: "LIKE"
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            useCustomAvatar: true
          },
        },
      },
    });
    
    // Check if current user has liked this comment
    const userHasLiked = likes.some(like => like.authorId === user.id);
    
    return {
      likes,
      isLiked: userHasLiked,
      currentUserId: user.id
    };
  } catch (error) {
    console.error('Error getting task comment likes:', error);
    throw error;
  }
}

/**
 * Update a comment on a task
 */
export async function updateTaskComment(taskId: string, commentId: string, content: string, html?: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  if (!content.trim()) {
    throw new Error('Comment content cannot be empty');
  }

  try {
    // Get the user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email
      },
      select: { id: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if comment exists and belongs to the task
    const comment = await prisma.taskComment.findFirst({
      where: {
        id: commentId,
        taskId: taskId,
      },
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    // Only the author can edit
    if (comment.authorId !== user.id) {
      throw new Error('You do not have permission to edit this comment');
    }

    // Update the comment
    const updatedComment = await prisma.taskComment.update({
      where: { id: commentId },
      data: { 
        content,
        html: html || null
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
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
        },
        reactions: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
                useCustomAvatar: true
              }
            }
          }
        },
        parent: true
      }
    });

    // Process mentions in updated comment
    const mentionedUserIds = extractMentionUserIds(html || content);
    const previewBase = sanitizeHtmlToPlainText(html || content);
    
    try {
      // Handle mentions (includes auto-follow)
      if (mentionedUserIds.length > 0) {
        await NotificationService.createTaskCommentMentionNotifications(
          taskId,
          commentId,
          mentionedUserIds,
          user.id,
          previewBase
        );
      }
    } catch (error) {
      console.error('Failed to process mentions for updated comment:', error);
      // Don't fail the comment update if mention processing fails
    }

    // Revalidate the task page
    revalidatePath(`/${comment.taskId}/tasks/${taskId}`);

    return updatedComment;
  } catch (error) {
    console.error('Error updating task comment:', error);
    throw error;
  }
} 