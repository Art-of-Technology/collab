/**
 * Third-Party App API: Project Activity Endpoint
 * GET /api/apps/auth/projects/:projectId/activity - Get project activity
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/projects/:projectId/activity
 * Get recent activity for a project
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;
      const { searchParams } = new URL(request.url);
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const action = searchParams.get('action');

      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: context.workspace.id,
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Project not found' },
          { status: 404 }
        );
      }

      // Get issue IDs in this project
      const issues = await prisma.issue.findMany({
        where: { projectId },
        select: { id: true, issueKey: true },
      });
      const issueIds = issues.map(i => i.id);
      const issueKeyMap = new Map(issues.map(i => [i.id, i.issueKey]));

      if (issueIds.length === 0) {
        return NextResponse.json({
          projectId,
          projectName: project.name,
          activities: [],
          total: 0,
        });
      }

      // Build filter
      const where: any = {
        itemType: 'ISSUE',
        itemId: { in: issueIds },
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
        projectId,
        projectName: project.name,
        activities: activities.map(activity => ({
          id: activity.id,
          action: activity.action,
          fieldName: activity.fieldName,
          oldValue: activity.oldValue,
          newValue: activity.newValue,
          details: activity.details ? JSON.parse(activity.details) : null,
          itemId: activity.itemId,
          issueKey: issueKeyMap.get(activity.itemId),
          user: activity.user,
          createdAt: activity.createdAt,
        })),
        total: activities.length,
      });
    } catch (error) {
      console.error('Error fetching project activity:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['projects:read'] }
);
