/**
 * Third-Party App API: Project Stats Endpoint
 * GET /api/apps/auth/projects/[projectId]/stats - Get project statistics
 * 
 * Required scopes:
 * - projects:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/projects/[projectId]/stats
 * Get comprehensive project statistics
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') || '30'; // Days to look back for velocity

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

      const periodDays = parseInt(period);
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - periodDays);

      // Get all statistics in parallel
      const [
        totalIssues,
        issuesByType,
        issuesByPriority,
        issuesByStatus,
        issuesByAssignee,
        recentlyCreated,
        recentlyCompleted,
        overdueIssues,
        upcomingDue,
        unassignedIssues,
        avgStoryPoints
      ] = await Promise.all([
        // Total issues
        prisma.issue.count({
          where: { projectId: project.id }
        }),

        // Issues by type
        prisma.issue.groupBy({
          by: ['type'],
          where: { projectId: project.id },
          _count: { id: true }
        }),

        // Issues by priority
        prisma.issue.groupBy({
          by: ['priority'],
          where: { projectId: project.id },
          _count: { id: true }
        }),

        // Issues by status (with status info)
        prisma.projectStatus.findMany({
          where: { projectId: project.id, isActive: true },
          orderBy: { order: 'asc' },
          include: {
            _count: {
              select: { issues: true }
            }
          }
        }),

        // Issues by assignee (top 10)
        prisma.issue.groupBy({
          by: ['assigneeId'],
          where: { 
            projectId: project.id,
            assigneeId: { not: null }
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10
        }),

        // Recently created (in period)
        prisma.issue.count({
          where: {
            projectId: project.id,
            createdAt: { gte: periodStart }
          }
        }),

        // Recently completed (in period)
        prisma.issue.count({
          where: {
            projectId: project.id,
            updatedAt: { gte: periodStart },
            projectStatus: { isFinal: true }
          }
        }),

        // Overdue issues
        prisma.issue.count({
          where: {
            projectId: project.id,
            dueDate: { lt: new Date() },
            projectStatus: { isFinal: false }
          }
        }),

        // Upcoming due (next 7 days)
        prisma.issue.count({
          where: {
            projectId: project.id,
            dueDate: {
              gte: new Date(),
              lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            },
            projectStatus: { isFinal: false }
          }
        }),

        // Unassigned issues
        prisma.issue.count({
          where: {
            projectId: project.id,
            assigneeId: null,
            projectStatus: { isFinal: false }
          }
        }),

        // Average story points
        prisma.issue.aggregate({
          where: {
            projectId: project.id,
            storyPoints: { not: null }
          },
          _avg: { storyPoints: true }
        })
      ]);

      // Get assignee details for the top assignees
      const assigneeIds = issuesByAssignee
        .map(a => a.assigneeId)
        .filter((id): id is string => id !== null);

      const assigneeDetails = await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        }
      });

      const assigneeMap = new Map(assigneeDetails.map(a => [a.id, a]));

      // Calculate completion rate
      const completedCount = issuesByStatus
        .filter(s => s.isFinal)
        .reduce((sum, s) => sum + s._count.issues, 0);
      const completionRate = totalIssues > 0 
        ? Math.round((completedCount / totalIssues) * 100) 
        : 0;

      // Calculate velocity (issues completed per week in period)
      const weeksInPeriod = Math.max(periodDays / 7, 1);
      const velocity = Math.round(recentlyCompleted / weeksInPeriod * 10) / 10;

      const response = {
        projectId: project.id,
        projectName: project.name,
        period: {
          days: periodDays,
          start: periodStart.toISOString(),
          end: new Date().toISOString()
        },
        overview: {
          totalIssues,
          completedIssues: completedCount,
          completionRate,
          overdueIssues,
          upcomingDue,
          unassignedIssues,
          averageStoryPoints: avgStoryPoints._avg.storyPoints 
            ? Math.round(avgStoryPoints._avg.storyPoints * 10) / 10 
            : null
        },
        velocity: {
          issuesCreated: recentlyCreated,
          issuesCompleted: recentlyCompleted,
          weeklyVelocity: velocity,
          periodDays
        },
        byType: Object.fromEntries(
          issuesByType.map(item => [item.type, item._count.id])
        ),
        byPriority: Object.fromEntries(
          issuesByPriority.map(item => [item.priority, item._count.id])
        ),
        byStatus: issuesByStatus.map(status => ({
          id: status.id,
          name: status.name,
          displayName: status.displayName,
          color: status.color,
          isFinal: status.isFinal,
          count: status._count.issues,
          percentage: totalIssues > 0 
            ? Math.round((status._count.issues / totalIssues) * 100) 
            : 0
        })),
        byAssignee: issuesByAssignee.map(item => ({
          assignee: item.assigneeId ? assigneeMap.get(item.assigneeId) : null,
          count: item._count.id,
          percentage: totalIssues > 0 
            ? Math.round((item._count.id / totalIssues) * 100) 
            : 0
        }))
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching project stats:', error);
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


