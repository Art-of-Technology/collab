/**
 * Third-Party App API: Issue Relation Delete Endpoint
 * DELETE /api/apps/auth/issues/:issueIdOrKey/relations/:relationId - Delete relation
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * DELETE /api/apps/auth/issues/:issueIdOrKey/relations/:relationId
 * Delete a relation
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
      const issue = await prisma.issue.findFirst({
        where: {
          workspaceId: context.workspace.id,
          OR: [
            { id: issueIdOrKey },
            { issueKey: issueIdOrKey },
          ],
        },
      });

      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Find the relation
      const relation = await prisma.issueRelation.findUnique({
        where: { id: relationId },
      });

      if (!relation) {
        return NextResponse.json(
          { error: 'relation_not_found', error_description: 'Relation not found' },
          { status: 404 }
        );
      }

      // Verify the relation belongs to this issue
      if (relation.sourceIssueId !== issue.id && relation.targetIssueId !== issue.id) {
        return NextResponse.json(
          { error: 'relation_not_found', error_description: 'Relation not found for this issue' },
          { status: 404 }
        );
      }

      // Delete the relation
      await prisma.issueRelation.delete({
        where: { id: relationId },
      });

      // Log activity
      await prisma.issueActivity.create({
        data: {
          action: 'RELATION_DELETED',
          itemType: 'ISSUE',
          itemId: issue.id,
          userId: context.user.id,
          workspaceId: context.workspace.id,
          details: JSON.stringify({
            relationId,
            relationType: relation.relationType,
          }),
        },
      });

      return NextResponse.json({
        message: 'Relation deleted successfully',
        deletedRelationId: relationId,
      });
    } catch (error) {
      console.error('Error deleting relation:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:write'] }
);
