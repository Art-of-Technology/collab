/**
 * Third-Party App API: Views Endpoints
 * GET /api/apps/auth/views - List views
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * GET /api/apps/auth/views
 * List available views
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const visibility = searchParams.get('visibility');
      const displayType = searchParams.get('displayType');

      const where: any = {
        workspaceId: context.workspace.id,
        OR: [
          { visibility: 'WORKSPACE' },
          { visibility: 'SHARED' },
          { ownerId: context.user.id },
        ],
      };

      if (visibility && ['PERSONAL', 'WORKSPACE', 'SHARED'].includes(visibility)) {
        where.visibility = visibility;
        // If filtering by PERSONAL, only show user's own views
        if (visibility === 'PERSONAL') {
          delete where.OR;
          where.ownerId = context.user.id;
          where.visibility = 'PERSONAL';
        }
      }

      if (displayType && ['KANBAN', 'LIST', 'TABLE', 'CALENDAR', 'TIMELINE', 'GANTT', 'BOARD', 'PLANNING'].includes(displayType)) {
        where.displayType = displayType;
      }

      const views = await prisma.view.findMany({
        where,
        orderBy: [
          { isFavorite: 'desc' },
          { accessCount: 'desc' },
          { updatedAt: 'desc' },
        ],
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

      return NextResponse.json({
        views: views.map(view => ({
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
          accessCount: view.accessCount,
          createdAt: view.createdAt,
          updatedAt: view.updatedAt,
          lastAccessedAt: view.lastAccessedAt,
          owner: view.owner,
        })),
        total: views.length,
      });
    } catch (error) {
      console.error('Error fetching views:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['workspace:read'] }
);
