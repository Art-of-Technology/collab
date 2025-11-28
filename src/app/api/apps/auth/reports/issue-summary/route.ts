/**
 * Third-Party App API: Issue Summary Report
 * GET /api/apps/auth/reports/issue-summary - Get aggregated issue statistics
 * 
 * Required scopes:
 * - reports:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/reports/issue-summary
 * Get comprehensive issue summary with various breakdowns
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');
      const projectIds = searchParams.get('projectIds')?.split(',');
      const period = parseInt(searchParams.get('period') || '30');
      const comparePeriod = searchParams.get('comparePeriod') === 'true';

      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - period);

      const previousPeriodEnd = new Date(periodStart);
      const previousPeriodStart = new Date(periodStart);
      previousPeriodStart.setDate(previousPeriodStart.getDate() - period);

      // Base where clause
      const baseWhere: any = {
        workspaceId: context.workspace.id
      };

      if (projectId) {
        baseWhere.projectId = projectId;
      } else if (projectIds && projectIds.length > 0) {
        baseWhere.projectId = { in: projectIds };
      }

      // Get all statistics in parallel
      const [
        totalIssues,
        issuesByType,
        issuesByPriority,
        issuesByStatus,
        createdInPeriod,
        completedInPeriod,
        overdueIssues,
        issuesWithDueDate,
        issuesWithStoryPoints,
        avgStoryPoints,
        issuesByProject
      ] = await Promise.all([
        // Total issues
        prisma.issue.count({ where: baseWhere }),

        // By type
        prisma.issue.groupBy({
          by: ['type'],
          where: baseWhere,
          _count: { id: true }
        }),

        // By priority
        prisma.issue.groupBy({
          by: ['priority'],
          where: baseWhere,
          _count: { id: true }
        }),

        // By status
        prisma.issue.findMany({
          where: baseWhere,
          select: {
            projectStatus: {
              select: {
                name: true,
                displayName: true,
                color: true,
                isFinal: true
              }
            }
          }
        }),

        // Created in period
        prisma.issue.count({
          where: {
            ...baseWhere,
            createdAt: { gte: periodStart }
          }
        }),

        // Completed in period
        prisma.issue.count({
          where: {
            ...baseWhere,
            updatedAt: { gte: periodStart },
            projectStatus: { isFinal: true }
          }
        }),

        // Overdue
        prisma.issue.count({
          where: {
            ...baseWhere,
            dueDate: { lt: new Date() },
            projectStatus: { isFinal: false }
          }
        }),

        // With due date
        prisma.issue.count({
          where: {
            ...baseWhere,
            dueDate: { not: null }
          }
        }),

        // With story points
        prisma.issue.count({
          where: {
            ...baseWhere,
            storyPoints: { not: null }
          }
        }),

        // Average story points
        prisma.issue.aggregate({
          where: {
            ...baseWhere,
            storyPoints: { not: null }
          },
          _avg: { storyPoints: true },
          _sum: { storyPoints: true }
        }),

        // By project (if not filtered to single project)
        !projectId ? prisma.issue.groupBy({
          by: ['projectId'],
          where: baseWhere,
          _count: { id: true }
        }) : Promise.resolve([])
      ]);

      // Group by status
      const statusCounts: Record<string, { count: number; displayName: string; color: string; isFinal: boolean }> = {};
      let completedCount = 0;
      issuesByStatus.forEach(issue => {
        if (issue.projectStatus) {
          const status = issue.projectStatus;
          if (!statusCounts[status.name]) {
            statusCounts[status.name] = {
              count: 0,
              displayName: status.displayName,
              color: status.color,
              isFinal: status.isFinal
            };
          }
          statusCounts[status.name].count++;
          if (status.isFinal) completedCount++;
        }
      });

      // Get project details if needed
      let projectBreakdown: any[] = [];
      if (!projectId && issuesByProject.length > 0) {
        const projectDetails = await prisma.project.findMany({
          where: { 
            id: { in: issuesByProject.map(p => p.projectId) },
            workspaceId: context.workspace.id
          },
          select: {
            id: true,
            name: true,
            slug: true,
            color: true
          }
        });

        const projectMap = new Map(projectDetails.map(p => [p.id, p]));

        projectBreakdown = issuesByProject.map(item => ({
          project: projectMap.get(item.projectId),
          count: item._count.id,
          percentage: totalIssues > 0 
            ? Math.round((item._count.id / totalIssues) * 100) 
            : 0
        })).sort((a, b) => b.count - a.count);
      }

      // Get comparison data if requested
      let comparison: any = null;
      if (comparePeriod) {
        const [prevCreated, prevCompleted] = await Promise.all([
          prisma.issue.count({
            where: {
              ...baseWhere,
              createdAt: { gte: previousPeriodStart, lt: previousPeriodEnd }
            }
          }),
          prisma.issue.count({
            where: {
              ...baseWhere,
              updatedAt: { gte: previousPeriodStart, lt: previousPeriodEnd },
              projectStatus: { isFinal: true }
            }
          })
        ]);

        comparison = {
          previousPeriod: {
            start: previousPeriodStart.toISOString(),
            end: previousPeriodEnd.toISOString(),
            created: prevCreated,
            completed: prevCompleted
          },
          changes: {
            created: createdInPeriod - prevCreated,
            createdPercent: prevCreated > 0 
              ? Math.round(((createdInPeriod - prevCreated) / prevCreated) * 100) 
              : null,
            completed: completedInPeriod - prevCompleted,
            completedPercent: prevCompleted > 0 
              ? Math.round(((completedInPeriod - prevCompleted) / prevCompleted) * 100) 
              : null
          }
        };
      }

      // Calculate metrics
      const completionRate = totalIssues > 0 
        ? Math.round((completedCount / totalIssues) * 100) 
        : 0;

      const weeksInPeriod = Math.max(period / 7, 1);
      const creationVelocity = Math.round(createdInPeriod / weeksInPeriod * 10) / 10;
      const completionVelocity = Math.round(completedInPeriod / weeksInPeriod * 10) / 10;

      const response = {
        period: {
          days: period,
          start: periodStart.toISOString(),
          end: new Date().toISOString()
        },
        filters: {
          projectId: projectId || projectIds
        },
        overview: {
          total: totalIssues,
          completed: completedCount,
          completionRate,
          overdue: overdueIssues,
          withDueDate: issuesWithDueDate,
          withStoryPoints: issuesWithStoryPoints,
          totalStoryPoints: avgStoryPoints._sum.storyPoints || 0,
          averageStoryPoints: avgStoryPoints._avg.storyPoints 
            ? Math.round(avgStoryPoints._avg.storyPoints * 10) / 10 
            : null
        },
        velocity: {
          createdInPeriod,
          completedInPeriod,
          netChange: createdInPeriod - completedInPeriod,
          weeklyCreationRate: creationVelocity,
          weeklyCompletionRate: completionVelocity
        },
        distribution: {
          byType: issuesByType.map(item => ({
            type: item.type,
            count: item._count.id,
            percentage: totalIssues > 0 
              ? Math.round((item._count.id / totalIssues) * 100) 
              : 0
          })),
          byPriority: issuesByPriority.map(item => ({
            priority: item.priority,
            count: item._count.id,
            percentage: totalIssues > 0 
              ? Math.round((item._count.id / totalIssues) * 100) 
              : 0
          })),
          byStatus: Object.entries(statusCounts).map(([name, data]) => ({
            name,
            displayName: data.displayName,
            color: data.color,
            isFinal: data.isFinal,
            count: data.count,
            percentage: totalIssues > 0 
              ? Math.round((data.count / totalIssues) * 100) 
              : 0
          }))
        },
        ...(projectBreakdown.length > 0 && { byProject: projectBreakdown }),
        ...(comparison && { comparison })
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error generating issue summary report:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['reports:read'] }
);


