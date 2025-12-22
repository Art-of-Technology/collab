/**
 * Third-Party App API: Labels Endpoints
 * GET /api/apps/auth/labels - List labels
 * POST /api/apps/auth/labels - Create label
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const CreateLabelSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

/**
 * GET /api/apps/auth/labels
 * List all workspace labels
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const search = searchParams.get('search');

      const where: any = {
        workspaceId: context.workspace.id,
      };

      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }

      const labels = await prisma.taskLabel.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              issues: true,
            },
          },
        },
      });

      return NextResponse.json({
        labels: labels.map(label => ({
          id: label.id,
          name: label.name,
          color: label.color,
          createdAt: label.createdAt,
          updatedAt: label.updatedAt,
          usage: {
            issues: label._count.issues,
            total: label._count.issues,
          },
        })),
        total: labels.length,
      });
    } catch (error) {
      console.error('Error fetching labels:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['workspace:read'] }
);

/**
 * POST /api/apps/auth/labels
 * Create a new label
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const data = CreateLabelSchema.parse(body);

      // Check for duplicate name
      const existing = await prisma.taskLabel.findFirst({
        where: {
          name: data.name,
          workspaceId: context.workspace.id,
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: 'duplicate_name', error_description: `Label "${data.name}" already exists` },
          { status: 409 }
        );
      }

      const label = await prisma.taskLabel.create({
        data: {
          name: data.name,
          color: data.color || '#6366F1',
          workspaceId: context.workspace.id,
        },
      });

      return NextResponse.json(label, { status: 201 });
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

      console.error('Error creating label:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['workspace:write'] }
);
