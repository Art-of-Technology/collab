/**
 * Third-Party App API: Issue Search
 * GET /api/apps/auth/search/issues - Full-text search across issues with advanced filters
 *
 * Supports:
 * - Text search (q)
 * - Project, type, status, priority, assignee filters
 * - Date range filters (createdAfter, createdBefore, updatedAfter, updatedBefore)
 * - Overdue filter
 * - Label filter
 * - Sorting options
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * GET /api/apps/auth/search/issues
 * Full-text search across issues with filters
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);

      // Basic filters
      const query = searchParams.get('q') || '';
      const projectId = searchParams.get('projectId');
      const projectIds = searchParams.get('projectIds')?.split(',').filter(Boolean);
      const type = searchParams.get('type');
      const types = searchParams.get('types')?.split(',').filter(Boolean);
      const status = searchParams.get('status');
      const statuses = searchParams.get('statuses')?.split(',').filter(Boolean);
      const priority = searchParams.get('priority');
      const priorities = searchParams.get('priorities')?.split(',').filter(Boolean);
      const assigneeId = searchParams.get('assigneeId');
      const reporterId = searchParams.get('reporterId');
      const labelId = searchParams.get('labelId');
      const labelIds = searchParams.get('labelIds')?.split(',').filter(Boolean);

      // Date filters
      const createdAfter = searchParams.get('createdAfter');
      const createdBefore = searchParams.get('createdBefore');
      const updatedAfter = searchParams.get('updatedAfter');
      const updatedBefore = searchParams.get('updatedBefore');
      const dueDateAfter = searchParams.get('dueDateAfter');
      const dueDateBefore = searchParams.get('dueDateBefore');

      // Special filters
      const isOverdue = searchParams.get('isOverdue') === 'true';
      const hasNoDueDate = searchParams.get('hasNoDueDate') === 'true';
      const isUnassigned = searchParams.get('isUnassigned') === 'true';
      const hasParent = searchParams.get('hasParent');
      const parentId = searchParams.get('parentId');

      // Sorting
      const sortBy = searchParams.get('sortBy') || 'updatedAt';
      const sortOrder = searchParams.get('sortOrder') || 'desc';

      // Pagination
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const skip = (page - 1) * limit;

      // Build search filter
      const where: any = {
        workspaceId: context.workspace.id,
      };

      // Text search
      if (query) {
        where.OR = [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { issueKey: { contains: query, mode: 'insensitive' } },
        ];
      }

      // Project filters
      if (projectId) {
        where.projectId = projectId;
      } else if (projectIds && projectIds.length > 0) {
        where.projectId = { in: projectIds };
      }

      // Type filters
      if (type && ['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK'].includes(type)) {
        where.type = type;
      } else if (types && types.length > 0) {
        where.type = { in: types };
      }

      // Status filters
      if (status) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { status },
            { statusValue: status },
          ],
        });
      } else if (statuses && statuses.length > 0) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { status: { in: statuses } },
            { statusValue: { in: statuses } },
          ],
        });
      }

      // Priority filters
      if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
        where.priority = priority;
      } else if (priorities && priorities.length > 0) {
        where.priority = { in: priorities };
      }

      // Assignee/Reporter filters
      if (assigneeId) where.assigneeId = assigneeId;
      if (reporterId) where.reporterId = reporterId;
      if (isUnassigned) where.assigneeId = null;

      // Label filters
      if (labelId) {
        where.labels = { some: { id: labelId } };
      } else if (labelIds && labelIds.length > 0) {
        where.labels = { some: { id: { in: labelIds } } };
      }

      // Parent filters
      if (hasParent === 'true') {
        where.parentId = { not: null };
      } else if (hasParent === 'false') {
        where.parentId = null;
      }
      if (parentId) {
        where.parentId = parentId;
      }

      // Date range filters
      if (createdAfter || createdBefore) {
        where.createdAt = {};
        if (createdAfter) where.createdAt.gte = new Date(createdAfter);
        if (createdBefore) where.createdAt.lte = new Date(createdBefore);
      }

      if (updatedAfter || updatedBefore) {
        where.updatedAt = {};
        if (updatedAfter) where.updatedAt.gte = new Date(updatedAfter);
        if (updatedBefore) where.updatedAt.lte = new Date(updatedBefore);
      }

      if (dueDateAfter || dueDateBefore) {
        where.dueDate = {};
        if (dueDateAfter) where.dueDate.gte = new Date(dueDateAfter);
        if (dueDateBefore) where.dueDate.lte = new Date(dueDateBefore);
      }

      // Special date filters
      if (hasNoDueDate) {
        where.dueDate = null;
      }

      // Overdue filter
      if (isOverdue) {
        const finalStatuses = await prisma.projectStatus.findMany({
          where: { isFinal: true, isActive: true },
          select: { id: true },
        });
        const finalStatusIds = finalStatuses.map(s => s.id);

        where.dueDate = { lt: new Date() };
        where.statusId = { notIn: finalStatusIds };
      }

      // Build sort
      const validSortFields = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'issueKey', 'type'];
      const orderByField = validSortFields.includes(sortBy) ? sortBy : 'updatedAt';
      const orderBy = { [orderByField]: sortOrder === 'asc' ? 'asc' : 'desc' };

      const [results, total] = await Promise.all([
        prisma.issue.findMany({
          where,
          skip,
          take: limit,
          orderBy,
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
            reporter: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
            labels: {
              select: {
                id: true,
                name: true,
                color: true,
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
            parent: {
              select: {
                id: true,
                issueKey: true,
                title: true,
                type: true,
              },
            },
            _count: {
              select: {
                children: true,
                comments: true,
              },
            },
          },
        }),
        prisma.issue.count({ where }),
      ]);

      return NextResponse.json({
        query,
        results: results.map(issue => ({
          id: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          description: issue.description?.slice(0, 200) + (issue.description && issue.description.length > 200 ? '...' : ''),
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
          reporter: issue.reporter,
          labels: issue.labels,
          parent: issue.parent,
          stats: {
            childCount: issue._count.children,
            commentCount: issue._count.comments,
          },
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        filters: {
          query,
          projectId: projectId || projectIds,
          type: type || types,
          status: status || statuses,
          priority: priority || priorities,
          assigneeId,
          reporterId,
          labelIds: labelId ? [labelId] : labelIds,
          createdAfter,
          createdBefore,
          updatedAfter,
          updatedBefore,
          dueDateAfter,
          dueDateBefore,
          isOverdue,
          hasNoDueDate,
          isUnassigned,
          hasParent,
          parentId,
          sortBy: orderByField,
          sortOrder,
        },
      });
    } catch (error) {
      console.error('Error searching issues:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:read'] }
);
