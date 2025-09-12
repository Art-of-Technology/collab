'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Toggle like on an issue comment
 */
export async function toggleIssueCommentLike(issueId: string, commentId: string) {
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

    // Resolve issue by key or id
    const isIssueKey = /^[A-Z]+[0-9]*-\d+$/.test(issueId);
    const issue = isIssueKey
      ? await prisma.issue.findFirst({ where: { issueKey: issueId }, select: { id: true, workspaceId: true } })
      : await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true, workspaceId: true } });

    if (!issue) {
      throw new Error('Issue not found');
    }

    // Check if comment exists and belongs to the issue
    const comment = await prisma.issueComment.findFirst({
      where: {
        id: commentId,
        issueId: issue.id,
      },
    });
    
    if (!comment) {
      throw new Error('Comment not found');
    }

    // Access check: user must be in workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: issue.workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
    });

    if (!hasAccess) {
      throw new Error('Access denied');
    }
    
    // Check if the user already liked this comment
    const existingReaction = await prisma.issueCommentReaction.findFirst({
      where: {
        commentId,
        authorId: user.id,
        type: "like"
      },
    });
    
    let status: 'added' | 'removed';
    
    // If reaction exists, remove it (toggle off)
    if (existingReaction) {
      await prisma.issueCommentReaction.delete({
        where: { id: existingReaction.id },
      });
      status = 'removed';
    } else {
      // Otherwise, create the reaction (toggle on)
      await prisma.issueCommentReaction.create({
        data: {
          type: "like",
          commentId,
          authorId: user.id,
        },
      });
      status = 'added';
    }
    
    // Get the updated comment with reactions
    const updatedComment = await prisma.issueComment.findUnique({
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
                image: true
              }
            }
          }
        }
      }
    });

    // Revalidate the issue page
    revalidatePath(`/issues/${issueId}`);
    
    return {
      status,
      comment: updatedComment
    };

  } catch (error) {
    console.error('Issue comment like error:', error);
    throw error;
  }
}

/**
 * Update an issue comment
 */
export async function updateIssueComment(issueId: string, commentId: string, data: {
  content: string;
  html?: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { content, html } = data;
  
  // Validate input
  if (!content || !content.trim()) {
    throw new Error('Comment content is required');
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

    // Resolve issue by key or id
    const isIssueKey = /^[A-Z]+[0-9]*-\d+$/.test(issueId);
    const issue = isIssueKey
      ? await prisma.issue.findFirst({ where: { issueKey: issueId }, select: { id: true, workspaceId: true } })
      : await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true, workspaceId: true } });

    if (!issue) {
      throw new Error('Issue not found');
    }

    // Check if comment exists, belongs to the issue, and is owned by the current user
    const comment = await prisma.issueComment.findFirst({
      where: {
        id: commentId,
        issueId: issue.id,
      },
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.authorId !== user.id) {
      throw new Error('You can only edit your own comments');
    }

    // Access check: user must be in workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: issue.workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
    });

    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const updatedComment = await prisma.issueComment.update({
      where: { id: commentId },
      data: {
        content: content.trim(),
        html: html || null,
      },
      include: {
        author: { select: { id: true, name: true, image: true, useCustomAvatar: true } },
        reactions: {
          include: {
            author: { select: { id: true, name: true, image: true } }
          }
        },
      },
    });

    // Revalidate the issue page
    revalidatePath(`/issues/${issueId}`);
    
    return updatedComment;

  } catch (error) {
    console.error('Issue comment update error:', error);
    throw error;
  }
}

/**
 * Delete an issue comment
 */
export async function deleteIssueComment(issueId: string, commentId: string) {
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

    // Resolve issue by key or id
    const isIssueKey = /^[A-Z]+[0-9]*-\d+$/.test(issueId);
    const issue = isIssueKey
      ? await prisma.issue.findFirst({ where: { issueKey: issueId }, select: { id: true, workspaceId: true } })
      : await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true, workspaceId: true } });

    if (!issue) {
      throw new Error('Issue not found');
    }

    // Check if comment exists, belongs to the issue, and is owned by the current user
    const comment = await prisma.issueComment.findFirst({
      where: {
        id: commentId,
        issueId: issue.id,
      },
      include: {
        replies: true, // Include replies to check if comment has children
      },
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.authorId !== user.id) {
      throw new Error('You can only delete your own comments');
    }

    // Access check: user must be in workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: issue.workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
    });

    if (!hasAccess) {
      throw new Error('Access denied');
    }

    let result;

    // If comment has replies, just mark it as deleted but keep the structure
    if (comment.replies && comment.replies.length > 0) {
      const deletedComment = await prisma.issueComment.update({
        where: { id: commentId },
        data: {
          content: "[deleted]",
          html: null,
        },
        include: {
          author: { select: { id: true, name: true, image: true, useCustomAvatar: true } },
          reactions: {
            include: {
              author: { select: { id: true, name: true, image: true } }
            }
          },
        },
      });

      result = {
        type: 'marked_deleted' as const,
        comment: deletedComment
      };
    } else {
      // If no replies, completely delete the comment
      await prisma.issueComment.delete({
        where: { id: commentId },
      });

      result = {
        type: 'deleted' as const,
        deletedId: commentId
      };
    }

    // Revalidate the issue page
    revalidatePath(`/issues/${issueId}`);
    
    return result;

  } catch (error) {
    console.error('Issue comment delete error:', error);
    throw error;
  }
}
