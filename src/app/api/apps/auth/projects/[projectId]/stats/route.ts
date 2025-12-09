/**
 * Third-Party App API: Project Statistics Endpoint
 * GET /api/apps/auth/projects/:projectId/stats - Get project statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * GET /api/apps/auth/projects/:projectId/stats
 * Get comprehensive statistics for a project
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;
      const { searchParams } = new URL(request.url);
      const periodDays = parseInt(searchParams.get('period') || '30');

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

      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - periodDays);

      // Get final statuses
      const finalStatuses = await prisma.projectStatus.findMany({
        where: {
          projectId,
          isFinal: true,
          isActive: true,
        },
        select: { id: true },
      });
      const finalStatusIds = finalStatuses.map(s => s.id);

      // Get various counts
      const [
        totalIssues,
        completedIssues,
        overdueIssues,
        unassignedIssues,
        byType,
        byPriority,
        byStatus,
        issuesCreatedInPeriod,
        issuesCompletedInPeriod,
      ] = await Promise.all([
        prisma.issue.count({ where: { projectId } }),
        prisma.issue.count({
          where: {
            projectId,
            statusId: { in: finalStatusIds },
          },
        }),
        prisma.issue.count({
          where: {
            projectId,
            dueDate: { lt: new Date() },
            statusId: { notIn: finalStatusIds },
          },
        }),
        prisma.issue.count({
          where: {
            projectId,
            assigneeId: null,
          },
        }),
        prisma.issue.groupBy({
          by: ['type'],
          where: { projectId },
          _count: true,
        }),
        prisma.issue.groupBy({
          by: ['priority'],
          where: { projectId },
          _count: true,
        }),
        prisma.issue.groupBy({
          by: ['statusId'],
          where: { projectId },
          _count: true,
        }),
        prisma.issue.count({
          where: {
            projectId,
            createdAt: { gte: periodStart },
          },
        }),
        prisma.issue.count({
          where: {
            projectId,
            statusId: { in: finalStatusIds },
            updatedAt: { gte: periodStart },
          },
        }),
      ]);

      // Get status details for status distribution
      const allStatuses = await prisma.projectStatus.findMany({
        where: { projectId, isActive: true },
        select: { id: true, name: true, displayName: true, color: true, isFinal: true },
      });

      const byStatusWithDetails = byStatus.map(s => {
        const statusDetails = allStatuses.find(st => st.id === s.statusId);
        return {
          statusId: s.statusId,
          name: statusDetails?.name,
          displayName: statusDetails?.displayName,
          color: statusDetails?.color,
          isFinal: statusDetails?.isFinal,
          count: s._count,
        };
      });

      // Calculate velocity
      const weeksInPeriod = periodDays / 7;
      const weeklyVelocity = weeksInPeriod > 0 ? Math.round(issuesCompletedInPeriod / weeksInPeriod * 10) / 10 : 0;

      return NextResponse.json({
        projectId,
        projectName: project.name,
        overview: {
          totalIssues,
          completedIssues,
          completionRate: totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0,
          overdueIssues,
          unassignedIssues,
          openIssues: totalIssues - completedIssues,
        },
        velocity: {
          periodDays,
          issuesCreated: issuesCreatedInPeriod,
          issuesCompleted: issuesCompletedInPeriod,
          weeklyVelocity,
          netChange: issuesCreatedInPeriod - issuesCompletedInPeriod,
        },
        byType: byType.reduce((acc, item) => {
          acc[item.type] = item._count;
          return acc;
        }, {} as Record<string, number>),
        byPriority: byPriority.reduce((acc, item) => {
          acc[item.priority] = item._count;
          return acc;
        }, {} as Record<string, number>),
        byStatus: byStatusWithDetails,
      });
    } catch (error) {
      console.error('Error fetching project stats:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['projects:read'] }
);
