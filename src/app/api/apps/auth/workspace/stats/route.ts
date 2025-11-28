/**
 * Third-Party App API: Workspace Stats Endpoint
 * GET /api/apps/auth/workspace/stats - Get comprehensive workspace statistics
 * 
 * Required scopes:
 * - workspace:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/workspace/stats
 * Get comprehensive workspace statistics
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const period = parseInt(searchParams.get('period') || '30'); // Days for velocity calculations

      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - period);

      // Get all statistics in parallel
      const [
        projectStats,
        issueStats,
        memberStats,
        viewStats,
        labelStats,
        issuesByType,
        issuesByPriority,
        recentlyCreated,
        recentlyCompleted,
        overdueIssues,
        unassignedIssues,
        activeProjects
      ] = await Promise.all([
        // Project counts
        prisma.project.aggregate({
          where: { workspaceId: context.workspace.id },
          _count: { id: true }
        }),

        // Issue counts
        prisma.issue.aggregate({
          where: { workspaceId: context.workspace.id },
          _count: { id: true }
        }),

        // Member counts
        prisma.workspaceMember.aggregate({
          where: { workspaceId: context.workspace.id },
          _count: { id: true }
        }),

        // View counts
        prisma.view.aggregate({
          where: { workspaceId: context.workspace.id },
          _count: { id: true }
        }),

        // Label counts
        prisma.taskLabel.aggregate({
          where: { workspaceId: context.workspace.id },
          _count: { id: true }
        }),

        // Issues by type
        prisma.issue.groupBy({
          by: ['type'],
          where: { workspaceId: context.workspace.id },
          _count: { id: true }
        }),

        // Issues by priority
        prisma.issue.groupBy({
          by: ['priority'],
          where: { workspaceId: context.workspace.id },
          _count: { id: true }
        }),

        // Recently created issues
        prisma.issue.count({
          where: {
            workspaceId: context.workspace.id,
            createdAt: { gte: periodStart }
          }
        }),

        // Recently completed issues
        prisma.issue.count({
          where: {
            workspaceId: context.workspace.id,
            updatedAt: { gte: periodStart },
            projectStatus: { isFinal: true }
          }
        }),

        // Overdue issues
        prisma.issue.count({
          where: {
            workspaceId: context.workspace.id,
            dueDate: { lt: new Date() },
            projectStatus: { isFinal: false }
          }
        }),

        // Unassigned issues
        prisma.issue.count({
          where: {
            workspaceId: context.workspace.id,
            assigneeId: null,
            projectStatus: { isFinal: false }
          }
        }),

        // Active projects (not archived)
        prisma.project.count({
          where: {
            workspaceId: context.workspace.id,
            OR: [
              { isArchived: false },
              { isArchived: null }
            ]
          }
        })
      ]);

      // Get completion rate
      const completedIssues = await prisma.issue.count({
        where: {
          workspaceId: context.workspace.id,
          projectStatus: { isFinal: true }
        }
      });

      const totalIssues = issueStats._count.id;
      const completionRate = totalIssues > 0 
        ? Math.round((completedIssues / totalIssues) * 100) 
        : 0;

      // Calculate velocity
      const weeksInPeriod = Math.max(period / 7, 1);
      const velocity = Math.round(recentlyCompleted / weeksInPeriod * 10) / 10;

      // Get top assignees
      const topAssignees = await prisma.issue.groupBy({
        by: ['assigneeId'],
        where: {
          workspaceId: context.workspace.id,
          assigneeId: { not: null },
          projectStatus: { isFinal: false }
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5
      });

      const assigneeIds = topAssignees
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

      const response = {
        workspaceId: context.workspace.id,
        workspaceName: context.workspace.name,
        period: {
          days: period,
          start: periodStart.toISOString(),
          end: new Date().toISOString()
        },
        overview: {
          projects: projectStats._count.id,
          activeProjects,
          issues: totalIssues,
          completedIssues,
          completionRate,
          members: memberStats._count.id,
          views: viewStats._count.id,
          labels: labelStats._count.id
        },
        health: {
          overdueIssues,
          unassignedIssues,
          healthScore: Math.max(0, 100 - (overdueIssues * 2) - (unassignedIssues))
        },
        velocity: {
          issuesCreated: recentlyCreated,
          issuesCompleted: recentlyCompleted,
          weeklyVelocity: velocity,
          periodDays: period
        },
        distribution: {
          byType: Object.fromEntries(
            issuesByType.map(item => [item.type, item._count.id])
          ),
          byPriority: Object.fromEntries(
            issuesByPriority.map(item => [item.priority, item._count.id])
          )
        },
        topAssignees: topAssignees.map(item => ({
          user: item.assigneeId ? assigneeMap.get(item.assigneeId) : null,
          activeIssues: item._count.id
        }))
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching workspace stats:', error);
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


