/**
 * Third-Party App API: Issue Search Endpoint
 * GET /api/apps/auth/search/issues - Full-text search across issues
 * 
 * Required scopes:
 * - search:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/search/issues
 * Search issues with full-text and filter capabilities
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);

      // Search query
      const q = searchParams.get('q') || '';

      // Filters
      const projectId = searchParams.get('projectId');
      const projectIds = searchParams.get('projectIds')?.split(',');
      const type = searchParams.get('type');
      const types = searchParams.get('types')?.split(',');
      const status = searchParams.get('status');
      const statuses = searchParams.get('statuses')?.split(',');
      const priority = searchParams.get('priority');
      const priorities = searchParams.get('priorities')?.split(',');
      const assigneeId = searchParams.get('assigneeId');
      const reporterId = searchParams.get('reporterId');
      const labelIds = searchParams.get('labelIds')?.split(',');
      const hasParent = searchParams.get('hasParent');
      const isOverdue = searchParams.get('isOverdue');

      // Pagination
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id
      };

      // Full-text search
      if (q) {
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { issueKey: { contains: q, mode: 'insensitive' } }
        ];
      }

      // Project filter
      if (projectId) {
        where.projectId = projectId;
      } else if (projectIds && projectIds.length > 0) {
        where.projectId = { in: projectIds };
      }

      // Type filter
      if (type && ['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK'].includes(type)) {
        where.type = type;
      } else if (types && types.length > 0) {
        where.type = { in: types.filter(t => ['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK'].includes(t)) };
      }

      // Status filter
      if (status) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { statusValue: status },
            { status: status },
            { projectStatus: { name: status } }
          ]
        });
      } else if (statuses && statuses.length > 0) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { statusValue: { in: statuses } },
            { status: { in: statuses } },
            { projectStatus: { name: { in: statuses } } }
          ]
        });
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

      // Label filter
      if (labelIds && labelIds.length > 0) {
        where.labels = {
          some: { id: { in: labelIds } }
        };
      }

      // Parent filter
      if (hasParent === 'true') {
        where.parentId = { not: null };
      } else if (hasParent === 'false') {
        where.parentId = null;
      }

      // Overdue filter
      if (isOverdue === 'true') {
        where.dueDate = { lt: new Date() };
        where.projectStatus = { isFinal: false };
      }

      // Search with relevance scoring
      const [issues, total] = await Promise.all([
        prisma.issue.findMany({
          where,
          skip,
          take: limit,
          orderBy: [
            // If searching, order by relevance (title match first)
            ...(q ? [{ title: 'asc' as const }] : []),
            { updatedAt: 'desc' as const }
          ],
          include: {
            project: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true
              }
            },
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

      // Calculate relevance score for each result
      const scoredResults = issues.map(issue => {
        let relevanceScore = 0;

        if (q) {
          const searchLower = q.toLowerCase();

          // Exact issue key match (highest score)
          if (issue.issueKey?.toLowerCase() === searchLower) {
            relevanceScore += 100;
          } else if (issue.issueKey?.toLowerCase().includes(searchLower)) {
            relevanceScore += 50;
          }

          // Title match
          if (issue.title.toLowerCase() === searchLower) {
            relevanceScore += 80;
          } else if (issue.title.toLowerCase().includes(searchLower)) {
            relevanceScore += 40;
          }

          // Description match
          if (issue.description?.toLowerCase().includes(searchLower)) {
            relevanceScore += 20;
          }
        }

        return {
          id: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          description: issue.description?.substring(0, 200) + (issue.description && issue.description.length > 200 ? '...' : ''),
          type: issue.type,
          status: issue.projectStatus?.name || issue.statusValue || issue.status,
          projectStatus: issue.projectStatus,
          priority: issue.priority,
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
            commentCount: issue._count.comments
          },
          relevance: relevanceScore
        };
      });

      // Sort by relevance if searching
      if (q) {
        scoredResults.sort((a, b) => b.relevance - a.relevance);
      }

      const response = {
        query: q,
        filters: {
          projectId: projectId || projectIds,
          type: type || types,
          status: status || statuses,
          priority: priority || priorities,
          assigneeId,
          reporterId,
          labelIds,
          hasParent,
          isOverdue
        },
        results: scoredResults,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error searching issues:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['search:read'] }
);


