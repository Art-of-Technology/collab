/**
 * Third-Party App API: Single Project Endpoints
 * GET /api/apps/auth/projects/[projectId] - Get project details
 * PATCH /api/apps/auth/projects/[projectId] - Update project
 * 
 * Required scopes:
 * - projects:read for GET
 * - projects:write for PATCH
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for updating projects
const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  isArchived: z.boolean().optional()
});

/**
 * GET /api/apps/auth/projects/[projectId]
 * Get project details with stats
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;

      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: context.workspace.id
        },
        include: {
          statuses: {
            where: { isActive: true },
            orderBy: { order: 'asc' },
            select: {
              id: true,
              name: true,
              displayName: true,
              color: true,
              iconName: true,
              order: true,
              isDefault: true,
              isFinal: true,
              _count: {
                select: { issues: true }
              }
            }
          },
          followers: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true
                }
              }
            }
          },
          _count: {
            select: {
              issues: true,
              statuses: true,
              followers: true
            }
          }
        }
      });

      if (!project) {
        return NextResponse.json(
          { error: 'project_not_found', error_description: 'Project not found' },
          { status: 404 }
        );
      }

      // Get issue statistics by type and priority
      const [issuesByType, issuesByPriority] = await Promise.all([
        prisma.issue.groupBy({
          by: ['type'],
          where: { projectId: project.id },
          _count: { id: true }
        }),
        prisma.issue.groupBy({
          by: ['priority'],
          where: { projectId: project.id },
          _count: { id: true }
        })
      ]);

      const response = {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        color: project.color,
        issuePrefix: project.issuePrefix,
        isArchived: project.isArchived || false,
        isDefault: project.isDefault,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        statuses: project.statuses.map(s => ({
          id: s.id,
          name: s.name,
          displayName: s.displayName,
          color: s.color,
          iconName: s.iconName,
          order: s.order,
          isDefault: s.isDefault,
          isFinal: s.isFinal,
          issueCount: s._count.issues
        })),
        followers: project.followers.map(f => ({
          id: f.id,
          user: f.user
        })),
        stats: {
          totalIssues: project._count.issues,
          statusCount: project._count.statuses,
          followerCount: project._count.followers,
          byType: Object.fromEntries(
            issuesByType.map(item => [item.type, item._count.id])
          ),
          byPriority: Object.fromEntries(
            issuesByPriority.map(item => [item.priority, item._count.id])
          )
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching project:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['projects:read'] }
);

/**
 * PATCH /api/apps/auth/projects/[projectId]
 * Update a project
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;
      const body = await request.json();
      const updateData = UpdateProjectSchema.parse(body);

      // Check project exists and belongs to workspace
      const existingProject = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: context.workspace.id
        }
      });

      if (!existingProject) {
        return NextResponse.json(
          { error: 'project_not_found', error_description: 'Project not found' },
          { status: 404 }
        );
      }

      // Update project
      const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: {
          ...updateData,
          updatedAt: new Date()
        },
        include: {
          statuses: {
            where: { isActive: true },
            orderBy: { order: 'asc' },
            select: {
              id: true,
              name: true,
              displayName: true,
              color: true,
              order: true,
              isDefault: true,
              isFinal: true
            }
          },
          _count: {
            select: {
              issues: true
            }
          }
        }
      });

      const response = {
        id: updatedProject.id,
        name: updatedProject.name,
        slug: updatedProject.slug,
        description: updatedProject.description,
        color: updatedProject.color,
        issuePrefix: updatedProject.issuePrefix,
        isArchived: updatedProject.isArchived || false,
        isDefault: updatedProject.isDefault,
        createdAt: updatedProject.createdAt,
        updatedAt: updatedProject.updatedAt,
        statuses: updatedProject.statuses,
        stats: {
          totalIssues: updatedProject._count.issues
        }
      };

      return NextResponse.json(response);

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

      console.error('Error updating project:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['projects:write'] }
);


