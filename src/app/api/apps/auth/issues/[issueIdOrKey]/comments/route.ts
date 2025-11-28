/**
 * Third-Party App API: Issue Comments Endpoints
 * GET /api/apps/auth/issues/[issueIdOrKey]/comments - List comments with threading
 * POST /api/apps/auth/issues/[issueIdOrKey]/comments - Add comment (supports replies)
 * 
 * Required scopes:
 * - issues:read for GET
 * - issues:write for POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for creating comments
const CreateCommentSchema = z.object({
  content: z.string().min(1).max(10000),
  html: z.string().optional(),
  parentId: z.string().cuid().optional()
});

/**
 * Helper to find issue by ID or key
 */
async function findIssue(issueIdOrKey: string, workspaceId: string) {
  return prisma.issue.findFirst({
    where: {
      OR: [
        { id: issueIdOrKey },
        { issueKey: issueIdOrKey }
      ],
      workspaceId
    }
  });
}

/**
 * Helper to organize comments into tree structure
 */
function organizeCommentsIntoTree(comments: any[]) {
  const commentMap = new Map();
  const rootComments: any[] = [];

  // First pass: create map of all comments
  comments.forEach(comment => {
    commentMap.set(comment.id, { ...comment, replies: [] });
  });

  // Second pass: build tree structure
  comments.forEach(comment => {
    const mappedComment = commentMap.get(comment.id);
    if (comment.parentId && commentMap.has(comment.parentId)) {
      commentMap.get(comment.parentId).replies.push(mappedComment);
    } else {
      rootComments.push(mappedComment);
    }
  });

  return rootComments;
}

/**
 * GET /api/apps/auth/issues/[issueIdOrKey]/comments
 * List comments with threading and reactions
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const { searchParams } = new URL(request.url);
      const flat = searchParams.get('flat') === 'true'; // Option to return flat list
      const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

      // Find the issue
      const issue = await findIssue(issueIdOrKey, context.workspace.id);

      if (!issue) {
        return NextResponse.json(
          { error: 'issue_not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Get comments with author and reactions
      const comments = await prisma.issueComment.findMany({
        where: {
          issueId: issue.id
        },
        take: limit,
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

      // Format comments
      const formattedComments = comments.map(comment => ({
        id: comment.id,
        content: comment.content,
        html: comment.html,
        parentId: comment.parentId,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: comment.author,
        reactions: comment.reactions.map(r => ({
          id: r.id,
          type: r.type,
          author: r.author
        })),
        reactionCounts: comment.reactions.reduce((acc, r) => {
          acc[r.type] = (acc[r.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }));

      // Return as tree or flat list based on query param
      const response = {
        issueId: issue.id,
        issueKey: issue.issueKey,
        comments: flat ? formattedComments : organizeCommentsIntoTree(formattedComments),
        total: comments.length
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching issue comments:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['issues:read'] }
);

/**
 * POST /api/apps/auth/issues/[issueIdOrKey]/comments
 * Add a comment to an issue
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const body = await request.json();
      const commentData = CreateCommentSchema.parse(body);

      // Find the issue
      const issue = await findIssue(issueIdOrKey, context.workspace.id);

      if (!issue) {
        return NextResponse.json(
          { error: 'issue_not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Validate parent comment if provided
      if (commentData.parentId) {
        const parentComment = await prisma.issueComment.findFirst({
          where: {
            id: commentData.parentId,
            issueId: issue.id
          }
        });

        if (!parentComment) {
          return NextResponse.json(
            { error: 'parent_comment_not_found', error_description: 'Parent comment not found' },
            { status: 404 }
          );
        }
      }

      // Create the comment
      const newComment = await prisma.issueComment.create({
        data: {
          content: commentData.content,
          html: commentData.html,
          issueId: issue.id,
          authorId: context.user.id,
          parentId: commentData.parentId || null
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        }
      });

      // Create activity record
      await prisma.boardItemActivity.create({
        data: {
          action: 'COMMENT_ADDED',
          itemType: 'ISSUE',
          itemId: issue.id,
          userId: context.user.id,
          workspaceId: context.workspace.id,
          details: JSON.stringify({
            commentId: newComment.id,
            isReply: !!commentData.parentId
          })
        }
      });

      const response = {
        id: newComment.id,
        content: newComment.content,
        html: newComment.html,
        parentId: newComment.parentId,
        createdAt: newComment.createdAt,
        updatedAt: newComment.updatedAt,
        author: newComment.author,
        issue: {
          id: issue.id,
          issueKey: issue.issueKey
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
  { requiredScopes: ['issues:write'] }
);


