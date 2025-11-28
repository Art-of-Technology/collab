/**
 * Third-Party App API: Single Relation Endpoint
 * DELETE /api/apps/auth/issues/[issueIdOrKey]/relations/[relationId] - Delete relation
 * 
 * Required scopes:
 * - issues:write for DELETE
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

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
 * DELETE /api/apps/auth/issues/[issueIdOrKey]/relations/[relationId]
 * Delete a specific relation
 */
export const DELETE = withAppAuth(
  async (
    request: NextRequest,
    context: AppAuthContext,
    { params }: { params: Promise<{ issueIdOrKey: string; relationId: string }> }
  ) => {
    try {
      const { issueIdOrKey, relationId } = await params;

      // Find the issue
      const issue = await findIssue(issueIdOrKey, context.workspace.id);

      if (!issue) {
        return NextResponse.json(
          { error: 'issue_not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Find the relation
      const relation = await prisma.issueRelation.findFirst({
        where: {
          id: relationId,
          OR: [
            { sourceIssueId: issue.id },
            { targetIssueId: issue.id }
          ]
        },
        include: {
          sourceIssue: {
            select: { issueKey: true }
          },
          targetIssue: {
            select: { issueKey: true }
          }
        }
      });

      if (!relation) {
        return NextResponse.json(
          { error: 'relation_not_found', error_description: 'Relation not found' },
          { status: 404 }
        );
      }

      // Delete the relation
      await prisma.issueRelation.delete({
        where: { id: relationId }
      });

      // Create activity record
      await prisma.boardItemActivity.create({
        data: {
          action: 'RELATION_REMOVED',
          itemType: 'ISSUE',
          itemId: issue.id,
          userId: context.user.id,
          workspaceId: context.workspace.id,
          details: JSON.stringify({
            relationType: relation.relationType,
            sourceIssueKey: relation.sourceIssue.issueKey,
            targetIssueKey: relation.targetIssue.issueKey
          })
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Relation deleted successfully',
        deletedRelation: {
          id: relationId,
          relationType: relation.relationType
        }
      });

    } catch (error) {
      console.error('Error deleting relation:', error);
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


