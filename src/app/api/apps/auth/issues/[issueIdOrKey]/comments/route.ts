import { publishEvent } from '@/lib/redis';
import { ForgeProjectWriteError, assertLegacyIssueWriteAllowed } from '@/lib/forge/legacy-write-guard';
/**
 * Third-Party App API: Issue Comments Endpoints
 * GET /api/apps/auth/issues/:issueIdOrKey/comments - List comments
 * POST /api/apps/auth/issues/:issueIdOrKey/comments - Add comment
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { tokenIssueReadWhere } from '@/lib/issue-finder';
import { HandoffError, seatFor, seatWriteGuard } from '@/lib/agent-seats';
import { ACK_TYPE, commentAcks, recordCommentAcks, type AckComment, type CommentAck } from '@/lib/issue-comment-acks';
import { z } from 'zod';

const CreateCommentSchema = z.object({
  content: z.string().min(1),
  parentId: z.string().cuid().optional(),
});

// The issue read rule: an issue the token's account may not read is not found.
async function findIssue(issueIdOrKey: string, context: AppAuthContext) {
  return prisma.issue.findFirst({
    where: {
      ...tokenIssueReadWhere(context),
      OR: [
        { id: issueIdOrKey },
        { issueKey: issueIdOrKey },
      ],
    },
  });
}

/**
 * GET /api/apps/auth/issues/:issueIdOrKey/comments
 * Get comments for an issue
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const { searchParams } = new URL(request.url);
      const flat = searchParams.get('flat') === 'true' || searchParams.has('since');
      // Only comments made after this moment: what `collab comments wait` asks for.
      const since = searchParams.has('since') ? new Date(searchParams.get('since')!) : null;
      if (since && Number.isNaN(since.getTime())) {
        return NextResponse.json({ error: 'invalid_request', error_description: 'since is a time in ISO 8601.' }, { status: 400 });
      }

      const issue = await findIssue(issueIdOrKey, context);
      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      const comments = await prisma.issueComment.findMany({
        where: {
          issueId: issue.id,
          ...(flat ? {} : { parentId: null }), // Only top-level if not flat
          ...(since && { createdAt: { gt: since } }),
        },
        orderBy: { createdAt: 'asc' },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
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
          ...(!flat && {
            replies: {
              orderBy: { createdAt: 'asc' },
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
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
            },
          }),
        },
      });

      // Every comment the answer carries, replies included, once.
      const flatten = (list: any[]): any[] => list.flatMap(comment => [comment, ...flatten(comment.replies ?? [])]);
      const returned = new Map<string, any>(flatten(comments).map(comment => [comment.id, comment]));
      const asAck = (comment: any): AckComment => ({ ...comment, authorId: comment.author?.id });
      let acks = new Map<string, CommentAck>();
      // A seat that reads the comments with a run open on the issue has taken them in: write that first, so the state
      // this answer carries already shows it. A failed write still leaves the state to be read.
      let written = 0;
      try {
        if (returned.size && await seatFor(prisma, context) && await prisma.agentRun.findFirst({ where: { issueId: issue.id, userId: context.user.id, endedAt: null }, select: { id: true } })) {
          written = await recordCommentAcks({ workspaceId: context.workspace.id, issueId: issue.id, seatUserId: context.user.id, commentIds: [...returned.keys()] });
        }
      } catch { /* the list is answered */ }
      try {
        const fresh = written ? await prisma.issueCommentReaction.findMany({ where: { commentId: { in: [...returned.keys()] }, type: ACK_TYPE },
          select: { commentId: true, type: true, authorId: true, createdAt: true, author: { select: { id: true, name: true } } } }) : [];
        acks = await commentAcks(issue.id, [...returned.values()].map(comment => {
          const have = new Set((comment.reactions ?? []).filter((reaction: any) => reaction.type === ACK_TYPE).map((reaction: any) => reaction.authorId));
          return asAck({ ...comment, reactions: [...(comment.reactions ?? []), ...fresh.filter(row => row.commentId === comment.id && !have.has(row.authorId))] });
        }));
      } catch { /* the list is answered without acks */ }

      // Transform comments to include reaction counts
      const transformComment = (comment: any): any => {
        const reactionCounts: Record<string, number> = {};
        for (const reaction of comment.reactions || []) {
          reactionCounts[reaction.type] = (reactionCounts[reaction.type] || 0) + 1;
        }
        return {
          id: comment.id,
          content: comment.content,
          html: comment.html,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          parentId: comment.parentId,
          author: comment.author,
          reactions: comment.reactions,
          reactionCounts,
          replies: comment.replies?.map(transformComment),
          ack: acks.get(comment.id) ?? null,
        };
      };

      const total = await prisma.issueComment.count({
        where: { issueId: issue.id },
      });

      return NextResponse.json({
        issueKey: issue.issueKey,
        issueId: issue.id,
        comments: comments.map(transformComment),
        total,
      });
    } catch (error) {
      console.error('Error fetching comments:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:read'] }
);

/**
 * POST /api/apps/auth/issues/:issueIdOrKey/comments
 * Add a comment to an issue
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const body = await request.json();
      const data = CreateCommentSchema.parse(body);

      const issue = await findIssue(issueIdOrKey, context);
      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // A seat comments on its own project's issues, and on a request it filed in another project.
      await seatWriteGuard(prisma, context, issue.projectId, issue);

      // Validate parent comment if provided
      if (data.parentId) {
        const parentComment = await prisma.issueComment.findFirst({
          where: {
            id: data.parentId,
            issueId: issue.id,
          },
        });
        if (!parentComment) {
          return NextResponse.json(
            { error: 'parent_not_found', error_description: 'Parent comment not found' },
            { status: 404 }
          );
        }
      }

      await assertLegacyIssueWriteAllowed(issue.id);

      const comment = await prisma.issueComment.create({
        data: {
          content: data.content,
          issueId: issue.id,
          authorId: context.user.id,
          parentId: data.parentId || null,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          issue: {
            select: {
              id: true,
              issueKey: true,
              title: true,
            },
          },
        },
      });

      // Log activity
      await prisma.issueActivity.create({
        data: {
          action: 'COMMENTED',
          itemType: 'ISSUE',
          itemId: issue.id,
          userId: context.user.id,
          workspaceId: context.workspace.id,
          details: JSON.stringify({ commentId: comment.id }),
        },
      });

      await publishEvent(`workspace:${context.workspace.id}:events`, { type: 'issue.comments.changed', workspaceId: context.workspace.id, issueId: issue.id }, 1000);
      return NextResponse.json(comment, { status: 201 });
    } catch (error) {
      if (error instanceof HandoffError) return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
      if (error instanceof ForgeProjectWriteError) return NextResponse.json({ error: 'forge_connected_project', error_description: error.message }, { status: 409 });
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: 'validation_error',
            error_description: 'Invalid request data',
            details: error.errors,
          },
          { status: 400 }
        );
      }

      console.error('Error creating comment:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:write'], seatWrites: true }
);
