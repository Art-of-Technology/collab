/**
 * Third-Party App API: Assignee Workload Report
 * GET /api/apps/auth/reports/assignee-workload - Get team workload analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/reports/assignee-workload
 * Get workload analysis for all team members
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');
      const includeCompleted = searchParams.get('includeCompleted') === 'true';
      const periodDays = parseInt(searchParams.get('period') || '30');

      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - periodDays);

      // Get final statuses
      const finalStatusQuery = projectId
        ? { projectId, isFinal: true, isActive: true }
        : { isFinal: true, isActive: true };

      const finalStatuses = await prisma.projectStatus.findMany({
        where: finalStatusQuery,
        select: { id: true },
      });
      const finalStatusIds = finalStatuses.map(s => s.id);

      // Get workspace members
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: context.workspace.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              team: true,
            },
          },
        },
      });

      // Build issue filter
      const baseIssueFilter: any = {
        workspaceId: context.workspace.id,
      };

      if (projectId) {
        baseIssueFilter.projectId = projectId;
      }

      if (!includeCompleted) {
        baseIssueFilter.statusId = { notIn: finalStatusIds };
      }

      // Get assignee workload data
      const assigneeData = await Promise.all(
        members.map(async (member) => {
          const [
            totalAssigned,
            overdueCount,
            completedInPeriod,
            storyPointsSum,
            byPriority,
          ] = await Promise.all([
            // Total assigned issues
            prisma.issue.count({
              where: {
                ...baseIssueFilter,
                assigneeId: member.userId,
              },
            }),
            // Overdue issues
            prisma.issue.count({
              where: {
                ...baseIssueFilter,
                assigneeId: member.userId,
                dueDate: { lt: new Date() },
                statusId: { notIn: finalStatusIds },
              },
            }),
            // Completed in period
            prisma.issue.count({
              where: {
                workspaceId: context.workspace.id,
                ...(projectId && { projectId }),
                assigneeId: member.userId,
                statusId: { in: finalStatusIds },
                updatedAt: { gte: periodStart },
              },
            }),
            // Total story points
            prisma.issue.aggregate({
              where: {
                ...baseIssueFilter,
                assigneeId: member.userId,
              },
              _sum: { storyPoints: true },
            }),
            // By priority
            prisma.issue.groupBy({
              by: ['priority'],
              where: {
                ...baseIssueFilter,
                assigneeId: member.userId,
              },
              _count: true,
            }),
          ]);

          // Calculate health status
          let healthStatus = 'healthy';
          if (overdueCount > 3 || (overdueCount > 0 && totalAssigned > 0 && overdueCount / totalAssigned > 0.2)) {
            healthStatus = 'at_risk';
          } else if (overdueCount > 0) {
            healthStatus = 'needs_attention';
          }

          const urgentCount = byPriority.find(p => p.priority === 'urgent')?._count || 0;
          const highCount = byPriority.find(p => p.priority === 'high')?._count || 0;

          return {
            user: member.user,
            role: member.role,
            workload: {
              totalAssigned,
              overdueCount,
              completedInPeriod,
              totalStoryPoints: storyPointsSum._sum.storyPoints || 0,
              byPriority: byPriority.reduce((acc, item) => {
                acc[item.priority] = item._count;
                return acc;
              }, {} as Record<string, number>),
            },
            health: {
              status: healthStatus,
              urgentCount,
              highPriorityCount: urgentCount + highCount,
            },
          };
        })
      );

      // Filter out members with no issues unless they have completed something
      const activeAssignees = assigneeData.filter(
        a => a.workload.totalAssigned > 0 || a.workload.completedInPeriod > 0
      );

      // Get unassigned count
      const unassignedIssues = await prisma.issue.count({
        where: {
          ...baseIssueFilter,
          assigneeId: null,
        },
      });

      // Calculate team summary
      const totalIssuesAssigned = activeAssignees.reduce((sum, a) => sum + a.workload.totalAssigned, 0);
      const totalOverdue = activeAssignees.reduce((sum, a) => sum + a.workload.overdueCount, 0);
      const totalStoryPoints = activeAssignees.reduce((sum, a) => sum + a.workload.totalStoryPoints, 0);

      return NextResponse.json({
        assignees: activeAssignees,
        teamSummary: {
          totalMembers: members.length,
          activeMembers: activeAssignees.length,
          totalIssuesAssigned,
          totalOverdue,
          totalStoryPoints,
          unassignedIssues,
          averageWorkload: activeAssignees.length > 0
            ? Math.round(totalIssuesAssigned / activeAssignees.length * 10) / 10
            : 0,
        },
        filters: {
          projectId,
          includeCompleted,
          periodDays,
        },
      });
    } catch (error) {
      console.error('Error generating assignee workload report:', error);
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
