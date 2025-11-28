/**
 * Third-Party App API: Timeline Report
 * GET /api/apps/auth/reports/timeline - Get issues by due date and timeline
 * 
 * Required scopes:
 * - reports:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/reports/timeline
 * Get timeline view of issues with due dates
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');
      const assigneeId = searchParams.get('assigneeId');
      const includeCompleted = searchParams.get('includeCompleted') === 'true';
      const daysAhead = parseInt(searchParams.get('daysAhead') || '30');
      const daysBehind = parseInt(searchParams.get('daysBehind') || '7');

      const now = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBehind);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + daysAhead);

      // Base where clause
      const baseWhere: any = {
        workspaceId: context.workspace.id,
        dueDate: { not: null }
      };

      if (projectId) {
        baseWhere.projectId = projectId;
      }

      if (assigneeId) {
        baseWhere.assigneeId = assigneeId;
      }

      if (!includeCompleted) {
        baseWhere.projectStatus = { isFinal: false };
      }

      // Get overdue issues
      const overdueIssues = await prisma.issue.findMany({
        where: {
          ...baseWhere,
          dueDate: { lt: now },
          projectStatus: { isFinal: false }
        },
        orderBy: { dueDate: 'asc' },
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              color: true
            }
          },
          projectStatus: {
            select: {
              id: true,
              name: true,
              displayName: true,
              color: true
            }
          },
          labels: {
            select: {
              id: true,
              name: true,
              color: true
            }
          }
        }
      });

      // Get upcoming issues (grouped by date range)
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const thisWeekEnd = new Date(todayStart);
      thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

      const thisMonthEnd = new Date(todayStart);
      thisMonthEnd.setDate(thisMonthEnd.getDate() + 30);

      const [dueToday, dueThisWeek, dueThisMonth, dueLater] = await Promise.all([
        // Due today
        prisma.issue.findMany({
          where: {
            ...baseWhere,
            dueDate: { gte: todayStart, lt: todayEnd }
          },
          orderBy: { dueDate: 'asc' },
          include: {
            assignee: {
              select: { id: true, name: true, image: true }
            },
            project: {
              select: { id: true, name: true, slug: true, color: true }
            },
            projectStatus: {
              select: { id: true, name: true, displayName: true, color: true }
            }
          }
        }),

        // Due this week (excluding today)
        prisma.issue.findMany({
          where: {
            ...baseWhere,
            dueDate: { gte: todayEnd, lt: thisWeekEnd }
          },
          orderBy: { dueDate: 'asc' },
          include: {
            assignee: {
              select: { id: true, name: true, image: true }
            },
            project: {
              select: { id: true, name: true, slug: true, color: true }
            },
            projectStatus: {
              select: { id: true, name: true, displayName: true, color: true }
            }
          }
        }),

        // Due this month (excluding this week)
        prisma.issue.findMany({
          where: {
            ...baseWhere,
            dueDate: { gte: thisWeekEnd, lt: thisMonthEnd }
          },
          orderBy: { dueDate: 'asc' },
          include: {
            assignee: {
              select: { id: true, name: true, image: true }
            },
            project: {
              select: { id: true, name: true, slug: true, color: true }
            },
            projectStatus: {
              select: { id: true, name: true, displayName: true, color: true }
            }
          }
        }),

        // Due later
        prisma.issue.findMany({
          where: {
            ...baseWhere,
            dueDate: { gte: thisMonthEnd, lte: endDate }
          },
          orderBy: { dueDate: 'asc' },
          include: {
            assignee: {
              select: { id: true, name: true, image: true }
            },
            project: {
              select: { id: true, name: true, slug: true, color: true }
            },
            projectStatus: {
              select: { id: true, name: true, displayName: true, color: true }
            }
          }
        })
      ]);

      // Format issue for response
      const formatIssue = (issue: any) => ({
        id: issue.id,
        issueKey: issue.issueKey,
        title: issue.title,
        type: issue.type,
        priority: issue.priority,
        dueDate: issue.dueDate,
        startDate: issue.startDate,
        storyPoints: issue.storyPoints,
        status: issue.projectStatus,
        assignee: issue.assignee,
        project: issue.project,
        labels: issue.labels,
        daysOverdue: issue.dueDate < now 
          ? Math.ceil((now.getTime() - issue.dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0,
        daysUntilDue: issue.dueDate >= now 
          ? Math.ceil((issue.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0
      });

      // Get counts for no due date issues
      const noDueDateCount = await prisma.issue.count({
        where: {
          workspaceId: context.workspace.id,
          dueDate: null,
          ...(projectId && { projectId }),
          ...(assigneeId && { assigneeId }),
          ...(!includeCompleted && { projectStatus: { isFinal: false } })
        }
      });

      const response = {
        range: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          daysBehind,
          daysAhead
        },
        filters: {
          projectId,
          assigneeId,
          includeCompleted
        },
        summary: {
          overdue: overdueIssues.length,
          dueToday: dueToday.length,
          dueThisWeek: dueThisWeek.length,
          dueThisMonth: dueThisMonth.length,
          dueLater: dueLater.length,
          noDueDate: noDueDateCount,
          total: overdueIssues.length + dueToday.length + dueThisWeek.length + dueThisMonth.length + dueLater.length
        },
        timeline: {
          overdue: {
            label: 'Overdue',
            count: overdueIssues.length,
            issues: overdueIssues.map(formatIssue)
          },
          today: {
            label: 'Due Today',
            date: todayStart.toISOString(),
            count: dueToday.length,
            issues: dueToday.map(formatIssue)
          },
          thisWeek: {
            label: 'Due This Week',
            dateRange: {
              start: todayEnd.toISOString(),
              end: thisWeekEnd.toISOString()
            },
            count: dueThisWeek.length,
            issues: dueThisWeek.map(formatIssue)
          },
          thisMonth: {
            label: 'Due This Month',
            dateRange: {
              start: thisWeekEnd.toISOString(),
              end: thisMonthEnd.toISOString()
            },
            count: dueThisMonth.length,
            issues: dueThisMonth.map(formatIssue)
          },
          later: {
            label: 'Due Later',
            dateRange: {
              start: thisMonthEnd.toISOString(),
              end: endDate.toISOString()
            },
            count: dueLater.length,
            issues: dueLater.map(formatIssue)
          }
        },
        health: {
          overduePercentage: (overdueIssues.length + dueToday.length + dueThisWeek.length + dueThisMonth.length + dueLater.length) > 0
            ? Math.round((overdueIssues.length / (overdueIssues.length + dueToday.length + dueThisWeek.length + dueThisMonth.length + dueLater.length)) * 100)
            : 0,
          status: getTimelineHealth(overdueIssues.length, dueToday.length)
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error generating timeline report:', error);
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
 * Get timeline health status
 */
function getTimelineHealth(overdue: number, dueToday: number): string {
  if (overdue > 10) return 'critical';
  if (overdue > 5 || dueToday > 10) return 'at_risk';
  if (overdue > 0 || dueToday > 5) return 'needs_attention';
  return 'healthy';
}


