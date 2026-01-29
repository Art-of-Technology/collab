/**
 * Third-Party App API: Issue Work Logs Endpoints
 * GET /api/apps/auth/issues/:issueIdOrKey/work-logs - List work logs
 * POST /api/apps/auth/issues/:issueIdOrKey/work-logs - Create work log
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const CreateWorkLogSchema = z.object({
  timeSpent: z.number().int().positive().describe('Time spent in minutes'),
  description: z.string().optional(),
  loggedAt: z.string().datetime().optional().describe('When the work was done (ISO 8601)'),
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
 * GET /api/apps/auth/issues/:issueIdOrKey/work-logs
 * Get work logs for an issue with time tracking summary
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const { searchParams } = new URL(request.url);
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const offset = parseInt(searchParams.get('offset') || '0');
      const userId = searchParams.get('userId');

      const issue = await findIssue(issueIdOrKey, context.workspace.id);
      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      const whereClause = {
        issueId: issue.id,
        ...(userId && { userId }),
      };

      const [workLogs, total] = await Promise.all([
        prisma.workLog.findMany({
          where: whereClause,
          orderBy: { loggedAt: 'desc' },
          take: limit,
          skip: offset,
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
        }),
        prisma.workLog.count({ where: whereClause }),
      ]);

      // Calculate time tracking summary
      const totalTimeSpent = await prisma.workLog.aggregate({
        where: { issueId: issue.id },
        _sum: { timeSpent: true },
      });

      const timeRemaining = issue.timeEstimateMinutes
        ? Math.max(0, issue.timeEstimateMinutes - (totalTimeSpent._sum.timeSpent || 0))
        : null;

      return NextResponse.json({
        issueKey: issue.issueKey,
        issueId: issue.id,
        workLogs: workLogs.map(log => ({
          id: log.id,
          timeSpent: log.timeSpent,
          description: log.description,
          loggedAt: log.loggedAt,
          createdAt: log.createdAt,
          updatedAt: log.updatedAt,
          user: log.user,
        })),
        summary: {
          totalTimeSpent: totalTimeSpent._sum.timeSpent || 0,
          timeEstimate: issue.timeEstimateMinutes,
          timeRemaining,
          logCount: total,
        },
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + workLogs.length < total,
        },
      });
    } catch (error) {
      console.error('Error fetching work logs:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:read'] }
);

/**
 * POST /api/apps/auth/issues/:issueIdOrKey/work-logs
 * Create a work log entry for an issue
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const body = await request.json();
      const data = CreateWorkLogSchema.parse(body);

      const issue = await findIssue(issueIdOrKey, context.workspace.id);
      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Create work log and update issue time spent in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the work log
        const workLog = await tx.workLog.create({
          data: {
            issueId: issue.id,
            userId: context.user.id,
            workspaceId: context.workspace.id,
            timeSpent: data.timeSpent,
            description: data.description || null,
            loggedAt: data.loggedAt ? new Date(data.loggedAt) : new Date(),
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

        // Update issue's total time spent
        const updatedIssue = await tx.issue.update({
          where: { id: issue.id },
          data: {
            timeSpentMinutes: {
              increment: data.timeSpent,
            },
          },
          select: {
            id: true,
            issueKey: true,
            timeEstimateMinutes: true,
            timeSpentMinutes: true,
          },
        });

        // Log activity
        await tx.issueActivity.create({
          data: {
            action: 'TIME_LOGGED',
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
              timeLogged: data.timeSpent,
              description: data.description,
            }),
          },
        });

        return { workLog, issue: updatedIssue };
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
          user: result.workLog.user,
        },
        issue: {
          issueKey: result.issue.issueKey,
          timeEstimateMinutes: result.issue.timeEstimateMinutes,
          timeSpentMinutes: result.issue.timeSpentMinutes,
          timeRemaining,
        },
      }, { status: 201 });
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

      console.error('Error creating work log:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:write'] }
);
