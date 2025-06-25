'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export type BoardItemType = 'epic' | 'story' | 'milestone' | 'task';

/**
 * Get comments for a board item (epic, story, milestone, or task)
 */
export async function getBoardItemComments(itemType: BoardItemType, itemId: string) {
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

    // Check if the item exists and get its workspace
    let item;
    
    switch (itemType) {
      case 'epic':
        item = await prisma.epic.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true }
        });
        break;
      case 'story':
        item = await prisma.story.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true }
        });
        break;
      case 'milestone':
        item = await prisma.milestone.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true }
        });
        break;
      case 'task':
        item = await prisma.task.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true }
        });
        break;
      default:
        throw new Error('Invalid item type');
    }
    
    if (!item) {
      throw new Error(`${itemType} not found`);
    }
    
    const workspaceId = item.workspaceId;
    
    // Check if user has access to the workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      },
      select: { id: true }
    });
    
    if (!hasAccess) {
      throw new Error('Access denied');
    }
    
    // Get comments for the item - handle task comments differently
    let comments;
    
    if (itemType === 'task') {
      // Use TaskComment model for tasks
      comments = await prisma.taskComment.findMany({
        where: { taskId: itemId },
        orderBy: { createdAt: 'asc' },
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
    } else {
      // Use Comment model for other board items
      const whereClause = {
        [`${itemType}Id`]: itemId
      };
      
      comments = await prisma.comment.findMany({
        where: whereClause,
        orderBy: { createdAt: 'asc' },
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
    }
    
    return {
      comments,
      currentUserId: user.id
    };
  } catch (error) {
    console.error(`Error getting ${itemType} comments:`, error);
    throw error;
  }
}

/**
 * Add a comment to a board item
 */
export async function addBoardItemComment(
  itemType: BoardItemType, 
  itemId: string, 
  content: string, 
  parentId?: string
) {
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

    // Check if the item exists and get its workspace
    let item;
    
    switch (itemType) {
      case 'epic':
        item = await prisma.epic.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true }
        });
        break;
      case 'story':
        item = await prisma.story.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true }
        });
        break;
      case 'milestone':
        item = await prisma.milestone.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true }
        });
        break;
      case 'task':
        item = await prisma.task.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true }
        });
        break;
      default:
        throw new Error('Invalid item type');
    }
    
    if (!item) {
      throw new Error(`${itemType} not found`);
    }
    
    const workspaceId = item.workspaceId;
    
    // Check if user has access to the workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      },
      select: { id: true }
    });
    
    if (!hasAccess) {
      throw new Error('Access denied');
    }
    
    // If parentId is provided, check if it exists
    if (parentId) {
      if (itemType === 'task') {
        const parentComment = await prisma.taskComment.findFirst({
          where: {
            id: parentId,
            taskId: itemId
          }
        });
        
        if (!parentComment) {
          throw new Error('Parent comment not found');
        }
      } else {
        const parentWhereClause = {
          id: parentId,
          [`${itemType}Id`]: itemId
        };
        
        const parentComment = await prisma.comment.findFirst({
          where: parentWhereClause
        });
        
        if (!parentComment) {
          throw new Error('Parent comment not found');
        }
      }
    }
    
    // Create the comment
    let comment;
    
    if (itemType === 'task') {
      // Use TaskComment model for tasks
      comment = await prisma.taskComment.create({
        data: {
          content,
          taskId: itemId,
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
    } else {
      // Use Comment model for other board items
      const commentData = {
        message: content,
        authorId: user.id,
        parentId: parentId || null,
        [`${itemType}Id`]: itemId
      };
      
      comment = await prisma.comment.create({
        data: commentData,
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
    }
    
    // Revalidate the page
    revalidatePath(`/${itemType}s/${itemId}`);
    
    return comment;
  } catch (error) {
    console.error(`Error adding ${itemType} comment:`, error);
    throw error;
  }
}

/**
 * Toggle like on a board item comment
 */
export async function toggleBoardItemCommentLike(
  itemType: BoardItemType,
  itemId: string, 
  commentId: string
) {
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

    // Check if the comment exists for this item
    let comment;
    
    if (itemType === 'task') {
      comment = await prisma.taskComment.findFirst({
        where: {
          id: commentId,
          taskId: itemId
        }
      });
    } else {
      const whereClause = {
        id: commentId,
        [`${itemType}Id`]: itemId
      };
      
      comment = await prisma.comment.findFirst({
        where: whereClause
      });
    }
    
    if (!comment) {
      throw new Error('Comment not found');
    }
    
    if (itemType === 'task') {
      // Handle TaskComment reactions
      const existingReaction = await prisma.taskCommentReaction.findUnique({
        where: {
          authorId_taskCommentId_type: {
            authorId: user.id,
            taskCommentId: commentId,
            type: 'like'
          }
        }
      });
      
      if (existingReaction) {
        await prisma.taskCommentReaction.delete({
          where: { id: existingReaction.id }
        });
        return { liked: false };
      } else {
        await prisma.taskCommentReaction.create({
          data: {
            taskCommentId: commentId,
            authorId: user.id,
            type: 'like'
          }
        });
        return { liked: true };
      }
    } else {
      // Handle Comment likes
      const existingLike = await prisma.commentLike.findUnique({
        where: {
          commentId_userId: {
            commentId,
            userId: user.id
          }
        }
      });
      
      if (existingLike) {
        await prisma.commentLike.delete({
          where: { id: existingLike.id }
        });
        return { liked: false };
      } else {
        await prisma.commentLike.create({
          data: {
            commentId,
            userId: user.id
          }
        });
        return { liked: true };
      }
    }
  } catch (error) {
    console.error(`Error toggling ${itemType} comment like:`, error);
    throw error;
  }
} 