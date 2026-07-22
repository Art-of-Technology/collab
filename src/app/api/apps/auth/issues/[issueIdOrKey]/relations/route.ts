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

      // Organize relations by type
      const relations: {
        parent: any;
        children: any[];
        blocks: any[];
        blocked_by: any[];
        relates_to: any[];
        duplicates: any[];
        duplicated_by: any[];
      } = {
        parent: null,
        children: [],
        blocks: [],
        blocked_by: [],
        relates_to: [],
        duplicates: [],
        duplicated_by: [],
      };

      // Process source relations (this issue -> other issues)
      for (const rel of sourceRelations) {
        const relData = {
          relationId: rel.id,
          ...rel.targetIssue,
        };
        switch (rel.relationType) {
          case 'PARENT':
            // This issue has a PARENT relation pointing to targetIssue
            // So targetIssue is the parent
            relations.parent = relData;
            break;
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

      // Process target relations (other issues -> this issue)
      for (const rel of targetRelations) {
        const relData = {
          relationId: rel.id,
          ...rel.sourceIssue,
        };
        switch (rel.relationType) {
          case 'PARENT':
            // Another issue has PARENT relation pointing to this issue
            // So that issue is a child of this issue
            relations.children.push(relData);
            break;
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
      if (relations.children.length > 0) {
        const completed = relations.children.filter((c: any) => c.projectStatus?.isFinal).length;
        childrenProgress = {
          total: relations.children.length,
          completed,
          percentage: Math.round((completed / relations.children.length) * 100),
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

      // Handle PARENT relation - create IssueRelation entry
      // Source issue (child) has PARENT relation pointing to target issue (parent)
      if (data.relationType === 'PARENT') {
        // Check if relation already exists
        const existingRelation = await prisma.issueRelation.findFirst({
          where: {
            sourceIssueId: sourceIssue.id,
            targetIssueId: targetIssue.id,
            relationType: 'PARENT',
          },
        });

        if (existingRelation) {
          return NextResponse.json(
            { error: 'relation_exists', error_description: 'This parent relation already exists' },
            { status: 409 }
          );
        }

        const relation = await prisma.issueRelation.create({
          data: {
            sourceIssueId: sourceIssue.id,
            targetIssueId: targetIssue.id,
            relationType: 'PARENT',
            createdBy: context.user.id,
          },
        });

        // Log activity
        await prisma.issueActivity.create({
          data: {
            action: 'RELATION_CREATED',
            itemType: 'ISSUE',
            itemId: sourceIssue.id,
            userId: context.user.id,
            workspaceId: context.workspace.id,
            details: JSON.stringify({
              relationId: relation.id,
              relationType: 'PARENT',
              targetIssueId: targetIssue.id,
            }),
          },
        });

        return NextResponse.json({
          id: relation.id,
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

      // Handle CHILD relation - create PARENT relation in reverse direction
      // Source issue (parent) has CHILD relation to target issue (child)
      // This is stored as: target issue has PARENT relation to source issue
      if (data.relationType === 'CHILD') {
        // Check if relation already exists
        const existingRelation = await prisma.issueRelation.findFirst({
          where: {
            sourceIssueId: targetIssue.id,
            targetIssueId: sourceIssue.id,
            relationType: 'PARENT',
          },
        });

        if (existingRelation) {
          return NextResponse.json(
            { error: 'relation_exists', error_description: 'This child relation already exists' },
            { status: 409 }
          );
        }

        // Create PARENT relation from child (target) to parent (source)
        const relation = await prisma.issueRelation.create({
          data: {
            sourceIssueId: targetIssue.id,
            targetIssueId: sourceIssue.id,
            relationType: 'PARENT',
            createdBy: context.user.id,
          },
        });

        // Log activity
        await prisma.issueActivity.create({
          data: {
            action: 'RELATION_CREATED',
            itemType: 'ISSUE',
            itemId: sourceIssue.id,
            userId: context.user.id,
            workspaceId: context.workspace.id,
            details: JSON.stringify({
              relationId: relation.id,
              relationType: 'CHILD',
              targetIssueId: targetIssue.id,
            }),
          },
        });

        return NextResponse.json({
          id: relation.id,
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
      await prisma.issueActivity.create({
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
