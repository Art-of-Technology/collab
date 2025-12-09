/**
 * Third-Party App API: Single View Endpoint
 * GET /api/apps/auth/views/:viewId - Get view with optional issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/views/:viewId
 * Get view configuration and optionally filtered issues
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ viewId: string }> }) => {
    try {
      const { viewId } = await params;
      const { searchParams } = new URL(request.url);
      const includeIssues = searchParams.get('includeIssues') === 'true';
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

      // Find view by ID or slug
      const view = await prisma.view.findFirst({
        where: {
          workspaceId: context.workspace.id,
          OR: [
            { id: viewId },
            { slug: viewId },
          ],
          // Must have access: public, workspace-shared, or own view
          AND: [
            {
              OR: [
                { visibility: 'WORKSPACE' },
                { visibility: 'SHARED' },
                { ownerId: context.user.id },
              ],
            },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      if (!view) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'View not found' },
          { status: 404 }
        );
      }

      // Update access tracking
      await prisma.view.update({
        where: { id: view.id },
        data: {
          lastAccessedAt: new Date(),
          accessCount: { increment: 1 },
        },
      });

      // Build response
      const response: any = {
        id: view.id,
        name: view.name,
        slug: view.slug,
        description: view.description,
        displayType: view.displayType,
        visibility: view.visibility,
        isDefault: view.isDefault,
        isFavorite: view.isFavorite,
        color: view.color,
        projectIds: view.projectIds,
        owner: view.owner,
        createdAt: view.createdAt,
        updatedAt: view.updatedAt,
        configuration: {
          filters: view.filters,
          sorting: view.sorting,
          grouping: view.grouping,
          fields: view.fields,
          layout: view.layout,
        },
      };

      // Fetch issues if requested
      if (includeIssues) {
        // Build issue query based on view filters
        const issueWhere: any = {
          workspaceId: context.workspace.id,
        };

        // Filter by projects if view has projectIds
        if (view.projectIds && view.projectIds.length > 0) {
          issueWhere.projectId = { in: view.projectIds };
        }

        // Apply filters from view configuration
        const filters = view.filters as Record<string, any> | null;
        if (filters) {
          if (filters.type) issueWhere.type = filters.type;
          if (filters.status) {
            issueWhere.OR = [
              { status: filters.status },
              { statusValue: filters.status },
            ];
          }
          if (filters.priority) issueWhere.priority = filters.priority;
          if (filters.assigneeId) issueWhere.assigneeId = filters.assigneeId;
          if (filters.labelIds && Array.isArray(filters.labelIds)) {
            issueWhere.labels = { some: { id: { in: filters.labelIds } } };
          }
          if (filters.dueDateFrom || filters.dueDateTo) {
            issueWhere.dueDate = {};
            if (filters.dueDateFrom) issueWhere.dueDate.gte = new Date(filters.dueDateFrom);
            if (filters.dueDateTo) issueWhere.dueDate.lte = new Date(filters.dueDateTo);
          }
        }

        // Build sorting from view configuration
        const sorting = view.sorting as Record<string, any> | null;
        let orderBy: Prisma.IssueOrderByWithRelationInput = { updatedAt: 'desc' };
        if (sorting && sorting.field) {
          const validFields = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'position'];
          if (validFields.includes(sorting.field)) {
            orderBy = { [sorting.field]: sorting.direction || 'desc' };
          }
        }

        const [issues, total] = await Promise.all([
          prisma.issue.findMany({
            where: issueWhere,
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
                },
              },
            },
          }),
          prisma.issue.count({ where: issueWhere }),
        ]);

        response.issues = issues.map(issue => ({
          id: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          type: issue.type,
          status: issue.status || issue.statusValue,
          projectStatus: issue.projectStatus,
          priority: issue.priority,
          storyPoints: issue.storyPoints,
          dueDate: issue.dueDate,
          progress: issue.progress,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          project: issue.project,
          assignee: issue.assignee,
          labels: issue.labels,
        }));

        response.pagination = {
          limit,
          total,
          hasMore: total > limit,
        };
      }

      return NextResponse.json(response);
    } catch (error) {
      console.error('Error fetching view:', error);
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
