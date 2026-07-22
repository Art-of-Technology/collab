/**
 * Third-Party App API: Workspace Endpoints
 * GET /api/apps/auth/workspace - Get current workspace information
 * PATCH /api/apps/auth/workspace - Update workspace settings (admin only)
 * 
 * Required scopes:
 * - workspace:read for GET
 * - workspace:write for PATCH
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for workspace updates
const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
  dockEnabled: z.boolean().optional(),
  timeTrackingEnabled: z.boolean().optional(),
});

/**
 * GET /api/apps/auth/workspace
 * Get current workspace information
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      // Get detailed workspace information
      const workspace = await prisma.workspace.findUnique({
        where: { id: context.workspace.id },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          logoUrl: true,
          ownerId: true,
          dockEnabled: true,
          timeTrackingEnabled: true,
          createdAt: true,
          updatedAt: true,
          // Include member count and basic stats
          _count: {
            select: {
              members: true,
              projects: true,
              issues: true,
            }
          },
          // Include current user's membership details
          members: {
            where: { userId: context.user.id },
            select: {
              role: true,
              createdAt: true,
              status: true
            }
          }
        }
      });

      if (!workspace) {
        return NextResponse.json(
          { error: 'workspace_not_found', error_description: 'Workspace not found' },
          { status: 404 }
        );
      }

      const userMembership = workspace.members[0];

      const response = {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
        logoUrl: workspace.logoUrl,
        ownerId: workspace.ownerId,
        dockEnabled: workspace.dockEnabled,
        timeTrackingEnabled: workspace.timeTrackingEnabled,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        stats: {
          memberCount: workspace._count.members,
          projectCount: workspace._count.projects,
          issueCount: workspace._count.issues,
        },
        currentUser: {
          role: userMembership?.role,
          joinedAt: userMembership?.createdAt,
          status: userMembership?.status
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching workspace:', error);
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

/**
 * PATCH /api/apps/auth/workspace
 * Update workspace settings (requires admin role)
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      // Check if user has admin role in the workspace
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: context.user.id,
            workspaceId: context.workspace.id
          }
        }
      });

      if (!membership || membership.role !== 'ADMIN') {
        return NextResponse.json(
          { 
            error: 'insufficient_permissions', 
            error_description: 'Admin role required to update workspace settings' 
          },
          { status: 403 }
        );
      }

      const body = await request.json();
      const updateData = UpdateWorkspaceSchema.parse(body);

      // Update workspace
      const updatedWorkspace = await prisma.workspace.update({
        where: { id: context.workspace.id },
        data: updateData,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          logoUrl: true,
          ownerId: true,
          dockEnabled: true,
          timeTrackingEnabled: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return NextResponse.json(updatedWorkspace);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'validation_error', 
            error_description: 'Invalid request data',
            details: error.errors
          },
          { status: 400 }
        );
      }

      console.error('Error updating workspace:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['workspace:write'] }
);
