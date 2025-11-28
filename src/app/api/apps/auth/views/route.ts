/**
 * Third-Party App API: Views Endpoints
 * GET /api/apps/auth/views - List views
 * 
 * Required scopes:
 * - views:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/views
 * List workspace views (personal, workspace, and shared)
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const visibility = searchParams.get('visibility'); // PERSONAL, WORKSPACE, SHARED
      const displayType = searchParams.get('displayType'); // KANBAN, LIST, TABLE, etc.
      const ownerId = searchParams.get('ownerId');
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

      const skip = (page - 1) * limit;

      // Build where clause - user can see their own views + workspace views + shared views they have access to
      const where: any = {
        AND: [
          { workspaceId: context.workspace.id },
          {
            OR: [
              { ownerId: context.user.id }, // Own views
              { visibility: 'WORKSPACE' }, // Workspace-wide views
              { 
                visibility: 'SHARED',
                sharedWith: { has: context.user.id } // Shared with user
              }
            ]
          }
        ]
      };

      if (visibility && ['PERSONAL', 'WORKSPACE', 'SHARED'].includes(visibility)) {
        where.visibility = visibility;
      }

      if (displayType && ['KANBAN', 'LIST', 'TABLE', 'CALENDAR', 'TIMELINE', 'GANTT', 'BOARD'].includes(displayType)) {
        where.displayType = displayType;
      }

      if (ownerId) {
        where.ownerId = ownerId;
      }

      // Get views
      const [views, total] = await Promise.all([
        prisma.view.findMany({
          where,
          skip,
          take: limit,
          orderBy: [
            { isFavorite: 'desc' },
            { lastAccessedAt: 'desc' },
            { updatedAt: 'desc' }
          ],
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
        }),
        prisma.view.count({ where })
      ]);

      const response = {
        views: views.map(view => {
          // Parse JSON fields
          let filters = null;
          let sorting = null;
          let grouping = null;

          try {
            filters = view.filters as any;
            sorting = view.sorting as any;
            grouping = view.grouping as any;
          } catch {
            // Keep as null if parsing fails
          }

          return {
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
            filters,
            sorting,
            grouping,
            createdAt: view.createdAt,
            updatedAt: view.updatedAt,
            lastAccessedAt: view.lastAccessedAt,
            accessCount: view.accessCount,
            owner: view.owner,
            stats: {
              followers: view._count.followers,
              favorites: view._count.favorites
            }
          };
        }),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching views:', error);
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

