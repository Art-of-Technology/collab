/**
 * Third-Party App API: Labels Endpoints
 * GET /api/apps/auth/labels - List workspace labels
 * POST /api/apps/auth/labels - Create label
 * 
 * Required scopes:
 * - labels:read for GET
 * - labels:write for POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for creating labels
const CreateLabelSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366F1')
});

/**
 * GET /api/apps/auth/labels
 * List workspace labels with usage stats
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const search = searchParams.get('search');
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id
      };

      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }

      // Get labels with usage counts
      const [labels, total] = await Promise.all([
        prisma.taskLabel.findMany({
          where,
          skip,
          take: limit,
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: {
                issues: true,
                tasks: true,
                epics: true,
                stories: true,
                milestones: true
              }
            }
          }
        }),
        prisma.taskLabel.count({ where })
      ]);

      const response = {
        labels: labels.map(label => ({
          id: label.id,
          name: label.name,
          color: label.color,
          createdAt: label.createdAt,
          updatedAt: label.updatedAt,
          usage: {
            issues: label._count.issues,
            tasks: label._count.tasks,
            epics: label._count.epics,
            stories: label._count.stories,
            milestones: label._count.milestones,
            total: label._count.issues + label._count.tasks + label._count.epics + label._count.stories + label._count.milestones
          }
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
      console.error('Error fetching labels:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['labels:read'] }
);

/**
 * POST /api/apps/auth/labels
 * Create a new label
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const labelData = CreateLabelSchema.parse(body);

      // Check for duplicate name in workspace
      const existingLabel = await prisma.taskLabel.findFirst({
        where: {
          name: labelData.name,
          workspaceId: context.workspace.id
        }
      });

      if (existingLabel) {
        return NextResponse.json(
          { error: 'label_exists', error_description: 'A label with this name already exists' },
          { status: 409 }
        );
      }

      // Create the label
      const newLabel = await prisma.taskLabel.create({
        data: {
          name: labelData.name,
          color: labelData.color,
          workspaceId: context.workspace.id
        }
      });

      const response = {
        id: newLabel.id,
        name: newLabel.name,
        color: newLabel.color,
        createdAt: newLabel.createdAt,
        updatedAt: newLabel.updatedAt
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

      console.error('Error creating label:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['labels:write'] }
);


