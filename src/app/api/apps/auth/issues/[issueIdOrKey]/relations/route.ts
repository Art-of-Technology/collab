/**
 * Third-Party App API: Issue Relations Endpoints
 * GET /api/apps/auth/issues/[issueIdOrKey]/relations - Get all relations
 * POST /api/apps/auth/issues/[issueIdOrKey]/relations - Create relation
 * 
 * Required scopes:
 * - issues:read for GET
 * - issues:write for POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, IssueRelationType } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for creating relations
const CreateRelationSchema = z.object({
  targetIssueId: z.string(), // Can be ID or issueKey
  relationType: z.enum(['PARENT', 'CHILD', 'BLOCKS', 'BLOCKED_BY', 'RELATES_TO', 'DUPLICATES', 'DUPLICATED_BY'])
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
 * Helper to get inverse relation type
 */
function getInverseRelationType(type: IssueRelationType): IssueRelationType {
  const inverseMap: Record<IssueRelationType, IssueRelationType> = {
    PARENT: 'CHILD',
    CHILD: 'PARENT',
    BLOCKS: 'BLOCKED_BY',
    BLOCKED_BY: 'BLOCKS',
    RELATES_TO: 'RELATES_TO',
    DUPLICATES: 'DUPLICATED_BY',
    DUPLICATED_BY: 'DUPLICATES'
  };
  return inverseMap[type];
}

