/**
 * Third-Party App API: Comments Endpoints
 * GET /api/apps/auth/comments - List comments with filtering by postId, parentId, search
 * POST /api/apps/auth/comments - Create new comment on post or as reply
 * 
 * Required scopes:
 * - comments:read for GET
 * - comments:write for POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for creating new comments
const CreateCommentSchema = z.object({
  message: z.string().min(1).max(2000),
  html: z.string().optional(),
  postId: z.string().cuid().optional(),
  parentId: z.string().cuid().optional(),
  // Support for other comment types
  epicId: z.string().cuid().optional(),
  storyId: z.string().cuid().optional(),
  milestoneId: z.string().cuid().optional(),
}).refine(
  (data) => {
    // At least one target must be specified
    const targets = [data.postId, data.epicId, data.storyId, data.milestoneId];
    return targets.some(target => target !== undefined);
  },
  {
    message: "At least one target (postId, epicId, storyId, or milestoneId) must be specified"
  }
);

/**
 * GET /api/apps/auth/comments
 * List comments with filtering and pagination
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const postId = searchParams.get('postId');
      const parentId = searchParams.get('parentId');
      const epicId = searchParams.get('epicId');
      const storyId = searchParams.get('storyId');
      const milestoneId = searchParams.get('milestoneId');
      const search = searchParams.get('search');

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};

      // Filter by target entity
      if (postId) {
        where.postId = postId;
        // Verify post belongs to workspace
        const post = await prisma.post.findFirst({
          where: { id: postId, workspaceId: context.workspace.id }
        });
        if (!post) {
          return NextResponse.json(
            { error: 'post_not_found', error_description: 'Post not found or access denied' },
            { status: 404 }
          );
        }
      }

      if (parentId) {
        where.parentId = parentId;
      }


      if (epicId) {
        where.epicId = epicId;
        // Verify epic belongs to workspace
        const epic = await prisma.epic.findFirst({
          where: { id: epicId, workspaceId: context.workspace.id }
        });
        if (!epic) {
          return NextResponse.json(
            { error: 'epic_not_found', error_description: 'Epic not found or access denied' },
            { status: 404 }
          );
        }
      }

      if (storyId) {
        where.storyId = storyId;
        // Verify story belongs to workspace
        const story = await prisma.story.findFirst({
          where: { id: storyId, workspaceId: context.workspace.id }
        });
        if (!story) {
          return NextResponse.json(
            { error: 'story_not_found', error_description: 'Story not found or access denied' },
            { status: 404 }
          );
        }
      }

      if (milestoneId) {
        where.milestoneId = milestoneId;
        // Verify milestone belongs to workspace
        const milestone = await prisma.milestone.findFirst({
          where: { id: milestoneId, workspaceId: context.workspace.id }
        });
        if (!milestone) {
          return NextResponse.json(
            { error: 'milestone_not_found', error_description: 'Milestone not found or access denied' },
            { status: 404 }
          );
        }
      }

      if (search) {
        where.OR = [
          { message: { contains: search, mode: 'insensitive' } },
          { html: { contains: search, mode: 'insensitive' } }
        ];
      }

      // If no specific target is provided, we need to ensure we only get comments
      // from entities that belong to the current workspace
      if (!postId && !epicId && !storyId && !milestoneId) {
        where.OR = [
          {
            post: {
              workspaceId: context.workspace.id
            }
          },
          {
            epic: {
              workspaceId: context.workspace.id
            }
          },
          {
            story: {
              workspaceId: context.workspace.id
            }
          },
          {
            milestone: {
              workspaceId: context.workspace.id
            }
          }
        ];
      }

      // Get comments with related data
      const [comments, total] = await Promise.all([
        prisma.comment.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
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
        }),
        prisma.comment.count({ where })
      ]);

      const response = {
        comments: comments.map(comment => ({
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
          stats: {
            replyCount: comment._count.children,
            likeCount: comment._count.likes,
            reactionCount: comment._count.reactions
          }
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching comments:', error);
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
 * POST /api/apps/auth/comments
 * Create a new comment
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const commentData = CreateCommentSchema.parse(body);

      // Validate target entity exists and belongs to workspace
      if (commentData.postId) {
        const post = await prisma.post.findFirst({
          where: { id: commentData.postId, workspaceId: context.workspace.id }
        });
        if (!post) {
          return NextResponse.json(
            { error: 'post_not_found', error_description: 'Post not found or access denied' },
            { status: 404 }
          );
        }
      }


      if (commentData.epicId) {
        const epic = await prisma.epic.findFirst({
          where: { id: commentData.epicId, workspaceId: context.workspace.id }
        });
        if (!epic) {
          return NextResponse.json(
            { error: 'epic_not_found', error_description: 'Epic not found or access denied' },
            { status: 404 }
          );
        }
      }

      if (commentData.storyId) {
        const story = await prisma.story.findFirst({
          where: { id: commentData.storyId, workspaceId: context.workspace.id }
        });
        if (!story) {
          return NextResponse.json(
            { error: 'story_not_found', error_description: 'Story not found or access denied' },
            { status: 404 }
          );
        }
      }

      if (commentData.milestoneId) {
        const milestone = await prisma.milestone.findFirst({
          where: { id: commentData.milestoneId, workspaceId: context.workspace.id }
        });
        if (!milestone) {
          return NextResponse.json(
            { error: 'milestone_not_found', error_description: 'Milestone not found or access denied' },
            { status: 404 }
          );
        }
      }

      // Validate parent comment if specified
      if (commentData.parentId) {
        const parentComment = await prisma.comment.findUnique({
          where: { id: commentData.parentId },
          include: {
            post: true,
            epic: true,
            story: true,
            milestone: true
          }
        });

        if (!parentComment) {
          return NextResponse.json(
            { error: 'parent_comment_not_found', error_description: 'Parent comment not found' },
            { status: 404 }
          );
        }

        // Verify parent comment belongs to same workspace
        const parentWorkspaceId = 
          parentComment.post?.workspaceId ||
          parentComment.epic?.workspaceId ||
          parentComment.story?.workspaceId ||
          parentComment.milestone?.workspaceId;

        if (parentWorkspaceId !== context.workspace.id) {
          return NextResponse.json(
            { error: 'parent_comment_access_denied', error_description: 'Parent comment access denied' },
            { status: 403 }
          );
        }
      }

      // Create the comment
      const newComment = await prisma.comment.create({
        data: {
          message: commentData.message,
          html: commentData.html,
          authorId: context.user.id,
          postId: commentData.postId,
          parentId: commentData.parentId,
          epicId: commentData.epicId,
          storyId: commentData.storyId,
          milestoneId: commentData.milestoneId
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
        id: newComment.id,
        message: newComment.message,
        html: newComment.html,
        postId: newComment.postId,
        parentId: newComment.parentId,
        epicId: newComment.epicId,
        storyId: newComment.storyId,
        milestoneId: newComment.milestoneId,
        createdAt: newComment.createdAt,
        updatedAt: newComment.updatedAt,
        author: newComment.author,
        parent: newComment.parent,
        stats: {
          replyCount: newComment._count.children,
          likeCount: newComment._count.likes,
          reactionCount: newComment._count.reactions
        }
      };

      return NextResponse.json(response, { status: 201 });

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

      console.error('Error creating comment:', error);
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
