/**
 * Third-Party App API: Issue Activity Endpoint
 * GET /api/apps/auth/issues/[issueIdOrKey]/activity - Get issue activity/history
 * 
 * Required scopes:
 * - issues:read
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
 * GET /api/apps/auth/issues/[issueIdOrKey]/activity
 * Get activity/history for an issue
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const { searchParams } = new URL(request.url);
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
      const page = parseInt(searchParams.get('page') || '1');
      const action = searchParams.get('action'); // Filter by action type

      const skip = (page - 1) * limit;

      // Find the issue
      const issue = await findIssue(issueIdOrKey, context.workspace.id);

      if (!issue) {
        return NextResponse.json(
          { error: 'issue_not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Build where clause
      const where: any = {
        itemType: 'ISSUE',
        itemId: issue.id
      };

      if (action) {
        where.action = action;
      }

      // Get activities with user info
      const [activities, total] = await Promise.all([
        prisma.boardItemActivity.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
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
        }),
        prisma.boardItemActivity.count({ where })
      ]);

      // Format activities
      const formattedActivities = activities.map(activity => {
        let parsedDetails = null;
        try {
          parsedDetails = activity.details ? JSON.parse(activity.details) : null;
        } catch {
          parsedDetails = activity.details;
        }

        return {
          id: activity.id,
          action: activity.action,
          fieldName: activity.fieldName,
          oldValue: activity.oldValue,
          newValue: activity.newValue,
          details: parsedDetails,
          createdAt: activity.createdAt,
          user: activity.user
        };
      });

      const response = {
        issueId: issue.id,
        issueKey: issue.issueKey,
        activities: formattedActivities,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching issue activity:', error);
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


