/**
 * Third-Party App API: Project Activity Endpoint
 * GET /api/apps/auth/projects/[projectId]/activity - Get project activity feed
 * 
 * Required scopes:
 * - projects:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/projects/[projectId]/activity
 * Get recent activity for a project
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
      const action = searchParams.get('action'); // Filter by action type
      const userId = searchParams.get('userId'); // Filter by user

      const skip = (page - 1) * limit;

      // Verify project exists and belongs to workspace
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: context.workspace.id
        }
      });

      if (!project) {
        return NextResponse.json(
          { error: 'project_not_found', error_description: 'Project not found' },
          { status: 404 }
        );
      }

      // Get issue IDs for this project
      const projectIssues = await prisma.issue.findMany({
        where: { projectId: project.id },
        select: { id: true }
      });

      const issueIds = projectIssues.map(i => i.id);

      // Build where clause
      const where: any = {
        itemType: 'ISSUE',
        itemId: { in: issueIds }
      };

      if (action) {
        where.action = action;
      }

      if (userId) {
        where.userId = userId;
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
      const activityIssueIds = [...new Set(activities.map(a => a.itemId))];
      
      if (activityIssueIds.length > 0) {
        const issueDetails = await prisma.issue.findMany({
          where: { id: { in: activityIssueIds } },
          select: {
            id: true,
            issueKey: true,
            title: true,
            type: true
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

        return {
          id: activity.id,
          action: activity.action,
          fieldName: activity.fieldName,
          oldValue: activity.oldValue,
          newValue: activity.newValue,
          details: parsedDetails,
          createdAt: activity.createdAt,
          user: activity.user,
          issue: issueDetailsMap.get(activity.itemId) || null
        };
      });

      const response = {
        projectId: project.id,
        projectName: project.name,
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


