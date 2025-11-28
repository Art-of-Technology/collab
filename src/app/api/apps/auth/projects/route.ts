/**
 * Third-Party App API: Projects Endpoints
 * GET /api/apps/auth/projects - List projects
 * POST /api/apps/auth/projects - Create project
 * 
 * Required scopes:
 * - projects:read for GET
 * - projects:write for POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for creating projects
const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(500).optional(),
  issuePrefix: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/, 'Issue prefix must be uppercase alphanumeric'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
});

// Default statuses for new projects
const DEFAULT_STATUSES = [
  { name: 'backlog', displayName: 'Backlog', color: '#94A3B8', order: 0, isDefault: true, isFinal: false },
  { name: 'todo', displayName: 'To Do', color: '#6366F1', order: 1, isDefault: false, isFinal: false },
  { name: 'in_progress', displayName: 'In Progress', color: '#F59E0B', order: 2, isDefault: false, isFinal: false },
  { name: 'review', displayName: 'Review', color: '#8B5CF6', order: 3, isDefault: false, isFinal: false },
  { name: 'done', displayName: 'Done', color: '#10B981', order: 4, isDefault: false, isFinal: true }
];

/**
 * GET /api/apps/auth/projects
 * List workspace projects
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const includeArchived = searchParams.get('includeArchived') === 'true';
      const search = searchParams.get('search');
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id
      };

      if (!includeArchived) {
        where.OR = [
          { isArchived: false },
          { isArchived: null }
        ];
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } }
            ]
          }
        ];
      }

      // Get projects with stats
      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: {
                issues: true,
                statuses: true,
                followers: true
              }
            },
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
                isFinal: true,
                _count: {
                  select: { issues: true }
                }
              }
            }
          }
        }),
        prisma.project.count({ where })
      ]);

      const response = {
        projects: projects.map(project => ({
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
          stats: {
            issueCount: project._count.issues,
            statusCount: project._count.statuses,
            followerCount: project._count.followers
          },
          statuses: project.statuses.map(s => ({
            id: s.id,
            name: s.name,
            displayName: s.displayName,
            color: s.color,
            order: s.order,
            isDefault: s.isDefault,
            isFinal: s.isFinal,
            issueCount: s._count.issues
          }))
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

      return NextResponse.json(response);

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
      const projectData = CreateProjectSchema.parse(body);

      // Check for duplicate slug in workspace
      const existingSlug = await prisma.project.findFirst({
        where: {
          slug: projectData.slug,
          workspaceId: context.workspace.id
        }
      });

      if (existingSlug) {
        return NextResponse.json(
          { error: 'slug_exists', error_description: 'A project with this slug already exists' },
          { status: 409 }
        );
      }

      // Check for duplicate issue prefix in workspace
      const existingPrefix = await prisma.project.findFirst({
        where: {
          issuePrefix: projectData.issuePrefix,
          workspaceId: context.workspace.id
        }
      });

      if (existingPrefix) {
        return NextResponse.json(
          { error: 'prefix_exists', error_description: 'A project with this issue prefix already exists' },
          { status: 409 }
        );
      }

      // Create project with default statuses in a transaction
      const newProject = await prisma.$transaction(async (tx) => {
        // Create the project
        const project = await tx.project.create({
          data: {
            name: projectData.name,
            slug: projectData.slug,
            description: projectData.description,
            issuePrefix: projectData.issuePrefix,
            color: projectData.color,
            workspaceId: context.workspace.id
          }
        });

        // Create default statuses
        await tx.projectStatus.createMany({
          data: DEFAULT_STATUSES.map(status => ({
            ...status,
            projectId: project.id
          }))
        });

        // Fetch the project with statuses
        return tx.project.findUnique({
          where: { id: project.id },
          include: {
            statuses: {
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
            }
          }
        });
      });

      if (!newProject) {
        throw new Error('Failed to create project');
      }

      const response = {
        id: newProject.id,
        name: newProject.name,
        slug: newProject.slug,
        description: newProject.description,
        color: newProject.color,
        issuePrefix: newProject.issuePrefix,
        isArchived: newProject.isArchived || false,
        isDefault: newProject.isDefault,
        createdAt: newProject.createdAt,
        updatedAt: newProject.updatedAt,
        statuses: newProject.statuses
      };

      return NextResponse.json(response, { status: 201 });

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


