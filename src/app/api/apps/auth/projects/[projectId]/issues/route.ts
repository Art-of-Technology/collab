/**
 * Third-Party App API: Project Issues Endpoint
 * GET /api/apps/auth/projects/[projectId]/issues - List project issues with advanced filtering
 * 
 * Required scopes:
 * - issues:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/projects/[projectId]/issues
 * Get project issues with advanced filtering, sorting, and pagination
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;
      const { searchParams } = new URL(request.url);

      // Pagination
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const skip = (page - 1) * limit;

      // Filters
      const type = searchParams.get('type'); // EPIC, STORY, TASK, BUG, MILESTONE, SUBTASK
      const types = searchParams.get('types')?.split(','); // Multiple types
      const status = searchParams.get('status');
      const statuses = searchParams.get('statuses')?.split(',');
      const priority = searchParams.get('priority');
      const priorities = searchParams.get('priorities')?.split(',');
      const assigneeId = searchParams.get('assigneeId');
      const reporterId = searchParams.get('reporterId');
      const parentId = searchParams.get('parentId');
      const hasParent = searchParams.get('hasParent'); // 'true' or 'false'
      const labelIds = searchParams.get('labelIds')?.split(',');
      const search = searchParams.get('search');
      const dueBefore = searchParams.get('dueBefore');
      const dueAfter = searchParams.get('dueAfter');
      const createdBefore = searchParams.get('createdBefore');
      const createdAfter = searchParams.get('createdAfter');
      const updatedBefore = searchParams.get('updatedBefore');
      const updatedAfter = searchParams.get('updatedAfter');

      // Sorting
      const sortBy = searchParams.get('sortBy') || 'createdAt'; // createdAt, updatedAt, dueDate, priority, title
      const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

      // Verify project exists and belongs to workspace
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: context.workspace.id
        }
      });

      if (!project) {
        return NextResponse.json(
          { error: 'project_not_found', error_description: 'Project not found' },
          { status: 404 }
        );
      }

      // Build where clause
      const where: any = {
        projectId: project.id
      };

      // Type filter
      if (type && ['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK'].includes(type)) {
        where.type = type;
      } else if (types && types.length > 0) {
        where.type = { in: types.filter(t => ['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK'].includes(t)) };
      }

      // Status filter
      if (status) {
        where.OR = [
          { statusValue: status },
          { status: status },
          { projectStatus: { name: status } },
          { projectStatus: { displayName: status } }
        ];
      } else if (statuses && statuses.length > 0) {
        where.OR = [
          { statusValue: { in: statuses } },
          { status: { in: statuses } },
          { projectStatus: { name: { in: statuses } } }
        ];
      }

      // Priority filter
      if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority.toLowerCase())) {
        where.priority = priority.toLowerCase();
      } else if (priorities && priorities.length > 0) {
        where.priority = { in: priorities.map(p => p.toLowerCase()) };
      }

      // Assignee filter
      if (assigneeId) {
        if (assigneeId === 'unassigned') {
          where.assigneeId = null;
        } else {
          where.assigneeId = assigneeId;
        }
      }

      // Reporter filter
      if (reporterId) {
        where.reporterId = reporterId;
      }

      // Parent filter
      if (parentId) {
        where.parentId = parentId;
      }
      if (hasParent === 'true') {
        where.parentId = { not: null };
      } else if (hasParent === 'false') {
        where.parentId = null;
      }

      // Label filter
      if (labelIds && labelIds.length > 0) {
        where.labels = {
          some: {
            id: { in: labelIds }
          }
        };
      }

      // Search filter
      if (search) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { issueKey: { contains: search, mode: 'insensitive' } }
          ]
        });
      }

      // Date filters
      if (dueBefore) {
        where.dueDate = { ...(where.dueDate || {}), lte: new Date(dueBefore) };
      }
      if (dueAfter) {
        where.dueDate = { ...(where.dueDate || {}), gte: new Date(dueAfter) };
      }
      if (createdBefore) {
        where.createdAt = { ...(where.createdAt || {}), lte: new Date(createdBefore) };
      }
      if (createdAfter) {
        where.createdAt = { ...(where.createdAt || {}), gte: new Date(createdAfter) };
      }
      if (updatedBefore) {
        where.updatedAt = { ...(where.updatedAt || {}), lte: new Date(updatedBefore) };
      }
      if (updatedAfter) {
        where.updatedAt = { ...(where.updatedAt || {}), gte: new Date(updatedAfter) };
      }

      // Build orderBy
      const orderBy: any = {};
      const validSortFields = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'issueKey'];
      if (validSortFields.includes(sortBy)) {
        // Special handling for priority (needs custom order)
        if (sortBy === 'priority') {
          // We'll handle this after fetching
          orderBy.createdAt = sortOrder;
        } else {
          orderBy[sortBy] = sortOrder;
        }
      } else {
        orderBy.createdAt = sortOrder;
      }

      // Get issues with related data
      const [issues, total] = await Promise.all([
        prisma.issue.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            },
            reporter: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            },
            projectStatus: {
              select: {
                id: true,
                name: true,
                displayName: true,
                color: true,
                isFinal: true
              }
            },
            labels: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            parent: {
              select: {
                id: true,
                issueKey: true,
                title: true,
                type: true
              }
            },
            _count: {
              select: {
                children: true,
                comments: true
              }
            }
          }
        }),
        prisma.issue.count({ where })
      ]);

      // Sort by priority if needed
      let sortedIssues = issues;
      if (sortBy === 'priority') {
        const priorityOrder: Record<string, number> = { 'urgent': 4, 'high': 3, 'medium': 2, 'low': 1 };
        sortedIssues = [...issues].sort((a, b) => {
          const aVal = priorityOrder[a.priority?.toLowerCase() || 'medium'] || 2;
          const bVal = priorityOrder[b.priority?.toLowerCase() || 'medium'] || 2;
          return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        });
      }

      const response = {
        projectId: project.id,
        projectName: project.name,
        issues: sortedIssues.map(issue => ({
          id: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          description: issue.description,
          type: issue.type,
          status: issue.projectStatus?.name || issue.statusValue || issue.status,
          projectStatus: issue.projectStatus,
          priority: issue.priority,
          dueDate: issue.dueDate,
          startDate: issue.startDate,
          storyPoints: issue.storyPoints,
          progress: issue.progress,
          color: issue.color,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          assignee: issue.assignee,
          reporter: issue.reporter,
          labels: issue.labels,
          parent: issue.parent,
          stats: {
            childCount: issue._count.children,
            commentCount: issue._count.comments
          }
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        filters: {
          type: type || types,
          status: status || statuses,
          priority: priority || priorities,
          assigneeId,
          reporterId,
          labelIds,
          search,
          dueBefore,
          dueAfter
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching project issues:', error);
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


