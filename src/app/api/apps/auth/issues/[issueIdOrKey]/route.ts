/**
 * Third-Party App API: Single Issue Endpoints
 * GET /api/apps/auth/issues/:issueIdOrKey - Get issue details
 * PATCH /api/apps/auth/issues/:issueIdOrKey - Update issue
 * DELETE /api/apps/auth/issues/:issueIdOrKey - Delete issue
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for updating issues
const UpdateIssueSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  type: z.enum(['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.string().optional(),
  assigneeId: z.string().cuid().nullable().optional(),
  parentId: z.string().cuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  storyPoints: z.number().int().positive().nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  color: z.string().nullable().optional(),
  labels: z.array(z.string()).optional(),
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
 * GET /api/apps/auth/issues/:issueIdOrKey
 * Get detailed issue information
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;

      const issue = await prisma.issue.findFirst({
        where: {
          workspaceId: context.workspace.id,
          OR: [
            { id: issueIdOrKey },
            { issueKey: issueIdOrKey },
          ],
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              issuePrefix: true,
              color: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          reporter: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          parent: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              type: true,
            },
          },
          children: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              type: true,
              status: true,
              priority: true,
              assignee: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
          labels: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          projectStatus: {
            select: {
              id: true,
              name: true,
              displayName: true,
              color: true,
              isFinal: true,
            },
          },
          _count: {
            select: {
              comments: true,
              children: true,
              sourceRelations: true,
              targetRelations: true,
            },
          },
        },
      });

      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: issue.id,
        issueKey: issue.issueKey,
        title: issue.title,
        description: issue.description,
        type: issue.type,
        status: issue.status || issue.statusValue,
        statusId: issue.statusId,
        projectStatus: issue.projectStatus,
        priority: issue.priority,
        storyPoints: issue.storyPoints,
        dueDate: issue.dueDate,
        startDate: issue.startDate,
        progress: issue.progress,
        color: issue.color,
        position: issue.position,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        firstStartedAt: issue.firstStartedAt,
        lastProgressAt: issue.lastProgressAt,
        daysInProgress: issue.daysInProgress,
        project: issue.project,
        assignee: issue.assignee,
        reporter: issue.reporter,
        parent: issue.parent,
        children: issue.children,
        labels: issue.labels,
        stats: {
          commentCount: issue._count.comments,
          childCount: issue._count.children,
          relationCount: issue._count.sourceRelations + issue._count.targetRelations,
        },
      });
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
 * PATCH /api/apps/auth/issues/:issueIdOrKey
 * Update an existing issue
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const body = await request.json();
      const updateData = UpdateIssueSchema.parse(body);

      // Find the issue
      const existingIssue = await findIssue(issueIdOrKey, context.workspace.id);
      if (!existingIssue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Build update object
      const update: any = {};

      if (updateData.title !== undefined) update.title = updateData.title;
      if (updateData.description !== undefined) update.description = updateData.description;
      if (updateData.type !== undefined) update.type = updateData.type;
      if (updateData.priority !== undefined) update.priority = updateData.priority;
      if (updateData.storyPoints !== undefined) update.storyPoints = updateData.storyPoints;
      if (updateData.progress !== undefined) update.progress = updateData.progress;
      if (updateData.color !== undefined) update.color = updateData.color;
      if (updateData.parentId !== undefined) update.parentId = updateData.parentId;
      if (updateData.dueDate !== undefined) {
        update.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
      }
      if (updateData.startDate !== undefined) {
        update.startDate = updateData.startDate ? new Date(updateData.startDate) : null;
      }

      // Handle assignee change
      if (updateData.assigneeId !== undefined) {
        if (updateData.assigneeId) {
          const member = await prisma.workspaceMember.findFirst({
            where: {
              userId: updateData.assigneeId,
              workspaceId: context.workspace.id,
            },
          });
          if (!member) {
            return NextResponse.json(
              { error: 'assignee_not_found', error_description: 'Assignee not found in workspace' },
              { status: 404 }
            );
          }
        }
        update.assigneeId = updateData.assigneeId;
      }

      // Handle status change
      if (updateData.status !== undefined) {
        const projectStatus = await prisma.projectStatus.findFirst({
          where: {
            projectId: existingIssue.projectId,
            OR: [
              { name: updateData.status },
              { displayName: updateData.status },
            ],
            isActive: true,
          },
        });

        if (projectStatus) {
          update.statusId = projectStatus.id;
          update.statusValue = projectStatus.name;
          update.status = projectStatus.name;

          // Track lifecycle: first time moving to non-initial status
          if (!existingIssue.firstStartedAt && !projectStatus.isDefault) {
            update.firstStartedAt = new Date();
          }
          update.lastProgressAt = new Date();
        } else {
          update.status = updateData.status;
          update.statusValue = updateData.status;
        }
      }

      // Handle labels
      let labelsUpdate = {};
      if (updateData.labels !== undefined) {
        labelsUpdate = {
          labels: {
            set: updateData.labels.map(id => ({ id })),
          },
        };
      }

      // Create activity record for the change
      const oldValues: any = {};
      const changes: { fieldName: string; oldValue: string; newValue: string }[] = [];

      if (updateData.status && updateData.status !== existingIssue.status) {
        changes.push({
          fieldName: 'status',
          oldValue: existingIssue.status || '',
          newValue: updateData.status,
        });
      }
      if (updateData.assigneeId !== undefined && updateData.assigneeId !== existingIssue.assigneeId) {
        changes.push({
          fieldName: 'assignee',
          oldValue: existingIssue.assigneeId || '',
          newValue: updateData.assigneeId || '',
        });
      }
      if (updateData.priority && updateData.priority !== existingIssue.priority) {
        changes.push({
          fieldName: 'priority',
          oldValue: existingIssue.priority,
          newValue: updateData.priority,
        });
      }

      // Update issue
      const updatedIssue = await prisma.issue.update({
        where: { id: existingIssue.id },
        data: {
          ...update,
          ...labelsUpdate,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              issuePrefix: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          reporter: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          labels: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          projectStatus: {
            select: {
              id: true,
              name: true,
              displayName: true,
              color: true,
            },
          },
        },
      });

      // Create activity records
      for (const change of changes) {
        await prisma.boardItemActivity.create({
          data: {
            action: 'UPDATED',
            itemType: 'ISSUE',
            itemId: existingIssue.id,
            userId: context.user.id,
            workspaceId: context.workspace.id,
            fieldName: change.fieldName,
            oldValue: change.oldValue,
            newValue: change.newValue,
          },
        });
      }

      return NextResponse.json(updatedIssue);
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
 * DELETE /api/apps/auth/issues/:issueIdOrKey
 * Delete an issue
 */
export const DELETE = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;

      const existingIssue = await findIssue(issueIdOrKey, context.workspace.id);
      if (!existingIssue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Delete the issue
      await prisma.issue.delete({
        where: { id: existingIssue.id },
      });

      return NextResponse.json({
        message: 'Issue deleted successfully',
        deletedIssue: {
          id: existingIssue.id,
          issueKey: existingIssue.issueKey,
          title: existingIssue.title,
        },
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
