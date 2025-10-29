/**
 * Third-Party App API: Individual Comment Endpoints
 * GET /api/apps/auth/comments/[commentId] - Get specific comment details
 * PATCH /api/apps/auth/comments/[commentId] - Update specific comment
 * DELETE /api/apps/auth/comments/[commentId] - Delete specific comment
 * 
 * Required scopes:
 * - comments:read for GET
 * - comments:write for PATCH/DELETE
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for updating comments
const UpdateCommentSchema = z.object({
  message: z.string().min(1).max(2000).optional(),
  html: z.string().optional(),
});

/**
 * GET /api/apps/auth/comments/[commentId]
 * Get specific comment details with replies
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ commentId: string }> }) => {
    try {
      const { commentId } = await params;

      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          parent: {
            select: {
              id: true,
              message: true,
              authorId: true,
              author: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true
                }
              }
            }
          },
          children: {
            orderBy: { createdAt: 'asc' },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true
                }
              },
              _count: {
                select: {
                  children: true,
                  likes: true,
                  reactions: true
                }
              }
            }
          },
          post: {
            select: {
              id: true,
              workspaceId: true
            }
          },
          epic: {
            select: {
              id: true,
              workspaceId: true
            }
          },
          story: {
            select: {
              id: true,
              workspaceId: true
            }
          },
          milestone: {
            select: {
              id: true,
              workspaceId: true
            }
          },
          _count: {
            select: {
              children: true,
              likes: true,
              reactions: true
            }
          }
        }
      });

      if (!comment) {
        return NextResponse.json(
          { error: 'comment_not_found', error_description: 'Comment not found' },
          { status: 404 }
        );
      }

      // Verify comment belongs to current workspace
      const commentWorkspaceId = 
        comment.post?.workspaceId ||
        comment.epic?.workspaceId ||
        comment.story?.workspaceId ||
        comment.milestone?.workspaceId;

      if (commentWorkspaceId !== context.workspace.id) {
        return NextResponse.json(
          { error: 'comment_not_found', error_description: 'Comment not found' },
          { status: 404 }
        );
      }

      const response = {
        id: comment.id,
        message: comment.message,
        html: comment.html,
        postId: comment.postId,
        parentId: comment.parentId,
        epicId: comment.epicId,
        storyId: comment.storyId,
        milestoneId: comment.milestoneId,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: comment.author,
        parent: comment.parent,
        replies: comment.children.map(reply => ({
          id: reply.id,
          message: reply.message,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
          author: reply.author,
          stats: {
            replyCount: reply._count.children,
            likeCount: reply._count.likes,
            reactionCount: reply._count.reactions
          }
        })),
        stats: {
          replyCount: comment._count.children,
          likeCount: comment._count.likes,
          reactionCount: comment._count.reactions
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching comment:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['comments:read'] }
);

/**
 * PATCH /api/apps/auth/comments/[commentId]
 * Update specific comment (only author can update)
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ commentId: string }> }) => {
    try {
      const { commentId } = await params;
      const body = await request.json();
      const updateData = UpdateCommentSchema.parse(body);

      // Get existing comment
      const existingComment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: {
          post: {
            select: {
              id: true,
              workspaceId: true
            }
          },
          epic: {
            select: {
              id: true,
              workspaceId: true
            }
          },
          story: {
            select: {
              id: true,
              workspaceId: true
            }
          },
          milestone: {
            select: {
              id: true,
              workspaceId: true
            }
          }
        }
      });

      if (!existingComment) {
        return NextResponse.json(
          { error: 'comment_not_found', error_description: 'Comment not found' },
          { status: 404 }
        );
      }

      // Verify comment belongs to current workspace
      const commentWorkspaceId = 
        existingComment.post?.workspaceId ||
        existingComment.epic?.workspaceId ||
        existingComment.story?.workspaceId ||
        existingComment.milestone?.workspaceId;

      if (commentWorkspaceId !== context.workspace.id) {
        return NextResponse.json(
          { error: 'comment_not_found', error_description: 'Comment not found' },
          { status: 404 }
        );
      }

      // Check permissions - only author can update comments
      if (existingComment.authorId !== context.user.id) {
        return NextResponse.json(
          { error: 'insufficient_permissions', error_description: 'Only comment author can update comments' },
          { status: 403 }
        );
      }

      // Prepare update data
      const commentUpdateData: any = {};
      
      if (updateData.message !== undefined) {
        commentUpdateData.message = updateData.message;
      }

      if (updateData.html !== undefined) {
        commentUpdateData.html = updateData.html;
      }

      // Update the comment
      const updatedComment = await prisma.comment.update({
        where: { id: commentId },
        data: commentUpdateData,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          parent: {
            select: {
              id: true,
              message: true,
              authorId: true
            }
          },
          _count: {
            select: {
              children: true,
              likes: true,
              reactions: true
            }
          }
        }
      });

      const response = {
        id: updatedComment.id,
        message: updatedComment.message,
        html: updatedComment.html,
        postId: updatedComment.postId,
        parentId: updatedComment.parentId,
        featureRequestId: updatedComment.featureRequestId,
        epicId: updatedComment.epicId,
        storyId: updatedComment.storyId,
        milestoneId: updatedComment.milestoneId,
        createdAt: updatedComment.createdAt,
        updatedAt: updatedComment.updatedAt,
        author: updatedComment.author,
        parent: updatedComment.parent,
        stats: {
          replyCount: updatedComment._count.children,
          likeCount: updatedComment._count.likes,
          reactionCount: updatedComment._count.reactions
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'validation_error', 
            error_description: 'Invalid request data',
            details: error.errors
          },
          { status: 400 }
        );
      }

      console.error('Error updating comment:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['comments:write'] }
);

/**
 * DELETE /api/apps/auth/comments/[commentId]
 * Delete specific comment (only author can delete)
 */
export const DELETE = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ commentId: string }> }) => {
    try {
      const { commentId } = await params;

      // Get existing comment
      const existingComment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: {
          post: {
            select: {
              id: true,
              workspaceId: true
            }
          },
          epic: {
            select: {
              id: true,
              workspaceId: true
            }
          },
          story: {
            select: {
              id: true,
              workspaceId: true
            }
          },
          milestone: {
            select: {
              id: true,
              workspaceId: true
            }
          }
        }
      });

      if (!existingComment) {
        return NextResponse.json(
          { error: 'comment_not_found', error_description: 'Comment not found' },
          { status: 404 }
        );
      }

      // Verify comment belongs to current workspace
      const commentWorkspaceId = 
        existingComment.post?.workspaceId ||
        existingComment.epic?.workspaceId ||
        existingComment.story?.workspaceId ||
        existingComment.milestone?.workspaceId;

      if (commentWorkspaceId !== context.workspace.id) {
        return NextResponse.json(
          { error: 'comment_not_found', error_description: 'Comment not found' },
          { status: 404 }
        );
      }

      // Check permissions - only author can delete comments
      if (existingComment.authorId !== context.user.id) {
        return NextResponse.json(
          { error: 'insufficient_permissions', error_description: 'Only comment author can delete comments' },
          { status: 403 }
        );
      }

      // Delete the comment (cascade will handle related records)
      await prisma.comment.delete({
        where: { id: commentId }
      });

      return NextResponse.json({ success: true, message: 'Comment deleted successfully' });

    } catch (error) {
      console.error('Error deleting comment:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['comments:write'] }
);
