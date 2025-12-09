/**
 * Third-Party App API: Single Project Endpoints
 * GET /api/apps/auth/projects/:projectId - Get project details
 * PATCH /api/apps/auth/projects/:projectId - Update project
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isArchived: z.boolean().optional(),
});

/**
 * GET /api/apps/auth/projects/:projectId
 * Get detailed project information
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;

      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: context.workspace.id,
        },
        include: {
          statuses: {
            where: { isActive: true },
            orderBy: { order: 'asc' },
          },
          _count: {
            select: {
              issues: true,
            },
          },
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Project not found' },
          { status: 404 }
        );
      }

      // Get issue distribution stats
      const [byType, byPriority, byStatus] = await Promise.all([
        prisma.issue.groupBy({
          by: ['type'],
          where: { projectId },
          _count: true,
        }),
        prisma.issue.groupBy({
          by: ['priority'],
          where: { projectId },
          _count: true,
        }),
        prisma.issue.groupBy({
          by: ['statusId'],
          where: { projectId },
          _count: true,
        }),
      ]);

      return NextResponse.json({
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        color: project.color,
        issuePrefix: project.issuePrefix,
        isDefault: project.isDefault,
        isArchived: project.isArchived,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        statuses: project.statuses.map(s => ({
          id: s.id,
          name: s.name,
          displayName: s.displayName,
          color: s.color,
          order: s.order,
          isDefault: s.isDefault,
          isFinal: s.isFinal,
        })),
        stats: {
          totalIssues: project._count.issues,
          byType: byType.reduce((acc, item) => {
            acc[item.type] = item._count;
            return acc;
          }, {} as Record<string, number>),
          byPriority: byPriority.reduce((acc, item) => {
            acc[item.priority] = item._count;
            return acc;
          }, {} as Record<string, number>),
          byStatus: byStatus.map(s => ({
            statusId: s.statusId,
            count: s._count,
          })),
        },
      });
    } catch (error) {
      console.error('Error fetching project:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['projects:read'] }
);

/**
 * PATCH /api/apps/auth/projects/:projectId
 * Update a project
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;
      const body = await request.json();
      const data = UpdateProjectSchema.parse(body);

      // Find the project
      const existingProject = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: context.workspace.id,
        },
      });

      if (!existingProject) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Project not found' },
          { status: 404 }
        );
      }

      // Check for duplicate name if name is being changed
      if (data.name && data.name !== existingProject.name) {
        const duplicate = await prisma.project.findFirst({
          where: {
            name: data.name,
            workspaceId: context.workspace.id,
            id: { not: projectId },
          },
        });

        if (duplicate) {
          return NextResponse.json(
            { error: 'duplicate_name', error_description: `Project "${data.name}" already exists` },
            { status: 409 }
          );
        }
      }

      const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.color && { color: data.color }),
          ...(data.isArchived !== undefined && { isArchived: data.isArchived }),
        },
      });

      return NextResponse.json(updatedProject);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: 'validation_error',
            error_description: 'Invalid request data',
            details: error.errors,
          },
          { status: 400 }
        );
      }

      console.error('Error updating project:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['projects:write'] }
);
