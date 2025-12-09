/**
 * Third-Party App API: Issue Summary Report
 * GET /api/apps/auth/reports/issue-summary - Get aggregated issue statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/reports/issue-summary
 * Get aggregated issue statistics with breakdowns
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');
      const periodDays = parseInt(searchParams.get('period') || '30');
      const comparePeriod = searchParams.get('comparePeriod') === 'true';

      const now = new Date();
      const periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - periodDays);

      const previousPeriodEnd = new Date(periodStart);
      const previousPeriodStart = new Date(previousPeriodEnd);
      previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays);

      // Base filter
      const baseFilter: any = {
        workspaceId: context.workspace.id,
      };

      if (projectId) {
        baseFilter.projectId = projectId;
      }

      // Get final statuses
      const finalStatusQuery = projectId
        ? { projectId, isFinal: true, isActive: true }
        : { isFinal: true, isActive: true };

      const finalStatuses = await prisma.projectStatus.findMany({
        where: finalStatusQuery,
        select: { id: true },
      });
      const finalStatusIds = finalStatuses.map(s => s.id);

      // Get all stats
      const [
        total,
        completed,
        overdue,
        storyPointsSum,
        byType,
        byPriority,
        byStatus,
        createdInPeriod,
        completedInPeriod,
      ] = await Promise.all([
        // Total issues
        prisma.issue.count({ where: baseFilter }),
        // Completed issues
        prisma.issue.count({
          where: { ...baseFilter, statusId: { in: finalStatusIds } },
        }),
        // Overdue issues
        prisma.issue.count({
          where: {
            ...baseFilter,
            dueDate: { lt: now },
            statusId: { notIn: finalStatusIds },
          },
        }),
        // Total story points
        prisma.issue.aggregate({
          where: baseFilter,
          _sum: { storyPoints: true },
        }),
        // By type
        prisma.issue.groupBy({
          by: ['type'],
          where: baseFilter,
          _count: true,
        }),
        // By priority
        prisma.issue.groupBy({
          by: ['priority'],
          where: baseFilter,
          _count: true,
        }),
        // By status
        prisma.issue.groupBy({
          by: ['statusId'],
          where: baseFilter,
          _count: true,
        }),
        // Created in period
        prisma.issue.count({
          where: { ...baseFilter, createdAt: { gte: periodStart } },
        }),
        // Completed in period
        prisma.issue.count({
          where: {
            ...baseFilter,
            statusId: { in: finalStatusIds },
            updatedAt: { gte: periodStart },
          },
        }),
      ]);

      // Get status details
      const allStatuses = await prisma.projectStatus.findMany({
        where: projectId
          ? { projectId, isActive: true }
          : { project: { workspaceId: context.workspace.id }, isActive: true },
        select: { id: true, name: true, displayName: true, color: true, isFinal: true },
      });

      // Calculate velocity
      const weeksInPeriod = periodDays / 7;
      const weeklyCreationRate = weeksInPeriod > 0 ? Math.round(createdInPeriod / weeksInPeriod * 10) / 10 : 0;
      const weeklyCompletionRate = weeksInPeriod > 0 ? Math.round(completedInPeriod / weeksInPeriod * 10) / 10 : 0;

      // Build type distribution with percentages
      const typeDistribution = byType.map(t => ({
        type: t.type,
        count: t._count,
        percentage: total > 0 ? Math.round((t._count / total) * 100) : 0,
      }));

      // Build priority distribution with percentages
      const priorityDistribution = byPriority.map(p => ({
        priority: p.priority,
        count: p._count,
        percentage: total > 0 ? Math.round((p._count / total) * 100) : 0,
      }));

      // Build status distribution with details
      const statusDistribution = byStatus.map(s => {
        const statusDetails = allStatuses.find(st => st.id === s.statusId);
        return {
          statusId: s.statusId,
          name: statusDetails?.name,
          displayName: statusDetails?.displayName,
          color: statusDetails?.color,
          isFinal: statusDetails?.isFinal,
          count: s._count,
          percentage: total > 0 ? Math.round((s._count / total) * 100) : 0,
        };
      });

      const response: any = {
        overview: {
          total,
          completed,
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          open: total - completed,
          overdue,
          totalStoryPoints: storyPointsSum._sum.storyPoints || 0,
        },
        velocity: {
          periodDays,
          createdInPeriod,
          completedInPeriod,
          weeklyCreationRate,
          weeklyCompletionRate,
          netChange: createdInPeriod - completedInPeriod,
        },
        distribution: {
          byType: typeDistribution,
          byPriority: priorityDistribution,
          byStatus: statusDistribution,
        },
        filters: {
          projectId,
          periodDays,
        },
      };

      // Add comparison data if requested
      if (comparePeriod) {
        const [prevCreated, prevCompleted] = await Promise.all([
          prisma.issue.count({
            where: {
              ...baseFilter,
              createdAt: { gte: previousPeriodStart, lt: previousPeriodEnd },
            },
          }),
          prisma.issue.count({
            where: {
              ...baseFilter,
              statusId: { in: finalStatusIds },
              updatedAt: { gte: previousPeriodStart, lt: previousPeriodEnd },
            },
          }),
        ]);

        response.comparison = {
          previousPeriod: {
            created: prevCreated,
            completed: prevCompleted,
          },
          changes: {
            created: createdInPeriod - prevCreated,
            completed: completedInPeriod - prevCompleted,
            createdPercent: prevCreated > 0
              ? Math.round(((createdInPeriod - prevCreated) / prevCreated) * 100)
              : createdInPeriod > 0 ? 100 : 0,
            completedPercent: prevCompleted > 0
              ? Math.round(((completedInPeriod - prevCompleted) / prevCompleted) * 100)
              : completedInPeriod > 0 ? 100 : 0,
          },
        };
      }

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
  { requiredScopes: ['workspace:read'] }
);
