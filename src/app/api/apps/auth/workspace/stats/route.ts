/**
 * Third-Party App API: Workspace Statistics
 * GET /api/apps/auth/workspace/stats - Get comprehensive workspace statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * GET /api/apps/auth/workspace/stats
 * Get comprehensive workspace statistics including velocity and health
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const periodDays = parseInt(searchParams.get('period') || '30');

      const now = new Date();
      const periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - periodDays);

      // Get final statuses
      const finalStatuses = await prisma.projectStatus.findMany({
        where: {
          project: { workspaceId: context.workspace.id },
          isFinal: true,
          isActive: true,
        },
        select: { id: true },
      });
      const finalStatusIds = finalStatuses.map(s => s.id);

      // Get overview stats
      const [
        totalIssues,
        completedIssues,
        overdueIssues,
        unassignedIssues,
        totalProjects,
        activeProjects,
        totalMembers,
        byType,
        byPriority,
        createdInPeriod,
        completedInPeriod,
      ] = await Promise.all([
        prisma.issue.count({ where: { workspaceId: context.workspace.id } }),
        prisma.issue.count({
          where: {
            workspaceId: context.workspace.id,
            statusId: { in: finalStatusIds },
          },
        }),
        prisma.issue.count({
          where: {
            workspaceId: context.workspace.id,
            dueDate: { lt: now },
            statusId: { notIn: finalStatusIds },
          },
        }),
        prisma.issue.count({
          where: {
            workspaceId: context.workspace.id,
            assigneeId: null,
            statusId: { notIn: finalStatusIds },
          },
        }),
        prisma.project.count({
          where: { workspaceId: context.workspace.id },
        }),
        prisma.project.count({
          where: {
            workspaceId: context.workspace.id,
            OR: [{ isArchived: false }, { isArchived: null }],
          },
        }),
        prisma.workspaceMember.count({
          where: { workspaceId: context.workspace.id },
        }),
        prisma.issue.groupBy({
          by: ['type'],
          where: { workspaceId: context.workspace.id },
          _count: true,
        }),
        prisma.issue.groupBy({
          by: ['priority'],
          where: { workspaceId: context.workspace.id },
          _count: true,
        }),
        prisma.issue.count({
          where: {
            workspaceId: context.workspace.id,
            createdAt: { gte: periodStart },
          },
        }),
        prisma.issue.count({
          where: {
            workspaceId: context.workspace.id,
            statusId: { in: finalStatusIds },
            updatedAt: { gte: periodStart },
          },
        }),
      ]);

      // Calculate velocity
      const weeksInPeriod = periodDays / 7;
      const weeklyVelocity = weeksInPeriod > 0 ? Math.round(completedInPeriod / weeksInPeriod * 10) / 10 : 0;
      const weeklyCreation = weeksInPeriod > 0 ? Math.round(createdInPeriod / weeksInPeriod * 10) / 10 : 0;

      // Calculate health score (0-100)
      const openIssues = totalIssues - completedIssues;
      const overdueRatio = openIssues > 0 ? overdueIssues / openIssues : 0;
      const unassignedRatio = openIssues > 0 ? unassignedIssues / openIssues : 0;
      const completionRate = totalIssues > 0 ? completedIssues / totalIssues : 1;

      let healthScore = 100;
      healthScore -= overdueRatio * 40; // Overdue penalty
      healthScore -= unassignedRatio * 20; // Unassigned penalty
      healthScore -= (1 - completionRate) * 20; // Low completion penalty

      // Velocity trend bonus/penalty
      if (weeklyVelocity > weeklyCreation) {
        healthScore += 10; // Clearing backlog
      } else if (weeklyCreation > weeklyVelocity * 1.5) {
        healthScore -= 10; // Backlog growing
      }

      healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

      // Determine health status
      let healthStatus = 'healthy';
      if (healthScore < 50) healthStatus = 'at_risk';
      else if (healthScore < 70) healthStatus = 'needs_attention';

      return NextResponse.json({
        overview: {
          issues: totalIssues,
          completedIssues,
          openIssues,
          completionRate: totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0,
          projects: totalProjects,
          activeProjects,
          members: totalMembers,
        },
        health: {
          healthScore,
          healthStatus,
          overdueIssues,
          unassignedIssues,
          overduePercentage: openIssues > 0 ? Math.round(overdueRatio * 100) : 0,
        },
        velocity: {
          periodDays,
          issuesCreated: createdInPeriod,
          issuesCompleted: completedInPeriod,
          weeklyVelocity,
          weeklyCreation,
          netChange: createdInPeriod - completedInPeriod,
          trend: weeklyVelocity > weeklyCreation ? 'improving' : weeklyVelocity < weeklyCreation ? 'declining' : 'stable',
        },
        distribution: {
          byType: byType.reduce((acc, item) => {
            acc[item.type] = item._count;
            return acc;
          }, {} as Record<string, number>),
          byPriority: byPriority.reduce((acc, item) => {
            acc[item.priority] = item._count;
            return acc;
          }, {} as Record<string, number>),
        },
      });
    } catch (error) {
      console.error('Error fetching workspace stats:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['workspace:read'] }
);
