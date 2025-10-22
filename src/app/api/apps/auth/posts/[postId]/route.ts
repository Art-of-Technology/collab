/**
 * Third-Party App API: Individual Post Endpoints
 * GET /api/apps/auth/posts/[postId] - Get specific post details
 * PATCH /api/apps/auth/posts/[postId] - Update specific post
 * DELETE /api/apps/auth/posts/[postId] - Delete specific post
 * 
 * Required scopes:
 * - posts:read for GET
 * - posts:write for PATCH/DELETE
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for updating posts
const UpdatePostSchema = z.object({
  message: z.string().min(1).max(2000).optional(),
  html: z.string().optional(),
  type: z.enum(['UPDATE', 'BLOCKER', 'IDEA', 'QUESTION', 'RESOLVED']).optional(),
  priority: z.enum(['normal', 'high', 'critical']).optional(),
  isPinned: z.boolean().optional(),
});

/**
 * GET /api/apps/auth/posts/[postId]
 * Get specific post details
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ postId: string }> }) => {
    try {
      const { postId } = await params;

      const post = await prisma.post.findFirst({
        where: {
          id: postId,
          workspaceId: context.workspace.id
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          resolvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          pinnedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          comments: {
            where: { parentId: null }, // Only top-level comments
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
          _count: {
            select: {
              comments: true,
              reactions: true,
              bookmarks: true
            }
          }
        }
      });

      if (!post) {
        return NextResponse.json(
          { error: 'post_not_found', error_description: 'Post not found' },
          { status: 404 }
        );
      }

      const response = {
        id: post.id,
        message: post.message,
        html: post.html,
        type: post.type,
        priority: post.priority,
        isAutomated: post.isAutomated,
        isPinned: post.isPinned,
        pinnedAt: post.pinnedAt,
        resolvedAt: post.resolvedAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        author: post.author,
        resolvedBy: post.resolvedBy,
        pinnedBy: post.pinnedByUser,
        comments: post.comments.map(comment => ({
          id: comment.id,
          message: comment.message,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          author: comment.author,
          stats: {
            replyCount: comment._count.children,
            likeCount: comment._count.likes,
            reactionCount: comment._count.reactions
          }
        })),
        stats: {
          commentCount: post._count.comments,
          reactionCount: post._count.reactions,
          bookmarkCount: post._count.bookmarks
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching post:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['posts:read'] }
);

/**
 * PATCH /api/apps/auth/posts/[postId]
 * Update specific post (only author or admin can update)
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ postId: string }> }) => {
    try {
      const { postId } = await params;
      const body = await request.json();
      const updateData = UpdatePostSchema.parse(body);

      // Get existing post
      const existingPost = await prisma.post.findFirst({
        where: {
          id: postId,
          workspaceId: context.workspace.id
        }
      });

      if (!existingPost) {
        return NextResponse.json(
          { error: 'post_not_found', error_description: 'Post not found' },
          { status: 404 }
        );
      }

      // Check permissions
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: context.user.id,
            workspaceId: context.workspace.id
          }
        }
      });

      const isAuthor = existingPost.authorId === context.user.id;
      const isAdmin = membership?.role === 'ADMIN';

      // Only author or admin can update posts
      if (!isAuthor && !isAdmin) {
        return NextResponse.json(
          { error: 'insufficient_permissions', error_description: 'Only post author or admin can update posts' },
          { status: 403 }
        );
      }

      // Prepare update data
      const postUpdateData: any = {};
      
      if (updateData.message !== undefined) {
        postUpdateData.message = updateData.message;
      }

      if (updateData.html !== undefined) {
        postUpdateData.html = updateData.html;
      }

      if (updateData.type !== undefined) {
        postUpdateData.type = updateData.type;
      }

      if (updateData.priority !== undefined) {
        postUpdateData.priority = updateData.priority;
      }

      // Only admin can pin/unpin posts
      if (updateData.isPinned !== undefined) {
        if (!isAdmin) {
          return NextResponse.json(
            { error: 'insufficient_permissions', error_description: 'Admin role required to pin/unpin posts' },
            { status: 403 }
          );
        }
        
        postUpdateData.isPinned = updateData.isPinned;
        if (updateData.isPinned) {
          postUpdateData.pinnedAt = new Date();
          postUpdateData.pinnedBy = context.user.id;
        } else {
          postUpdateData.pinnedAt = null;
          postUpdateData.pinnedBy = null;
        }
      }

      // Update the post
      const updatedPost = await prisma.post.update({
        where: { id: postId },
        data: postUpdateData,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          resolvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          pinnedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          _count: {
            select: {
              comments: true,
              reactions: true,
              bookmarks: true
            }
          }
        }
      });

      const response = {
        id: updatedPost.id,
        message: updatedPost.message,
        html: updatedPost.html,
        type: updatedPost.type,
        priority: updatedPost.priority,
        isAutomated: updatedPost.isAutomated,
        isPinned: updatedPost.isPinned,
        pinnedAt: updatedPost.pinnedAt,
        resolvedAt: updatedPost.resolvedAt,
        createdAt: updatedPost.createdAt,
        updatedAt: updatedPost.updatedAt,
        author: updatedPost.author,
        resolvedBy: updatedPost.resolvedBy,
        pinnedBy: updatedPost.pinnedByUser,
        stats: {
          commentCount: updatedPost._count.comments,
          reactionCount: updatedPost._count.reactions,
          bookmarkCount: updatedPost._count.bookmarks
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

      console.error('Error updating post:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['posts:write'] }
);

/**
 * DELETE /api/apps/auth/posts/[postId]
 * Delete specific post (only author or admin can delete)
 */
export const DELETE = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ postId: string }> }) => {
    try {
      const { postId } = await params;

      // Get existing post
      const existingPost = await prisma.post.findFirst({
        where: {
          id: postId,
          workspaceId: context.workspace.id
        }
      });

      if (!existingPost) {
        return NextResponse.json(
          { error: 'post_not_found', error_description: 'Post not found' },
          { status: 404 }
        );
      }

      // Check permissions
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: context.user.id,
            workspaceId: context.workspace.id
          }
        }
      });

      const isAuthor = existingPost.authorId === context.user.id;
      const isAdmin = membership?.role === 'ADMIN';

      // Only author or admin can delete posts
      if (!isAuthor && !isAdmin) {
        return NextResponse.json(
          { error: 'insufficient_permissions', error_description: 'Only post author or admin can delete posts' },
          { status: 403 }
        );
      }

      // Delete the post (cascade will handle related records)
      await prisma.post.delete({
        where: { id: postId }
      });

      return NextResponse.json({ success: true, message: 'Post deleted successfully' });

    } catch (error) {
      console.error('Error deleting post:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['posts:write'] }
);
