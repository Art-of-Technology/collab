/**
 * Third-Party App API: Issue Relations Endpoints
 * GET /api/apps/auth/issues/:issueIdOrKey/relations - Get issue relations
 * POST /api/apps/auth/issues/:issueIdOrKey/relations - Create relation
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const CreateRelationSchema = z.object({
  targetIssueId: z.string(),
  relationType: z.enum(['PARENT', 'CHILD', 'BLOCKS', 'BLOCKED_BY', 'RELATES_TO', 'DUPLICATES', 'DUPLICATED_BY']),
});

async function findIssue(issueIdOrKey: string, workspaceId: string) {
  return prisma.issue.findFirst({
    where: {
      workspaceId,
      OR: [
        { id: issueIdOrKey },
        { issueKey: issueIdOrKey },
      ],
    },
  });
}

/**
 * GET /api/apps/auth/issues/:issueIdOrKey/relations
 * Get all relationships for an issue
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;

      const issue = await findIssue(issueIdOrKey, context.workspace.id);
      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Get relations where this issue is the source
      const sourceRelations = await prisma.issueRelation.findMany({
        where: { sourceIssueId: issue.id },
        include: {
          targetIssue: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              type: true,
              status: true,
              priority: true,
              projectStatus: {
                select: {
                  name: true,
                  displayName: true,
                  color: true,
                  isFinal: true,
                },
              },
            },
          },
        },
      });

      // Get relations where this issue is the target
      const targetRelations = await prisma.issueRelation.findMany({
        where: { targetIssueId: issue.id },
        include: {
          sourceIssue: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              type: true,
              status: true,
              priority: true,
              projectStatus: {
                select: {
                  name: true,
                  displayName: true,
                  color: true,
                  isFinal: true,
                },
              },
            },
          },
        },
      });

      // Get children directly from parent relationship
      const children = await prisma.issue.findMany({
        where: { parentId: issue.id },
        select: {
          id: true,
          issueKey: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          projectStatus: {
            select: {
              name: true,
              displayName: true,
              color: true,
              isFinal: true,
            },
          },
        },
      });

      // Get parent directly
      const parent = issue.parentId ? await prisma.issue.findUnique({
        where: { id: issue.parentId },
        select: {
          id: true,
          issueKey: true,
          title: true,
          type: true,
          status: true,
          priority: true,
        },
      }) : null;

      // Organize relations by type
      const relations: Record<string, any[]> = {
        parent: parent ? parent : null,
        children: children,
        blocks: [],
        blocked_by: [],
        relates_to: [],
        duplicates: [],
        duplicated_by: [],
      };

      // Process source relations
      for (const rel of sourceRelations) {
        const relData = {
          relationId: rel.id,
          ...rel.targetIssue,
        };
        switch (rel.relationType) {
          case 'BLOCKS':
            relations.blocks.push(relData);
            break;
          case 'RELATES_TO':
            relations.relates_to.push(relData);
            break;
          case 'DUPLICATES':
            relations.duplicates.push(relData);
            break;
        }
      }

      // Process target relations (inverse)
      for (const rel of targetRelations) {
        const relData = {
          relationId: rel.id,
          ...rel.sourceIssue,
        };
        switch (rel.relationType) {
          case 'BLOCKS':
            relations.blocked_by.push(relData);
            break;
          case 'RELATES_TO':
            relations.relates_to.push(relData);
            break;
          case 'DUPLICATES':
            relations.duplicated_by.push(relData);
            break;
        }
      }

      // Calculate children progress
      let childrenProgress = null;
      if (children.length > 0) {
        const completed = children.filter(c => c.projectStatus?.isFinal).length;
        childrenProgress = {
          total: children.length,
          completed,
          percentage: Math.round((completed / children.length) * 100),
        };
      }

      return NextResponse.json({
        issueKey: issue.issueKey,
        issueId: issue.id,
        relations,
        childrenProgress,
      });
    } catch (error) {
      console.error('Error fetching issue relations:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:read'] }
);

/**
 * POST /api/apps/auth/issues/:issueIdOrKey/relations
 * Create a relationship between issues
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const body = await request.json();
      const data = CreateRelationSchema.parse(body);

      // Find source issue
      const sourceIssue = await findIssue(issueIdOrKey, context.workspace.id);
      if (!sourceIssue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Source issue not found' },
          { status: 404 }
        );
      }

      // Find target issue
      const targetIssue = await findIssue(data.targetIssueId, context.workspace.id);
      if (!targetIssue) {
        return NextResponse.json(
          { error: 'target_not_found', error_description: 'Target issue not found' },
          { status: 404 }
        );
      }

      // Prevent self-relation
      if (sourceIssue.id === targetIssue.id) {
        return NextResponse.json(
          { error: 'invalid_relation', error_description: 'Cannot create relation to self' },
          { status: 400 }
        );
      }

      // Handle PARENT/CHILD relations via parentId field
      if (data.relationType === 'PARENT') {
        await prisma.issue.update({
          where: { id: sourceIssue.id },
          data: { parentId: targetIssue.id },
        });

        return NextResponse.json({
          message: 'Parent relation created',
          relationType: 'PARENT',
          sourceIssue: {
            id: sourceIssue.id,
            issueKey: sourceIssue.issueKey,
          },
          targetIssue: {
            id: targetIssue.id,
            issueKey: targetIssue.issueKey,
          },
        }, { status: 201 });
      }

      if (data.relationType === 'CHILD') {
        await prisma.issue.update({
          where: { id: targetIssue.id },
          data: { parentId: sourceIssue.id },
        });

        return NextResponse.json({
          message: 'Child relation created',
          relationType: 'CHILD',
          sourceIssue: {
            id: sourceIssue.id,
            issueKey: sourceIssue.issueKey,
          },
          targetIssue: {
            id: targetIssue.id,
            issueKey: targetIssue.issueKey,
          },
        }, { status: 201 });
      }

      // Check if relation already exists
      const existingRelation = await prisma.issueRelation.findFirst({
        where: {
          sourceIssueId: sourceIssue.id,
          targetIssueId: targetIssue.id,
          relationType: data.relationType,
        },
      });

      if (existingRelation) {
        return NextResponse.json(
          { error: 'relation_exists', error_description: 'This relation already exists' },
          { status: 409 }
        );
      }

      // Create the relation
      const relation = await prisma.issueRelation.create({
        data: {
          sourceIssueId: sourceIssue.id,
          targetIssueId: targetIssue.id,
          relationType: data.relationType,
          createdBy: context.user.id,
        },
        include: {
          sourceIssue: {
            select: {
              id: true,
              issueKey: true,
              title: true,
            },
          },
          targetIssue: {
            select: {
              id: true,
              issueKey: true,
              title: true,
            },
          },
        },
      });

      // Log activity
      await prisma.boardItemActivity.create({
        data: {
          action: 'RELATION_CREATED',
          itemType: 'ISSUE',
          itemId: sourceIssue.id,
          userId: context.user.id,
          workspaceId: context.workspace.id,
          details: JSON.stringify({
            relationId: relation.id,
            relationType: data.relationType,
            targetIssueId: targetIssue.id,
          }),
        },
      });

      return NextResponse.json(relation, { status: 201 });
    } catch (error) {
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

      console.error('Error creating relation:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:write'] }
);
