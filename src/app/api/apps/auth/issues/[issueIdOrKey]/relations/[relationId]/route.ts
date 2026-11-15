import { ForgeProjectWriteError, assertLegacyIssueWriteAllowed } from '@/lib/forge/legacy-write-guard';
/**
 * Third-Party App API: Issue Relation Delete Endpoint
 * DELETE /api/apps/auth/issues/:issueIdOrKey/relations/:relationId - Delete relation
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { HandoffError, seatWriteGuard } from '@/lib/agent-seats';

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

      // A link is a write to both of its ends.
      const ends = await prisma.issue.findMany({ where: { id: { in: [relation.sourceIssueId, relation.targetIssueId] } }, select: { projectId: true } });
      for (const end of ends) await seatWriteGuard(prisma, context, end.projectId);
      await assertLegacyIssueWriteAllowed(relation.sourceIssueId, relation.targetIssueId);

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
      if (error instanceof HandoffError) return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
      if (error instanceof ForgeProjectWriteError) return NextResponse.json({ error: 'forge_connected_project', error_description: error.message }, { status: 409 });
      console.error('Error deleting relation:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:write'], seatWrites: true }
);
