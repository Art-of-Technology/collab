/**
 * Third-Party App API: Single Issue Endpoints
 * GET /api/apps/auth/issues/[issueIdOrKey] - Get issue details
 * PATCH /api/apps/auth/issues/[issueIdOrKey] - Update issue
 * DELETE /api/apps/auth/issues/[issueIdOrKey] - Delete issue
 * 
 * Required scopes:
 * - issues:read for GET
 * - issues:write for PATCH, DELETE
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for updating issues
const UpdateIssueSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  type: z.enum(['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.string().optional(),
  assigneeId: z.string().cuid().optional().nullable(),
  reporterId: z.string().cuid().optional().nullable(),
  parentId: z.string().cuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  storyPoints: z.number().int().positive().optional().nullable(),
  color: z.string().optional().nullable(),
  labels: z.array(z.string().cuid()).optional(),
  progress: z.number().int().min(0).max(100).optional(),
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
 * GET /api/apps/auth/issues/[issueIdOrKey]
 * Get full issue details
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;

      const issue = await prisma.issue.findFirst({
        where: {
          OR: [
            { id: issueIdOrKey },
            { issueKey: issueIdOrKey }
          ],
          workspaceId: context.workspace.id
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              issuePrefix: true,
              color: true
            }
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          reporter: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          projectStatus: {
            select: {
              id: true,
              name: true,
              displayName: true,
              color: true,
              order: true,
              isFinal: true
            }
          },
          labels: {
            select: {
              id: true,
              name: true,
              color: true
            }
          },
          parent: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              type: true
            }
          },
          children: {
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
              }
            }
          },
          helpers: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true
                }
              }
            }
          },
          followers: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true
                }
              }
            }
          },
          _count: {
            select: {
              comments: true,
              children: true,
              sourceRelations: true,
              targetRelations: true
            }
          }
        }
      });

      if (!issue) {
        return NextResponse.json(
          { error: 'issue_not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Calculate children progress
      let childrenProgress = null;
      if (issue.children.length > 0) {
        const completedChildren = issue.children.filter(
          child => child.projectStatus?.isFinal === true
        ).length;
        childrenProgress = {
          completed: completedChildren,
          total: issue.children.length,
          percentage: Math.round((completedChildren / issue.children.length) * 100)
        };
      }

      const response = {
        id: issue.id,
        issueKey: issue.issueKey,
        title: issue.title,
        description: issue.description,
        type: issue.type,
        status: issue.projectStatus?.name || issue.statusValue || issue.status,
        statusId: issue.statusId,
        priority: issue.priority,
        dueDate: issue.dueDate,
        startDate: issue.startDate,
        storyPoints: issue.storyPoints,
        progress: issue.progress,
        color: issue.color,
        position: issue.position,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        project: issue.project,
        projectStatus: issue.projectStatus,
        assignee: issue.assignee,
        reporter: issue.reporter,
        labels: issue.labels,
        parent: issue.parent,
        children: issue.children,
        childrenProgress,
        helpers: issue.helpers.map(h => ({
          id: h.id,
          role: h.role,
          status: h.status,
          user: h.user
        })),
        followers: issue.followers.map(f => ({
          id: f.id,
          user: f.user
        })),
        stats: {
          commentCount: issue._count.comments,
          childCount: issue._count.children,
          relationCount: issue._count.sourceRelations + issue._count.targetRelations
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching issue:', error);
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
 * PATCH /api/apps/auth/issues/[issueIdOrKey]
 * Update an issue
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const body = await request.json();
      const updateData = UpdateIssueSchema.parse(body);

      // Find existing issue
      const existingIssue = await findIssue(issueIdOrKey, context.workspace.id);

      if (!existingIssue) {
        return NextResponse.json(
          { error: 'issue_not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Build update object
      const prismaUpdateData: any = {
        updatedAt: new Date()
      };

      if (updateData.title !== undefined) prismaUpdateData.title = updateData.title;
      if (updateData.description !== undefined) prismaUpdateData.description = updateData.description;
      if (updateData.type !== undefined) prismaUpdateData.type = updateData.type;
      if (updateData.priority !== undefined) prismaUpdateData.priority = updateData.priority;
      if (updateData.assigneeId !== undefined) prismaUpdateData.assigneeId = updateData.assigneeId;
      if (updateData.reporterId !== undefined) prismaUpdateData.reporterId = updateData.reporterId;
      if (updateData.parentId !== undefined) prismaUpdateData.parentId = updateData.parentId;
      if (updateData.storyPoints !== undefined) prismaUpdateData.storyPoints = updateData.storyPoints;
      if (updateData.color !== undefined) prismaUpdateData.color = updateData.color;
      if (updateData.progress !== undefined) prismaUpdateData.progress = updateData.progress;

      if (updateData.dueDate !== undefined) {
        prismaUpdateData.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
      }
      if (updateData.startDate !== undefined) {
        prismaUpdateData.startDate = updateData.startDate ? new Date(updateData.startDate) : null;
      }

      // Handle status update
      if (updateData.status) {
        const projectStatus = await prisma.projectStatus.findFirst({
          where: {
            projectId: existingIssue.projectId,
            OR: [
              { name: updateData.status },
              { displayName: updateData.status }
            ],
            isActive: true
          }
        });

        if (projectStatus) {
          prismaUpdateData.statusId = projectStatus.id;
          prismaUpdateData.statusValue = projectStatus.name;
          prismaUpdateData.status = projectStatus.name;
        } else {
          // Allow raw status value for backward compatibility
          prismaUpdateData.status = updateData.status;
          prismaUpdateData.statusValue = updateData.status;
        }
      }

      // Handle labels update
      let relationalUpdates: any = {};
      if (updateData.labels !== undefined) {
        // Verify labels exist in workspace
        if (updateData.labels.length > 0) {
          const validLabels = await prisma.taskLabel.findMany({
            where: {
              id: { in: updateData.labels },
              workspaceId: context.workspace.id
            }
          });
          relationalUpdates.labels = {
            set: validLabels.map(l => ({ id: l.id }))
          };
        } else {
          relationalUpdates.labels = { set: [] };
        }
      }

      // Update the issue
      const updatedIssue = await prisma.issue.update({
        where: { id: existingIssue.id },
        data: {
          ...prismaUpdateData,
          ...relationalUpdates
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              issuePrefix: true
            }
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          reporter: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          projectStatus: {
            select: {
              id: true,
              name: true,
              displayName: true,
              color: true
            }
          },
          labels: {
            select: {
              id: true,
              name: true,
              color: true
            }
          },
          parent: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              type: true
            }
          }
        }
      });

      // Create activity record for the update
      await prisma.boardItemActivity.create({
        data: {
          action: 'UPDATED',
          itemType: 'ISSUE',
          itemId: existingIssue.id,
          userId: context.user.id,
          workspaceId: context.workspace.id,
          details: JSON.stringify({ updatedFields: Object.keys(updateData) })
        }
      });

      const response = {
        id: updatedIssue.id,
        issueKey: updatedIssue.issueKey,
        title: updatedIssue.title,
        description: updatedIssue.description,
        type: updatedIssue.type,
        status: updatedIssue.projectStatus?.name || updatedIssue.statusValue || updatedIssue.status,
        statusId: updatedIssue.statusId,
        priority: updatedIssue.priority,
        dueDate: updatedIssue.dueDate,
        startDate: updatedIssue.startDate,
        storyPoints: updatedIssue.storyPoints,
        progress: updatedIssue.progress,
        color: updatedIssue.color,
        createdAt: updatedIssue.createdAt,
        updatedAt: updatedIssue.updatedAt,
        project: updatedIssue.project,
        projectStatus: updatedIssue.projectStatus,
        assignee: updatedIssue.assignee,
        reporter: updatedIssue.reporter,
        labels: updatedIssue.labels,
        parent: updatedIssue.parent
      };

      return NextResponse.json(response);

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

      console.error('Error updating issue:', error);
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

/**
 * DELETE /api/apps/auth/issues/[issueIdOrKey]
 * Delete an issue
 */
export const DELETE = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;

      // Find existing issue
      const existingIssue = await findIssue(issueIdOrKey, context.workspace.id);

      if (!existingIssue) {
        return NextResponse.json(
          { error: 'issue_not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Delete the issue (cascade will handle related records)
      await prisma.issue.delete({
        where: { id: existingIssue.id }
      });

      return NextResponse.json({
        success: true,
        message: 'Issue deleted successfully',
        deletedIssue: {
          id: existingIssue.id,
          issueKey: existingIssue.issueKey
        }
      });

    } catch (error) {
      console.error('Error deleting issue:', error);
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


