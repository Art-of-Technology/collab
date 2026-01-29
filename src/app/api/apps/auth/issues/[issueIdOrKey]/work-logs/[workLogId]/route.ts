/**
 * Third-Party App API: Individual Work Log Endpoints
 * GET /api/apps/auth/issues/:issueIdOrKey/work-logs/:workLogId - Get work log
 * PATCH /api/apps/auth/issues/:issueIdOrKey/work-logs/:workLogId - Update work log
 * DELETE /api/apps/auth/issues/:issueIdOrKey/work-logs/:workLogId - Delete work log
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const UpdateWorkLogSchema = z.object({
  timeSpent: z.number().int().positive().optional().describe('Time spent in minutes'),
  description: z.string().optional().nullable(),
  loggedAt: z.string().datetime().optional().describe('When the work was done (ISO 8601)'),
});

type RouteParams = { params: Promise<{ issueIdOrKey: string; workLogId: string }> };

async function findIssueAndWorkLog(
  issueIdOrKey: string,
  workLogId: string,
  workspaceId: string
) {
  const issue = await prisma.issue.findFirst({
    where: {
      workspaceId,
      OR: [
        { id: issueIdOrKey },
        { issueKey: issueIdOrKey },
      ],
    },
  });

  if (!issue) {
    return { issue: null, workLog: null };
  }

  const workLog = await prisma.workLog.findFirst({
    where: {
      id: workLogId,
      issueId: issue.id,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  return { issue, workLog };
}

/**
 * GET /api/apps/auth/issues/:issueIdOrKey/work-logs/:workLogId
 * Get a specific work log
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: RouteParams) => {
    try {
      const { issueIdOrKey, workLogId } = await params;

      const { issue, workLog } = await findIssueAndWorkLog(
        issueIdOrKey,
        workLogId,
        context.workspace.id
      );

      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      if (!workLog) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Work log not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: workLog.id,
        timeSpent: workLog.timeSpent,
        description: workLog.description,
        loggedAt: workLog.loggedAt,
        createdAt: workLog.createdAt,
        updatedAt: workLog.updatedAt,
        user: workLog.user,
        issue: {
          id: issue.id,
          issueKey: issue.issueKey,
        },
      });
    } catch (error) {
      console.error('Error fetching work log:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:read'] }
);

/**
 * PATCH /api/apps/auth/issues/:issueIdOrKey/work-logs/:workLogId
 * Update a work log entry
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: RouteParams) => {
    try {
      const { issueIdOrKey, workLogId } = await params;
      const body = await request.json();
      const data = UpdateWorkLogSchema.parse(body);

      const { issue, workLog } = await findIssueAndWorkLog(
        issueIdOrKey,
        workLogId,
        context.workspace.id
      );

      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      if (!workLog) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Work log not found' },
          { status: 404 }
        );
      }

      // Calculate time difference if updating timeSpent
      const timeDifference = data.timeSpent !== undefined
        ? data.timeSpent - workLog.timeSpent
        : 0;

      // Update work log and issue time spent in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const updatedWorkLog = await tx.workLog.update({
          where: { id: workLogId },
          data: {
            ...(data.timeSpent !== undefined && { timeSpent: data.timeSpent }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.loggedAt && { loggedAt: new Date(data.loggedAt) }),
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        });

        // Update issue's total time spent if time changed
        let updatedIssue = issue;
        if (timeDifference !== 0) {
          updatedIssue = await tx.issue.update({
            where: { id: issue.id },
            data: {
              timeSpentMinutes: {
                increment: timeDifference,
              },
            },
          });

          // Log activity for time change
          await tx.issueActivity.create({
            data: {
              action: 'TIME_UPDATED',
              itemType: 'ISSUE',
              itemId: issue.id,
              userId: context.user.id,
              workspaceId: context.workspace.id,
              projectId: issue.projectId,
              fieldName: 'timeSpent',
              oldValue: JSON.stringify(issue.timeSpentMinutes),
              newValue: JSON.stringify(updatedIssue.timeSpentMinutes),
              details: JSON.stringify({
                workLogId: workLog.id,
                oldTimeSpent: workLog.timeSpent,
                newTimeSpent: data.timeSpent,
              }),
            },
          });
        }

        return { workLog: updatedWorkLog, issue: updatedIssue };
      });

      const timeRemaining = result.issue.timeEstimateMinutes
        ? Math.max(0, result.issue.timeEstimateMinutes - result.issue.timeSpentMinutes)
        : null;

      return NextResponse.json({
        workLog: {
          id: result.workLog.id,
          timeSpent: result.workLog.timeSpent,
          description: result.workLog.description,
          loggedAt: result.workLog.loggedAt,
          createdAt: result.workLog.createdAt,
          updatedAt: result.workLog.updatedAt,
          user: result.workLog.user,
        },
        issue: {
          issueKey: result.issue.issueKey,
          timeEstimateMinutes: result.issue.timeEstimateMinutes,
          timeSpentMinutes: result.issue.timeSpentMinutes,
          timeRemaining,
        },
      });
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

      console.error('Error updating work log:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:write'] }
);

/**
 * DELETE /api/apps/auth/issues/:issueIdOrKey/work-logs/:workLogId
 * Delete a work log entry
 */
export const DELETE = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: RouteParams) => {
    try {
      const { issueIdOrKey, workLogId } = await params;

      const { issue, workLog } = await findIssueAndWorkLog(
        issueIdOrKey,
        workLogId,
        context.workspace.id
      );

      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      if (!workLog) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Work log not found' },
          { status: 404 }
        );
      }

      // Delete work log and update issue time spent in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.workLog.delete({
          where: { id: workLogId },
        });

        // Decrement issue's total time spent
        const updatedIssue = await tx.issue.update({
          where: { id: issue.id },
          data: {
            timeSpentMinutes: {
              decrement: workLog.timeSpent,
            },
          },
        });

        // Ensure timeSpentMinutes doesn't go negative
        if (updatedIssue.timeSpentMinutes < 0) {
          await tx.issue.update({
            where: { id: issue.id },
            data: { timeSpentMinutes: 0 },
          });
        }

        // Log activity
        await tx.issueActivity.create({
          data: {
            action: 'TIME_DELETED',
            itemType: 'ISSUE',
            itemId: issue.id,
            userId: context.user.id,
            workspaceId: context.workspace.id,
            projectId: issue.projectId,
            fieldName: 'timeSpent',
            oldValue: JSON.stringify(issue.timeSpentMinutes),
            newValue: JSON.stringify(Math.max(0, issue.timeSpentMinutes - workLog.timeSpent)),
            details: JSON.stringify({
              workLogId: workLog.id,
              timeRemoved: workLog.timeSpent,
              description: workLog.description,
            }),
          },
        });
      });

      return NextResponse.json({
        message: 'Work log deleted successfully',
        deletedWorkLogId: workLogId,
      });
    } catch (error) {
      console.error('Error deleting work log:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:write'] }
);