/**
 * GET /api/apps/auth/issues/[issueIdOrKey]/relations
 * Get all relations for an issue
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;

      // Find the issue
      const issue = await findIssue(issueIdOrKey, context.workspace.id);

      if (!issue) {
        return NextResponse.json(
          { error: 'issue_not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Get all relations (both outgoing and incoming)
      const [sourceRelations, targetRelations] = await Promise.all([
        prisma.issueRelation.findMany({
          where: { sourceIssueId: issue.id },
          include: {
            targetIssue: {
              select: {
                id: true,
                issueKey: true,
                title: true,
                type: true,
                priority: true,
                projectStatus: {
                  select: {
                    id: true,
                    name: true,
                    displayName: true,
                    color: true,
                    isFinal: true
                  }
                },
                assignee: {
                  select: {
                    id: true,
                    name: true,
                    image: true
                  }
                },
                project: {
                  select: {
                    id: true,
                    name: true,
                    slug: true
                  }
                }
              }
            }
          }
        }),
        prisma.issueRelation.findMany({
          where: { targetIssueId: issue.id },
          include: {
            sourceIssue: {
              select: {
                id: true,
                issueKey: true,
                title: true,
                type: true,
                priority: true,
                projectStatus: {
                  select: {
                    id: true,
                    name: true,
                    displayName: true,
                    color: true,
                    isFinal: true
                  }
                },
                assignee: {
                  select: {
                    id: true,
                    name: true,
                    image: true
                  }
                },
                project: {
                  select: {
                    id: true,
                    name: true,
                    slug: true
                  }
                }
              }
            }
          }
        })
      ]);

      // Group relations by type
      const groupedRelations: Record<string, any[]> = {
        parent: [],
        children: [],
        blocks: [],
        blocked_by: [],
        relates_to: [],
        duplicates: [],
        duplicated_by: []
      };

      // Process outgoing relations
      sourceRelations.forEach(rel => {
        const relatedIssue = {
          relationId: rel.id,
          id: rel.targetIssue.id,
          issueKey: rel.targetIssue.issueKey,
          title: rel.targetIssue.title,
          type: rel.targetIssue.type,
          priority: rel.targetIssue.priority,
          status: rel.targetIssue.projectStatus,
          assignee: rel.targetIssue.assignee,
          project: rel.targetIssue.project,
          createdAt: rel.createdAt
        };

        switch (rel.relationType) {
          case 'PARENT':
            groupedRelations.parent.push(relatedIssue);
            break;
          case 'CHILD':
            groupedRelations.children.push(relatedIssue);
            break;
          case 'BLOCKS':
            groupedRelations.blocks.push(relatedIssue);
            break;
          case 'BLOCKED_BY':
            groupedRelations.blocked_by.push(relatedIssue);
            break;
          case 'RELATES_TO':
            groupedRelations.relates_to.push(relatedIssue);
            break;
          case 'DUPLICATES':
            groupedRelations.duplicates.push(relatedIssue);
            break;
          case 'DUPLICATED_BY':
            groupedRelations.duplicated_by.push(relatedIssue);
            break;
        }
      });

      // Process incoming relations (inverse)
      targetRelations.forEach(rel => {
        const relatedIssue = {
          relationId: rel.id,
          id: rel.sourceIssue.id,
          issueKey: rel.sourceIssue.issueKey,
          title: rel.sourceIssue.title,
          type: rel.sourceIssue.type,
          priority: rel.sourceIssue.priority,
          status: rel.sourceIssue.projectStatus,
          assignee: rel.sourceIssue.assignee,
          project: rel.sourceIssue.project,
          createdAt: rel.createdAt
        };

        // Inverse the relation type
        switch (rel.relationType) {
          case 'PARENT':
            groupedRelations.children.push(relatedIssue);
            break;
          case 'CHILD':
            groupedRelations.parent.push(relatedIssue);
            break;
          case 'BLOCKS':
            groupedRelations.blocked_by.push(relatedIssue);
            break;
          case 'BLOCKED_BY':
            groupedRelations.blocks.push(relatedIssue);
            break;
          case 'RELATES_TO':
            // Already bidirectional
            if (!groupedRelations.relates_to.some(r => r.id === relatedIssue.id)) {
              groupedRelations.relates_to.push(relatedIssue);
            }
            break;
          case 'DUPLICATES':
            groupedRelations.duplicated_by.push(relatedIssue);
            break;
          case 'DUPLICATED_BY':
            groupedRelations.duplicates.push(relatedIssue);
            break;
        }
      });

      // Calculate children progress
      let childrenProgress = null;
      if (groupedRelations.children.length > 0) {
        const completedChildren = groupedRelations.children.filter(
          (child: any) => child.status?.isFinal === true
        ).length;
        childrenProgress = {
          completed: completedChildren,
          total: groupedRelations.children.length,
          percentage: Math.round((completedChildren / groupedRelations.children.length) * 100)
        };
      }

      const response = {
        issueId: issue.id,
        issueKey: issue.issueKey,
        relations: {
          parent: groupedRelations.parent[0] || null,
          children: groupedRelations.children,
          blocks: groupedRelations.blocks,
          blocked_by: groupedRelations.blocked_by,
          relates_to: groupedRelations.relates_to,
          duplicates: groupedRelations.duplicates,
          duplicated_by: groupedRelations.duplicated_by
        },
        childrenProgress,
        counts: {
          parent: groupedRelations.parent.length,
          children: groupedRelations.children.length,
          blocks: groupedRelations.blocks.length,
          blocked_by: groupedRelations.blocked_by.length,
          relates_to: groupedRelations.relates_to.length,
          duplicates: groupedRelations.duplicates.length,
          duplicated_by: groupedRelations.duplicated_by.length,
          total: sourceRelations.length + targetRelations.length
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching issue relations:', error);
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
 * POST /api/apps/auth/issues/[issueIdOrKey]/relations
 * Create a relation between issues
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const body = await request.json();
      const relationData = CreateRelationSchema.parse(body);

      // Find source issue
      const sourceIssue = await findIssue(issueIdOrKey, context.workspace.id);

      if (!sourceIssue) {
        return NextResponse.json(
          { error: 'issue_not_found', error_description: 'Source issue not found' },
          { status: 404 }
        );
      }

      // Find target issue (can be in same workspace)
      const targetIssue = await findIssue(relationData.targetIssueId, context.workspace.id);

      if (!targetIssue) {
        return NextResponse.json(
          { error: 'target_issue_not_found', error_description: 'Target issue not found' },
          { status: 404 }
        );
      }

      // Prevent self-relation
      if (sourceIssue.id === targetIssue.id) {
        return NextResponse.json(
          { error: 'invalid_relation', error_description: 'Cannot create relation to the same issue' },
          { status: 400 }
        );
      }

      // Check for existing relation
      const existingRelation = await prisma.issueRelation.findFirst({
        where: {
          OR: [
            {
              sourceIssueId: sourceIssue.id,
              targetIssueId: targetIssue.id,
              relationType: relationData.relationType as IssueRelationType
            },
            {
              sourceIssueId: targetIssue.id,
              targetIssueId: sourceIssue.id,
              relationType: getInverseRelationType(relationData.relationType as IssueRelationType)
            }
          ]
        }
      });

      if (existingRelation) {
        return NextResponse.json(
          { error: 'relation_exists', error_description: 'This relation already exists' },
          { status: 409 }
        );
      }

      // Create the relation
      const newRelation = await prisma.issueRelation.create({
        data: {
          sourceIssueId: sourceIssue.id,
          targetIssueId: targetIssue.id,
          relationType: relationData.relationType as IssueRelationType,
          createdBy: context.user.id
        },
        include: {
          targetIssue: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              type: true,
              priority: true,
              projectStatus: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  color: true
                }
              }
            }
          }
        }
      });

      // Create activity record
      await prisma.boardItemActivity.create({
        data: {
          action: 'RELATION_ADDED',
          itemType: 'ISSUE',
          itemId: sourceIssue.id,
          userId: context.user.id,
          workspaceId: context.workspace.id,
          details: JSON.stringify({
            relationType: relationData.relationType,
            targetIssueId: targetIssue.id,
            targetIssueKey: targetIssue.issueKey
          })
        }
      });

      const response = {
        id: newRelation.id,
        sourceIssue: {
          id: sourceIssue.id,
          issueKey: sourceIssue.issueKey
        },
        targetIssue: newRelation.targetIssue,
        relationType: newRelation.relationType,
        createdAt: newRelation.createdAt
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

      console.error('Error creating relation:', error);
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


