/**
 * Third-Party App API: User Workspaces Endpoint
 * GET /api/apps/auth/user/workspaces - Get all workspaces the user has access to
 *
 * Required scopes:
 * - user:read or workspace:read
 *
 * This endpoint allows MCP clients to discover all workspaces
 * available to the authenticated user, enabling multi-workspace support.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/user/workspaces
 * Get all workspaces the authenticated user has access to
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      // Get all workspace memberships for the user
      const memberships = await prisma.workspaceMember.findMany({
        where: {
          userId: context.user.id,
          status: 'ACTIVE'
        },
        include: {
          workspace: {
            select: {
              id: true,
              slug: true,
              name: true,
              description: true,
              createdAt: true,
              _count: {
                select: {
                  members: true,
                  projects: true,
                  issues: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      const workspaces = memberships.map(membership => ({
        id: membership.workspace.id,
        slug: membership.workspace.slug,
        name: membership.workspace.name,
        description: membership.workspace.description,
        role: membership.role,
        joinedAt: membership.createdAt,
        isCurrent: membership.workspace.id === context.workspace.id,
        stats: {
          members: membership.workspace._count.members,
          projects: membership.workspace._count.projects,
          issues: membership.workspace._count.issues
        }
      }));

      return NextResponse.json({
        workspaces,
        currentWorkspaceId: context.workspace.id,
        total: workspaces.length
      });

    } catch (error) {
      console.error('Error fetching user workspaces:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['user:read', 'workspace:read'] }
);
