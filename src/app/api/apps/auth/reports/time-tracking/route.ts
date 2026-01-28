/**
 * Third-Party App API: Time Tracking Report
 * GET /api/apps/auth/reports/time-tracking - Get comprehensive time tracking report
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

type Period = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';
type GroupBy = 'user' | 'project' | 'issue_type' | 'day' | 'week';

function getDateRangeForPeriod(period: Period, customStart?: string, customEnd?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case 'today':
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
        label: 'Today',
      };
    case 'yesterday': {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return {
        start: yesterday,
        end: new Date(today.getTime() - 1),
        label: 'Yesterday',
      };
    }
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      return {
        start: startOfWeek,
        end: new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1),
        label: 'This Week',
      };
    }
    case 'last_week': {
      const dayOfWeek = today.getDay();
      const startOfLastWeek = new Date(today.getTime() - (dayOfWeek + 7) * 24 * 60 * 60 * 1000);
      return {
        start: startOfLastWeek,
        end: new Date(startOfLastWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1),
        label: 'Last Week',
      };
    }
    case 'this_month': {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return {
        start: startOfMonth,
        end: endOfMonth,
        label: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`,
      };
    }
    case 'last_month': {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        start: startOfLastMonth,
        end: endOfLastMonth,
        label: `${lastMonth.toLocaleString('default', { month: 'long' })} ${lastMonth.getFullYear()}`,
      };
    }
    case 'custom': {
      if (!customStart || !customEnd) {
        // Default to last 30 days
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        return {
          start: thirtyDaysAgo,
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
          label: 'Last 30 Days',
        };
      }
      return {
        start: new Date(customStart),
        end: new Date(customEnd),
        label: `${new Date(customStart).toLocaleDateString()} - ${new Date(customEnd).toLocaleDateString()}`,
      };
    }
    default:
      // Default to this month
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return {
        start: startOfMonth,
        end: endOfMonth,
        label: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`,
      };
  }
}

/**
 * GET /api/apps/auth/reports/time-tracking
 * Get comprehensive time tracking report
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);

      // Parse query parameters
      const period = (searchParams.get('period') || 'this_month') as Period;
      const startDate = searchParams.get('startDate') || undefined;
      const endDate = searchParams.get('endDate') || undefined;
      const projectId = searchParams.get('projectId');
      const projectIds = searchParams.get('projectIds')?.split(',').filter(Boolean);
      const userId = searchParams.get('userId');
      const userIds = searchParams.get('userIds')?.split(',').filter(Boolean);
      const groupBy = (searchParams.get('groupBy') || 'user') as GroupBy;
      const includeDetails = searchParams.get('includeDetails') === 'true';

      // Calculate date range
      const dateRange = getDateRangeForPeriod(period, startDate, endDate);

      // Build where clause
      const whereClause: any = {
        workspaceId: context.workspace.id,
        loggedAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      };

      // Apply filters
      if (projectId) {
        const issue = await prisma.issue.findFirst({
          where: { projectId, workspaceId: context.workspace.id },
          select: { projectId: true },
        });
        if (issue) {
          whereClause.issue = { projectId };
        }
      } else if (projectIds && projectIds.length > 0) {
        whereClause.issue = { projectId: { in: projectIds } };
      }

      if (userId) {
        whereClause.userId = userId;
      } else if (userIds && userIds.length > 0) {
        whereClause.userId = { in: userIds };
      }

      // Get all work logs for the period
      const workLogs = await prisma.workLog.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          issue: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              type: true,
              project: {
                select: {
                  id: true,
                  name: true,
                  issuePrefix: true,
                },
              },
            },
          },
        },
        orderBy: { loggedAt: 'desc' },
      });

      // Calculate summary statistics
      const totalTimeLogged = workLogs.reduce((sum, log) => sum + log.timeSpent, 0);
      const uniqueIssues = new Set(workLogs.map(log => log.issueId));
      const totalIssuesWorked = uniqueIssues.size;
      const totalWorkLogs = workLogs.length;

      // Calculate days in period for average
      const daysInPeriod = Math.max(1, Math.ceil(
        (dateRange.end.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000)
      ));
      const averageTimePerDay = Math.round(totalTimeLogged / daysInPeriod);
      const averageTimePerIssue = totalIssuesWorked > 0
        ? Math.round(totalTimeLogged / totalIssuesWorked)
        : 0;

      // Group by user
      const byUserMap = new Map<string, {
        user: { id: string; name: string | null; email: string | null; image: string | null };
        timeLogged: number;
        issuesWorked: Set<string>;
        workLogCount: number;
      }>();

      for (const log of workLogs) {
        const existing = byUserMap.get(log.userId);
        if (existing) {
          existing.timeLogged += log.timeSpent;
          existing.issuesWorked.add(log.issueId);
          existing.workLogCount++;
        } else {
          byUserMap.set(log.userId, {
            user: log.user,
            timeLogged: log.timeSpent,
            issuesWorked: new Set([log.issueId]),
            workLogCount: 1,
          });
        }
      }

      const byUser = Array.from(byUserMap.values())
        .map(item => ({
          user: item.user,
          timeLogged: item.timeLogged,
          issuesWorked: item.issuesWorked.size,
          workLogCount: item.workLogCount,
          averagePerIssue: item.issuesWorked.size > 0
            ? Math.round(item.timeLogged / item.issuesWorked.size)
            : 0,
        }))
        .sort((a, b) => b.timeLogged - a.timeLogged);

      // Group by project
      const byProjectMap = new Map<string, {
        project: { id: string; name: string; issuePrefix: string };
        timeLogged: number;
        issuesWorked: Set<string>;
      }>();

      for (const log of workLogs) {
        const projectKey = log.issue.project.id;
        const existing = byProjectMap.get(projectKey);
        if (existing) {
          existing.timeLogged += log.timeSpent;
          existing.issuesWorked.add(log.issueId);
        } else {
          byProjectMap.set(projectKey, {
            project: log.issue.project,
            timeLogged: log.timeSpent,
            issuesWorked: new Set([log.issueId]),
          });
        }
      }

      const byProject = Array.from(byProjectMap.values())
        .map(item => ({
          project: item.project,
          timeLogged: item.timeLogged,
          issuesWorked: item.issuesWorked.size,
        }))
        .sort((a, b) => b.timeLogged - a.timeLogged);

      // Group by issue type
      const byIssueTypeMap = new Map<string, { type: string; timeLogged: number; count: number }>();

      for (const log of workLogs) {
        const type = log.issue.type;
        const existing = byIssueTypeMap.get(type);
        if (existing) {
          existing.timeLogged += log.timeSpent;
          existing.count++;
        } else {
          byIssueTypeMap.set(type, { type, timeLogged: log.timeSpent, count: 1 });
        }
      }

      const byIssueType = Array.from(byIssueTypeMap.values())
        .sort((a, b) => b.timeLogged - a.timeLogged);

      // Group by day
      const byDayMap = new Map<string, { date: string; timeLogged: number; logCount: number }>();

      for (const log of workLogs) {
        const dateKey = log.loggedAt.toISOString().split('T')[0];
        const existing = byDayMap.get(dateKey);
        if (existing) {
          existing.timeLogged += log.timeSpent;
          existing.logCount++;
        } else {
          byDayMap.set(dateKey, { date: dateKey, timeLogged: log.timeSpent, logCount: 1 });
        }
      }

      const byDay = Array.from(byDayMap.values())
        .sort((a, b) => b.date.localeCompare(a.date));

      // Group by week
      const byWeekMap = new Map<string, { weekStart: string; timeLogged: number; logCount: number }>();

      for (const log of workLogs) {
        const logDate = new Date(log.loggedAt);
        const dayOfWeek = logDate.getDay();
        const weekStart = new Date(logDate.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        const weekKey = weekStart.toISOString().split('T')[0];

        const existing = byWeekMap.get(weekKey);
        if (existing) {
          existing.timeLogged += log.timeSpent;
          existing.logCount++;
        } else {
          byWeekMap.set(weekKey, { weekStart: weekKey, timeLogged: log.timeSpent, logCount: 1 });
        }
      }

      const byWeek = Array.from(byWeekMap.values())
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

      // Build response
      const response: any = {
        period: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
          label: dateRange.label,
          daysInPeriod,
        },
        summary: {
          totalTimeLogged,
          totalTimeLoggedFormatted: formatMinutes(totalTimeLogged),
          totalIssuesWorked,
          totalWorkLogs,
          averageTimePerIssue,
          averageTimePerIssueFormatted: formatMinutes(averageTimePerIssue),
          averageTimePerDay,
          averageTimePerDayFormatted: formatMinutes(averageTimePerDay),
        },
        byUser,
        byProject,
        byIssueType,
        byDay,
        byWeek,
        filters: {
          period,
          projectId,
          projectIds,
          userId,
          userIds,
          groupBy,
        },
      };

      // Include details if requested
      if (includeDetails) {
        response.details = workLogs.map(log => ({
          id: log.id,
          timeSpent: log.timeSpent,
          description: log.description,
          loggedAt: log.loggedAt,
          user: log.user,
          issue: {
            id: log.issue.id,
            issueKey: log.issue.issueKey,
            title: log.issue.title,
            type: log.issue.type,
            project: log.issue.project,
          },
        }));
      }

      return NextResponse.json(response);
    } catch (error) {
      console.error('Error generating time tracking report:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['workspace:read'] }
);

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}
