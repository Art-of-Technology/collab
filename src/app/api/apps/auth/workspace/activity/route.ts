/**
 * Third-Party App API: Workspace Activity Endpoint
 * GET /api/apps/auth/workspace/activity - Get cross-project activity feed
 * 
 * Required scopes:
 * - workspace:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/workspace/activity
 * Get workspace-wide activity feed
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
      const action = searchParams.get('action'); // Filter by action type
      const userId = searchParams.get('userId'); // Filter by user
      const projectId = searchParams.get('projectId'); // Filter by project
      const itemType = searchParams.get('itemType'); // Filter by item type (ISSUE, etc.)

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id
      };

      if (action) {
        where.action = action;
      }

      if (userId) {
        where.userId = userId;
      }

      if (itemType) {
        where.itemType = itemType;
      }

      // If filtering by project, need to get issue IDs first
      if (projectId) {
        const projectIssues = await prisma.issue.findMany({
          where: { projectId },
          select: { id: true }
        });
        where.itemId = { in: projectIssues.map(i => i.id) };
      }

      // Get activities
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

      // Get issue details for activities
      const issueDetailsMap = new Map();
      const activityIssueIds = [...new Set(
        activities
          .filter(a => a.itemType === 'ISSUE')
          .map(a => a.itemId)
      )];

      if (activityIssueIds.length > 0) {
        const issueDetails = await prisma.issue.findMany({
          where: { id: { in: activityIssueIds } },
          select: {
            id: true,
            issueKey: true,
            title: true,
            type: true,
            project: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true
              }
            }
          }
        });
        issueDetails.forEach(i => issueDetailsMap.set(i.id, i));
      }

      // Format activities
      const formattedActivities = activities.map(activity => {
        let parsedDetails = null;
        try {
          parsedDetails = activity.details ? JSON.parse(activity.details) : null;
        } catch {
          parsedDetails = activity.details;
        }

        const issue = issueDetailsMap.get(activity.itemId);

        return {
          id: activity.id,
          action: activity.action,
          itemType: activity.itemType,
          itemId: activity.itemId,
          fieldName: activity.fieldName,
          oldValue: activity.oldValue,
          newValue: activity.newValue,
          details: parsedDetails,
          createdAt: activity.createdAt,
          user: activity.user,
          issue: issue || null,
          project: issue?.project || null
        };
      });

      // Get activity breakdown by action type
      const actionBreakdown = await prisma.boardItemActivity.groupBy({
        by: ['action'],
        where: {
          workspaceId: context.workspace.id,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } }
      });

      const response = {
        activities: formattedActivities,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        summary: {
          last7Days: {
            byAction: Object.fromEntries(
              actionBreakdown.map(item => [item.action, item._count.id])
            ),
            totalActivities: actionBreakdown.reduce((sum, item) => sum + item._count.id, 0)
          }
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching workspace activity:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['workspace:read'] }
);


