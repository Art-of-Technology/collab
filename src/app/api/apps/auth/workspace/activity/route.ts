/**
 * Third-Party App API: Workspace Activity
 * GET /api/apps/auth/workspace/activity - Get workspace-wide activity feed
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * GET /api/apps/auth/workspace/activity
 * Get recent workspace-wide activity feed
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const action = searchParams.get('action');
      const userId = searchParams.get('userId');
      const projectId = searchParams.get('projectId');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const page = parseInt(searchParams.get('page') || '1');

      const skip = (page - 1) * limit;

      // Build filter
      const where: any = {
        workspaceId: context.workspace.id,
      };

      if (action) {
        where.action = action;
      }

      if (userId) {
        where.userId = userId;
      }

      // shortcut: Activity parents lack a relation; keep same-workspace active IDs until profiling justifies a database join.
      const visibleIssues = await prisma.issue.findMany({
        where: { workspaceId: context.workspace.id, ...(projectId ? { projectId } : {}) },
        select: { id: true },
      });
      where.itemId = { in: visibleIssues.map(issue => issue.id) };

      const [activities, total] = await Promise.all([
        prisma.issueActivity.findMany({
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
                image: true,
              },
            },
          },
        }),
        prisma.issueActivity.count({ where }),
      ]);

      // Get issue details for context
      const activityIssueIds = [...new Set(activities.map(a => a.itemId))];
      const issues = await prisma.issue.findMany({
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
              issuePrefix: true,
            },
          },
        },
      });
      const issueMap = new Map(issues.map(i => [i.id, i]));

      return NextResponse.json({
        activities: activities.map(activity => {
          const issue = issueMap.get(activity.itemId);
          return {
            id: activity.id,
            action: activity.action,
            itemType: activity.itemType,
            itemId: activity.itemId,
            fieldName: activity.fieldName,
            oldValue: activity.oldValue,
            newValue: activity.newValue,
            details: activity.details ? JSON.parse(activity.details) : null,
            user: activity.user,
            issue: issue ? {
              id: issue.id,
              issueKey: issue.issueKey,
              title: issue.title,
              type: issue.type,
              project: issue.project,
            } : null,
            createdAt: activity.createdAt,
          };
        }),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        filters: {
          action,
          userId,
          projectId,
          limit,
        },
      });
    } catch (error) {
      console.error('Error fetching workspace activity:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['workspace:read'] }
);
