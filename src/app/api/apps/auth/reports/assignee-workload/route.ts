/**
 * Third-Party App API: Assignee Workload Report
 * GET /api/apps/auth/reports/assignee-workload - Get workload analysis by assignee
 * 
 * Required scopes:
 * - reports:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/reports/assignee-workload
 * Get detailed workload report for all assignees
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');
      const includeCompleted = searchParams.get('includeCompleted') === 'true';
      const period = parseInt(searchParams.get('period') || '30');

      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - period);

      // Base where clause
      const baseWhere: any = {
        workspaceId: context.workspace.id
      };

      if (projectId) {
        baseWhere.projectId = projectId;
      }

      if (!includeCompleted) {
        baseWhere.projectStatus = { isFinal: false };
      }

      // Get all workspace members
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: context.workspace.id },
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
      });

      // Get workload data for each member
      const workloadData = await Promise.all(
        members.map(async (member) => {
          const userId = member.userId;

          // Get assigned issues breakdown
          const [
            totalAssigned,
            byPriority,
            byStatus,
            byType,
            overdueCount,
            recentlyCompleted,
            storyPointsSum,
            upcomingDue
          ] = await Promise.all([
            // Total assigned
            prisma.issue.count({
              where: { ...baseWhere, assigneeId: userId }
            }),

            // By priority
            prisma.issue.groupBy({
              by: ['priority'],
              where: { ...baseWhere, assigneeId: userId },
              _count: { id: true }
            }),

            // By status (active statuses only)
            prisma.issue.findMany({
              where: { ...baseWhere, assigneeId: userId },
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

            // By type
            prisma.issue.groupBy({
              by: ['type'],
              where: { ...baseWhere, assigneeId: userId },
              _count: { id: true }
            }),

            // Overdue
            prisma.issue.count({
              where: {
                ...baseWhere,
                assigneeId: userId,
                dueDate: { lt: new Date() },
                projectStatus: { isFinal: false }
              }
            }),

            // Recently completed
            prisma.issue.count({
              where: {
                workspaceId: context.workspace.id,
                ...(projectId && { projectId }),
                assigneeId: userId,
                updatedAt: { gte: periodStart },
                projectStatus: { isFinal: true }
              }
            }),

            // Story points sum
            prisma.issue.aggregate({
              where: {
                ...baseWhere,
                assigneeId: userId,
                storyPoints: { not: null }
              },
              _sum: { storyPoints: true }
            }),

            // Upcoming due (next 7 days)
            prisma.issue.count({
              where: {
                ...baseWhere,
                assigneeId: userId,
                dueDate: {
                  gte: new Date(),
                  lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                },
                projectStatus: { isFinal: false }
              }
            })
          ]);

          // Group by status
          const statusCounts: Record<string, { count: number; displayName: string; color: string; isFinal: boolean }> = {};
          byStatus.forEach(issue => {
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
            }
          });

          return {
            user: member.user,
            memberRole: member.role,
            workload: {
              totalAssigned,
              overdueCount,
              upcomingDue,
              totalStoryPoints: storyPointsSum._sum.storyPoints || 0,
              recentlyCompleted,
              completionRate: period > 0 && totalAssigned > 0
                ? Math.round((recentlyCompleted / (totalAssigned + recentlyCompleted)) * 100)
                : 0
            },
            breakdown: {
              byPriority: Object.fromEntries(
                byPriority.map(item => [item.priority, item._count.id])
              ),
              byStatus: Object.fromEntries(
                Object.entries(statusCounts).map(([name, data]) => [name, data])
              ),
              byType: Object.fromEntries(
                byType.map(item => [item.type, item._count.id])
              )
            },
            health: {
              workloadScore: calculateWorkloadScore(totalAssigned, overdueCount, upcomingDue),
              status: getWorkloadStatus(totalAssigned, overdueCount)
            }
          };
        })
      );

      // Sort by total assigned (highest first)
      workloadData.sort((a, b) => b.workload.totalAssigned - a.workload.totalAssigned);

      // Get unassigned issues
      const unassignedCount = await prisma.issue.count({
        where: {
          ...baseWhere,
          assigneeId: null
        }
      });

      // Calculate team summary
      const teamSummary = {
        totalMembers: members.length,
        activeMembers: workloadData.filter(w => w.workload.totalAssigned > 0).length,
        totalIssuesAssigned: workloadData.reduce((sum, w) => sum + w.workload.totalAssigned, 0),
        totalOverdue: workloadData.reduce((sum, w) => sum + w.workload.overdueCount, 0),
        unassignedIssues: unassignedCount,
        averageWorkload: workloadData.length > 0
          ? Math.round(workloadData.reduce((sum, w) => sum + w.workload.totalAssigned, 0) / workloadData.length)
          : 0
      };

      const response = {
        period: {
          days: period,
          start: periodStart.toISOString(),
          end: new Date().toISOString()
        },
        filters: {
          projectId,
          includeCompleted
        },
        teamSummary,
        assignees: workloadData
      };

      return NextResponse.json(response);

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
  { requiredScopes: ['reports:read'] }
);

/**
 * Calculate workload score (0-100)
 */
function calculateWorkloadScore(total: number, overdue: number, upcoming: number): number {
  // Base score starts at 100
  let score = 100;

  // Deduct for overdue issues (high penalty)
  score -= overdue * 10;

  // Deduct for upcoming due issues (medium penalty)
  score -= upcoming * 3;

  // Deduct if workload is too high (> 15 active issues)
  if (total > 15) {
    score -= (total - 15) * 2;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Get workload status label
 */
function getWorkloadStatus(total: number, overdue: number): string {
  if (overdue > 3) return 'critical';
  if (overdue > 0 || total > 15) return 'at_risk';
  if (total > 10) return 'high';
  if (total > 5) return 'moderate';
  if (total > 0) return 'healthy';
  return 'available';
}


