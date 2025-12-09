/**
 * Third-Party App API: Issue Activity Endpoint
 * GET /api/apps/auth/issues/:issueIdOrKey/activity - Get issue activity/history
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * GET /api/apps/auth/issues/:issueIdOrKey/activity
 * Get activity/history log for an issue
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const { searchParams } = new URL(request.url);
      const action = searchParams.get('action');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

      // Find the issue
      const issue = await prisma.issue.findFirst({
        where: {
          workspaceId: context.workspace.id,
          OR: [
            { id: issueIdOrKey },
            { issueKey: issueIdOrKey },
          ],
        },
      });

      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Build filter
      const where: any = {
        itemType: 'ISSUE',
        itemId: issue.id,
      };

      if (action) {
        where.action = action;
      }

      const activities = await prisma.boardItemActivity.findMany({
        where,
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
      });

      return NextResponse.json({
        issueKey: issue.issueKey,
        issueId: issue.id,
        activities: activities.map(activity => ({
          id: activity.id,
          action: activity.action,
          fieldName: activity.fieldName,
          oldValue: activity.oldValue,
          newValue: activity.newValue,
          details: activity.details ? JSON.parse(activity.details) : null,
          user: activity.user,
          createdAt: activity.createdAt,
        })),
        total: activities.length,
      });
    } catch (error) {
      console.error('Error fetching issue activity:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:read'] }
);
