/**
 * Third-Party App API: Activity-Based Issue Search
 * GET /api/apps/auth/search/issues-by-activity - Find issues by their activity history
 *
 * This powerful endpoint allows querying issues based on BoardItemActivity records.
 * Use cases:
 * - Issues moved to "done" today
 * - Issues assigned in the last week
 * - Issues with status changes in a time period
 * - Issues that had any activity by a specific user
 * - Recently commented issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/search/issues-by-activity
 * Find issues based on activity history
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);

      // Activity filters
      const action = searchParams.get('action'); // CREATED, UPDATED, MOVED, ASSIGNED, STATUS_CHANGED, COMMENTED, etc.
      const actions = searchParams.get('actions')?.split(',').filter(Boolean);
      const fieldName = searchParams.get('fieldName'); // status, assignee, priority, etc.
      const oldValue = searchParams.get('oldValue'); // Previous value
      const newValue = searchParams.get('newValue'); // New value (e.g., "done" for issues moved to done)
      const activityUserId = searchParams.get('activityUserId'); // User who performed the activity

      // Time range for activity
      const activityAfter = searchParams.get('activityAfter');
      const activityBefore = searchParams.get('activityBefore');

      // Convenience time filters
      const activityToday = searchParams.get('activityToday') === 'true';
      const activityThisWeek = searchParams.get('activityThisWeek') === 'true';
      const activityLastNDays = searchParams.get('activityLastNDays');

      // Additional issue filters (to narrow down results)
      const projectId = searchParams.get('projectId');
      const type = searchParams.get('type');
      const status = searchParams.get('status');
      const assigneeId = searchParams.get('assigneeId');

      // Include activity details in response
      const includeActivity = searchParams.get('includeActivity') !== 'false';
      const activityLimit = Math.min(parseInt(searchParams.get('activityLimit') || '5'), 20);

      // Pagination
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

      // Build activity filter
      const activityWhere: any = {
        workspaceId: context.workspace.id,
        itemType: 'ISSUE',
      };

      // Action filters
      if (action) {
        activityWhere.action = action;
      } else if (actions && actions.length > 0) {
        activityWhere.action = { in: actions };
      }

      // Field-specific filters
      if (fieldName) activityWhere.fieldName = fieldName;
      if (oldValue) activityWhere.oldValue = oldValue;
      if (newValue) activityWhere.newValue = newValue;
      if (activityUserId) activityWhere.userId = activityUserId;

      // Time range calculation
      let activityStartDate: Date | undefined;
      let activityEndDate: Date | undefined;

      if (activityToday) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        activityStartDate = today;
        activityEndDate = new Date();
      } else if (activityThisWeek) {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        activityStartDate = startOfWeek;
        activityEndDate = new Date();
      } else if (activityLastNDays) {
        const days = parseInt(activityLastNDays);
        if (!isNaN(days) && days > 0) {
          activityStartDate = new Date();
          activityStartDate.setDate(activityStartDate.getDate() - days);
          activityEndDate = new Date();
        }
      } else {
        if (activityAfter) activityStartDate = new Date(activityAfter);
        if (activityBefore) activityEndDate = new Date(activityBefore);
      }

      if (activityStartDate || activityEndDate) {
        activityWhere.createdAt = {};
        if (activityStartDate) activityWhere.createdAt.gte = activityStartDate;
        if (activityEndDate) activityWhere.createdAt.lte = activityEndDate;
      }

      // Find matching activities
      const matchingActivities = await prisma.boardItemActivity.findMany({
        where: activityWhere,
        select: {
          itemId: true,
          action: true,
          fieldName: true,
          oldValue: true,
          newValue: true,
          createdAt: true,
          userId: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get unique issue IDs from activities
      const issueIds = [...new Set(matchingActivities.map(a => a.itemId))];

      if (issueIds.length === 0) {
        return NextResponse.json({
          results: [],
          pagination: { page, limit, total: 0, pages: 0 },
          activityFilters: {
            action: action || actions,
            fieldName,
            oldValue,
            newValue,
            activityUserId,
            timeRange: {
              after: activityStartDate?.toISOString(),
              before: activityEndDate?.toISOString(),
            },
          },
        });
      }

      // Build issue filter
      const issueWhere: any = {
        id: { in: issueIds },
        workspaceId: context.workspace.id,
      };

      if (projectId) issueWhere.projectId = projectId;
      if (type) issueWhere.type = type;
      if (status) {
        issueWhere.OR = [
          { status },
          { statusValue: status },
        ];
      }
      if (assigneeId) issueWhere.assigneeId = assigneeId;

      // Count and fetch issues
      const [total, issues] = await Promise.all([
        prisma.issue.count({ where: issueWhere }),
        prisma.issue.findMany({
          where: issueWhere,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { updatedAt: 'desc' },
          include: {
            project: {
              select: {
                id: true,
                name: true,
                slug: true,
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
            labels: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        }),
      ]);

      // Group activities by issue ID for inclusion in response
      const activitiesByIssue = new Map<string, typeof matchingActivities>();
      for (const activity of matchingActivities) {
        const existing = activitiesByIssue.get(activity.itemId) || [];
        if (existing.length < activityLimit) {
          existing.push(activity);
        }
        activitiesByIssue.set(activity.itemId, existing);
      }

      // Get user info for activities if needed
      let userMap = new Map<string, { id: string; name: string | null; image: string | null }>();
      if (includeActivity) {
        const userIds = [...new Set(matchingActivities.map(a => a.userId))];
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, image: true },
        });
        userMap = new Map(users.map(u => [u.id, u]));
      }

      // Build response
      const results = issues.map(issue => {
        const issueActivities = activitiesByIssue.get(issue.id) || [];

        return {
          id: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          type: issue.type,
          status: issue.status || issue.statusValue,
          projectStatus: issue.projectStatus,
          priority: issue.priority,
          storyPoints: issue.storyPoints,
          dueDate: issue.dueDate,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          project: issue.project,
          assignee: issue.assignee,
          labels: issue.labels,
          ...(includeActivity && {
            matchingActivities: issueActivities.map(a => ({
              action: a.action,
              fieldName: a.fieldName,
              oldValue: a.oldValue,
              newValue: a.newValue,
              createdAt: a.createdAt,
              user: userMap.get(a.userId),
            })),
            activityCount: issueActivities.length,
          }),
        };
      });

      return NextResponse.json({
        results,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        summary: {
          totalMatchingActivities: matchingActivities.length,
          uniqueIssuesWithActivity: issueIds.length,
        },
        activityFilters: {
          action: action || actions,
          fieldName,
          oldValue,
          newValue,
          activityUserId,
          timeRange: {
            after: activityStartDate?.toISOString(),
            before: activityEndDate?.toISOString(),
          },
        },
        issueFilters: {
          projectId,
          type,
          status,
          assigneeId,
        },
      });
    } catch (error) {
      console.error('Error searching issues by activity:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['issues:read'] }
);
