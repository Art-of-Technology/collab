/**
 * Third-Party App API: Single View Endpoint
 * GET /api/apps/auth/views/[viewId] - Get view configuration with filtered issues
 * 
 * Required scopes:
 * - views:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/views/[viewId]
 * Get view with its configuration and matching issues
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ viewId: string }> }) => {
    try {
      const { viewId } = await params;
      const { searchParams } = new URL(request.url);
      const includeIssues = searchParams.get('includeIssues') !== 'false';
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

      // Find the view
      const view = await prisma.view.findFirst({
        where: {
          AND: [
            {
              OR: [
                { id: viewId },
                { slug: viewId }
              ]
            },
            { workspaceId: context.workspace.id },
            // Access check
            {
              OR: [
                { ownerId: context.user.id },
                { visibility: 'WORKSPACE' },
                { 
                  visibility: 'SHARED',
                  sharedWith: { has: context.user.id }
                }
              ]
            }
          ]
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          _count: {
            select: {
              followers: true,
              favorites: true
            }
          }
        }
      });

      if (!view) {
        return NextResponse.json(
          { error: 'view_not_found', error_description: 'View not found or access denied' },
          { status: 404 }
        );
      }

      // Parse view configuration
      let filters: any = null;
      let sorting: any = null;
      let grouping: any = null;

      try {
        filters = view.filters as any;
        sorting = view.sorting as any;
        grouping = view.grouping as any;
      } catch {
        // Keep as null
      }

      // Build issue query based on view filters
      let issues: any[] = [];
      let totalIssues = 0;

      if (includeIssues) {
        const skip = (page - 1) * limit;
        const issueWhere: any = {
          workspaceId: context.workspace.id
        };

        // Apply project filter
        if (view.projectIds && view.projectIds.length > 0) {
          issueWhere.projectId = { in: view.projectIds };
        }

        // Apply filters from view configuration
        if (filters) {
          // Type filter
          if (filters.types && filters.types.length > 0) {
            issueWhere.type = { in: filters.types };
          }

          // Status filter
          if (filters.statuses && filters.statuses.length > 0) {
            issueWhere.OR = [
              { statusValue: { in: filters.statuses } },
              { status: { in: filters.statuses } },
              { projectStatus: { name: { in: filters.statuses } } }
            ];
          }

          // Priority filter
          if (filters.priorities && filters.priorities.length > 0) {
            issueWhere.priority = { in: filters.priorities.map((p: string) => p.toLowerCase()) };
          }

          // Assignee filter
          if (filters.assigneeIds && filters.assigneeIds.length > 0) {
            if (filters.assigneeIds.includes('unassigned')) {
              const assignedIds = filters.assigneeIds.filter((id: string) => id !== 'unassigned');
              if (assignedIds.length > 0) {
                issueWhere.OR = [
                  { assigneeId: null },
                  { assigneeId: { in: assignedIds } }
                ];
              } else {
                issueWhere.assigneeId = null;
              }
            } else {
              issueWhere.assigneeId = { in: filters.assigneeIds };
            }
          }

          // Label filter
          if (filters.labelIds && filters.labelIds.length > 0) {
            issueWhere.labels = {
              some: { id: { in: filters.labelIds } }
            };
          }

          // Date range filter
          if (filters.dueAfter) {
            issueWhere.dueDate = { ...(issueWhere.dueDate || {}), gte: new Date(filters.dueAfter) };
          }
          if (filters.dueBefore) {
            issueWhere.dueDate = { ...(issueWhere.dueDate || {}), lte: new Date(filters.dueBefore) };
          }
        }

        // Build orderBy from sorting config
        const orderBy: any = {};
        if (sorting) {
          const field = sorting.field || 'createdAt';
          const direction = sorting.direction || 'desc';
          orderBy[field] = direction;
        } else {
          orderBy.createdAt = 'desc';
        }

        // Fetch issues
        [issues, totalIssues] = await Promise.all([
          prisma.issue.findMany({
            where: issueWhere,
            skip,
            take: limit,
            orderBy,
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
              _count: {
                select: {
                  children: true,
                  comments: true
                }
              }
            }
          }),
          prisma.issue.count({ where: issueWhere })
        ]);

        // Update view access stats
        await prisma.view.update({
          where: { id: view.id },
          data: {
            lastAccessedAt: new Date(),
            accessCount: { increment: 1 }
          }
        });
      }

      const response = {
        id: view.id,
        name: view.name,
        slug: view.slug,
        description: view.description,
        displayType: view.displayType,
        visibility: view.visibility,
        color: view.color,
        isDefault: view.isDefault,
        isFavorite: view.isFavorite,
        projectIds: view.projectIds,
        configuration: {
          filters,
          sorting,
          grouping
        },
        createdAt: view.createdAt,
        updatedAt: view.updatedAt,
        lastAccessedAt: view.lastAccessedAt,
        accessCount: view.accessCount,
        owner: view.owner,
        stats: {
          followers: view._count.followers,
          favorites: view._count.favorites
        },
        ...(includeIssues && {
          issues: issues.map(issue => ({
            id: issue.id,
            issueKey: issue.issueKey,
            title: issue.title,
            type: issue.type,
            status: issue.projectStatus?.name || issue.statusValue || issue.status,
            projectStatus: issue.projectStatus,
            priority: issue.priority,
            dueDate: issue.dueDate,
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
            project: issue.project,
            assignee: issue.assignee,
            labels: issue.labels,
            stats: {
              childCount: issue._count.children,
              commentCount: issue._count.comments
            }
          })),
          pagination: {
            page,
            limit,
            total: totalIssues,
            pages: Math.ceil(totalIssues / limit)
          }
        })
      };

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
  { requiredScopes: ['views:read'] }
);

