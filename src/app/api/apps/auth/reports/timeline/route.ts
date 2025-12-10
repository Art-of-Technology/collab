/**
 * Third-Party App API: Timeline Report
 * GET /api/apps/auth/reports/timeline - Get issues organized by due date
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * GET /api/apps/auth/reports/timeline
 * Get issues organized by due date (overdue, today, this week, etc.)
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');
      const assigneeId = searchParams.get('assigneeId');
      const includeCompleted = searchParams.get('includeCompleted') === 'true';
      const daysAhead = parseInt(searchParams.get('daysAhead') || '30');

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + daysAhead);

      // Get final statuses
      const finalStatusQuery = projectId
        ? { projectId, isFinal: true, isActive: true }
        : { isFinal: true, isActive: true };

      const finalStatuses = await prisma.projectStatus.findMany({
        where: finalStatusQuery,
        select: { id: true },
      });
      const finalStatusIds = finalStatuses.map(s => s.id);

      // Base filter
      const baseFilter: any = {
        workspaceId: context.workspace.id,
      };

      if (projectId) {
        baseFilter.projectId = projectId;
      }

      if (assigneeId) {
        baseFilter.assigneeId = assigneeId;
      }

      if (!includeCompleted) {
        baseFilter.statusId = { notIn: finalStatusIds };
      }

      // Issue select configuration
      const issueSelect = {
        id: true,
        issueKey: true,
        title: true,
        type: true,
        status: true,
        statusValue: true,
        priority: true,
        dueDate: true,
        storyPoints: true,
        projectId: true,
        project: {
          select: {
            id: true,
            name: true,
            issuePrefix: true,
            color: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        projectStatus: {
          select: {
            id: true,
            name: true,
            displayName: true,
            color: true,
            isFinal: true,
          },
        },
      };

      // Fetch issues by timeline buckets
      const [
        overdueIssues,
        todayIssues,
        thisWeekIssues,
        thisMonthIssues,
        laterIssues,
        noDueDateIssues,
      ] = await Promise.all([
        // Overdue
        prisma.issue.findMany({
          where: {
            ...baseFilter,
            dueDate: { lt: today },
            statusId: { notIn: finalStatusIds },
          },
          select: issueSelect,
          orderBy: { dueDate: 'asc' },
        }),
        // Due today
        prisma.issue.findMany({
          where: {
            ...baseFilter,
            dueDate: { gte: today, lt: tomorrow },
          },
          select: issueSelect,
          orderBy: { priority: 'desc' },
        }),
        // This week (excluding today)
        prisma.issue.findMany({
          where: {
            ...baseFilter,
            dueDate: { gte: tomorrow, lt: endOfWeek },
          },
          select: issueSelect,
          orderBy: { dueDate: 'asc' },
        }),
        // This month (excluding this week)
        prisma.issue.findMany({
          where: {
            ...baseFilter,
            dueDate: { gte: endOfWeek, lt: endOfMonth },
          },
          select: issueSelect,
          orderBy: { dueDate: 'asc' },
        }),
        // Later (within daysAhead, excluding this month)
        prisma.issue.findMany({
          where: {
            ...baseFilter,
            dueDate: { gte: endOfMonth, lte: futureDate },
          },
          select: issueSelect,
          orderBy: { dueDate: 'asc' },
        }),
        // No due date
        prisma.issue.findMany({
          where: {
            ...baseFilter,
            dueDate: null,
          },
          select: issueSelect,
          orderBy: { priority: 'desc' },
          take: 50,
        }),
      ]);

      // Transform issues with additional calculated fields
      const transformIssue = (issue: any) => {
        const daysOverdue = issue.dueDate
          ? Math.max(0, Math.floor((today.getTime() - new Date(issue.dueDate).getTime()) / (1000 * 60 * 60 * 24)))
          : 0;
        const daysUntilDue = issue.dueDate
          ? Math.max(0, Math.floor((new Date(issue.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
          : null;

        return {
          ...issue,
          status: issue.status || issue.statusValue,
          daysOverdue,
          daysUntilDue,
        };
      };

      // Calculate summary
      const totalWithDueDate = overdueIssues.length + todayIssues.length + thisWeekIssues.length +
        thisMonthIssues.length + laterIssues.length;
      const totalOverdue = overdueIssues.length;

      // Health status
      let healthStatus = 'healthy';
      if (totalWithDueDate > 0) {
        const overduePercent = (totalOverdue / totalWithDueDate) * 100;
        if (overduePercent > 20) healthStatus = 'at_risk';
        else if (overduePercent > 10) healthStatus = 'needs_attention';
      }

      return NextResponse.json({
        timeline: {
          overdue: {
            label: 'Overdue',
            count: overdueIssues.length,
            issues: overdueIssues.map(transformIssue),
          },
          today: {
            label: 'Due Today',
            count: todayIssues.length,
            issues: todayIssues.map(transformIssue),
          },
          thisWeek: {
            label: 'This Week',
            count: thisWeekIssues.length,
            issues: thisWeekIssues.map(transformIssue),
          },
          thisMonth: {
            label: 'This Month',
            count: thisMonthIssues.length,
            issues: thisMonthIssues.map(transformIssue),
          },
          later: {
            label: `Next ${daysAhead} Days`,
            count: laterIssues.length,
            issues: laterIssues.map(transformIssue),
          },
          noDueDate: {
            label: 'No Due Date',
            count: noDueDateIssues.length,
            issues: noDueDateIssues.map(transformIssue),
          },
        },
        summary: {
          overdue: overdueIssues.length,
          dueToday: todayIssues.length,
          dueThisWeek: thisWeekIssues.length,
          dueThisMonth: thisMonthIssues.length,
          dueLater: laterIssues.length,
          noDueDate: noDueDateIssues.length,
          totalWithDueDate,
        },
        health: {
          status: healthStatus,
          overduePercentage: totalWithDueDate > 0
            ? Math.round((totalOverdue / totalWithDueDate) * 100)
            : 0,
        },
        filters: {
          projectId,
          assigneeId,
          includeCompleted,
          daysAhead,
        },
      });
    } catch (error) {
      console.error('Error generating timeline report:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['workspace:read'] }
);
