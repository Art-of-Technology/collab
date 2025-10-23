/**
 * Third-Party App API: Posts Endpoints
 * GET /api/apps/auth/posts - List posts with filtering by type, priority, status, search
 * POST /api/apps/auth/posts - Create new post with message, type, priority
 * 
 * Required scopes:
 * - posts:read for GET
 * - posts:write for POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for creating new posts
const CreatePostSchema = z.object({
  message: z.string().min(1).max(2000),
  type: z.enum(['UPDATE', 'BLOCKER', 'IDEA', 'QUESTION', 'RESOLVED']).default('UPDATE'),
  priority: z.enum(['normal', 'high', 'critical']).default('normal'),
  html: z.string().optional(),
  isAutomated: z.boolean().default(false),
});

/**
 * GET /api/apps/auth/posts
 * List posts with filtering and pagination
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const type = searchParams.get('type');
      const priority = searchParams.get('priority');
      const resolved = searchParams.get('resolved'); // 'true', 'false', or null for all
      const pinned = searchParams.get('pinned'); // 'true', 'false', or null for all
      const search = searchParams.get('search');

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id
      };

      if (type && ['UPDATE', 'BLOCKER', 'IDEA', 'QUESTION', 'RESOLVED'].includes(type)) {
        where.type = type;
      }

      if (priority && ['normal', 'high', 'critical'].includes(priority)) {
        where.priority = priority;
      }

      if (resolved === 'true') {
        where.resolvedAt = { not: null };
      } else if (resolved === 'false') {
        where.resolvedAt = null;
      }

      if (pinned === 'true') {
        where.isPinned = true;
      } else if (pinned === 'false') {
        where.isPinned = false;
      }

      if (search) {
        where.OR = [
          { message: { contains: search, mode: 'insensitive' } },
          { html: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Get posts with related data
      const [posts, total] = await Promise.all([
        prisma.post.findMany({
          where,
          skip,
          take: limit,
          orderBy: [
            { isPinned: 'desc' }, // Pinned posts first
            { createdAt: 'desc' }
          ],
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
        }),
        prisma.post.count({ where })
      ]);

      const response = {
        posts: posts.map(post => ({
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
          stats: {
            commentCount: post._count.comments,
            reactionCount: post._count.reactions,
            bookmarkCount: post._count.bookmarks
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
      console.error('Error fetching posts:', error);
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
 * POST /api/apps/auth/posts
 * Create a new post
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const postData = CreatePostSchema.parse(body);

      // Create the post
      const newPost = await prisma.post.create({
        data: {
          message: postData.message,
          html: postData.html,
          type: postData.type,
          priority: postData.priority,
          isAutomated: postData.isAutomated,
          authorId: context.user.id,
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
        id: newPost.id,
        message: newPost.message,
        html: newPost.html,
        type: newPost.type,
        priority: newPost.priority,
        isAutomated: newPost.isAutomated,
        isPinned: newPost.isPinned,
        pinnedAt: newPost.pinnedAt,
        resolvedAt: newPost.resolvedAt,
        createdAt: newPost.createdAt,
        updatedAt: newPost.updatedAt,
        author: newPost.author,
        stats: {
          commentCount: newPost._count.comments,
          reactionCount: newPost._count.reactions,
          bookmarkCount: newPost._count.bookmarks
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

      console.error('Error creating post:', error);
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
