/**
 * Third-Party App API: Projects Endpoints
 * GET /api/apps/auth/projects - List projects
 * POST /api/apps/auth/projects - Create project
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  issuePrefix: z.string().min(1).max(10).regex(/^[A-Z]+$/),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

/**
 * GET /api/apps/auth/projects
 * List all projects in the workspace
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const includeArchived = searchParams.get('includeArchived') === 'true';
      const search = searchParams.get('search');

      const where: any = {
        workspaceId: context.workspace.id,
      };

      if (!includeArchived) {
        where.OR = [
          { isArchived: false },
          { isArchived: null },
        ];
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { issuePrefix: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      const projects = await prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              issues: true,
              statuses: true,
            },
          },
        },
      });

      return NextResponse.json({
        projects: projects.map((project: any) => ({
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
          stats: {
            issueCount: project._count.issues,
            statusCount: project._count.statuses,
          },
        })),
        total: projects.length,
      });
    } catch (error) {
      console.error('Error fetching projects:', error);
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
 * POST /api/apps/auth/projects
 * Create a new project
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const data = CreateProjectSchema.parse(body);

      // Check for duplicate name
      const existingName = await prisma.project.findFirst({
        where: {
          name: data.name,
          workspaceId: context.workspace.id,
        },
      });

      if (existingName) {
        return NextResponse.json(
          { error: 'duplicate_name', error_description: `Project "${data.name}" already exists` },
          { status: 409 }
        );
      }

      // Check for duplicate slug
      const existingSlug = await prisma.project.findFirst({
        where: {
          slug: data.slug,
          workspaceId: context.workspace.id,
        },
      });

      if (existingSlug) {
        return NextResponse.json(
          { error: 'duplicate_slug', error_description: `Project slug "${data.slug}" already exists` },
          { status: 409 }
        );
      }

      // Check for duplicate issue prefix
      const existingPrefix = await prisma.project.findFirst({
        where: {
          issuePrefix: data.issuePrefix,
          workspaceId: context.workspace.id,
        },
      });

      if (existingPrefix) {
        return NextResponse.json(
          { error: 'duplicate_prefix', error_description: `Issue prefix "${data.issuePrefix}" already in use` },
          { status: 409 }
        );
      }

      // Create project with default statuses
      const project = await prisma.$transaction(async (tx:any) => {
        const newProject = await tx.project.create({
          data: {
            name: data.name,
            slug: data.slug,
            description: data.description,
            color: data.color || '#6366F1',
            issuePrefix: data.issuePrefix,
            workspaceId: context.workspace.id,
            nextIssueNumbers: {
              EPIC: 1,
              STORY: 1,
              TASK: 1,
              BUG: 1,
              MILESTONE: 1,
              SUBTASK: 1,
            },
          },
        });

        // Create default statuses
        const defaultStatuses = [
          { name: 'backlog', displayName: 'Backlog', color: '#94A3B8', order: 0, isDefault: true },
          { name: 'todo', displayName: 'To Do', color: '#6366F1', order: 1 },
          { name: 'in_progress', displayName: 'In Progress', color: '#F59E0B', order: 2 },
          { name: 'in_review', displayName: 'In Review', color: '#8B5CF6', order: 3 },
          { name: 'done', displayName: 'Done', color: '#10B981', order: 4, isFinal: true },
          { name: 'cancelled', displayName: 'Cancelled', color: '#EF4444', order: 5, isFinal: true },
        ];

        const createdStatuses = [];
        for (const status of defaultStatuses) {
          const created = await tx.projectStatus.create({
            data: {
              ...status,
              projectId: newProject.id,
            },
          });
          createdStatuses.push(created);
        }

        return { ...newProject, statuses: createdStatuses };
      });

      return NextResponse.json(project, { status: 201 });
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

      console.error('Error creating project:', error);
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
