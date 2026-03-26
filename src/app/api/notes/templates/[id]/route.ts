/**
 * API Routes for Individual Note Template
 *
 * GET /api/notes/templates/[id] - Get a specific template
 * PATCH /api/notes/templates/[id] - Update a template
 * DELETE /api/notes/templates/[id] - Delete a template
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { BUILT_IN_TEMPLATES, getBuiltInTemplateByName } from '@/lib/note-templates';
import { NoteType, NoteScope } from '@prisma/client';

// Schema for updating a template
const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  titleTemplate: z.string().min(1).max(200).optional(),
  contentTemplate: z.string().min(1).optional(),
  defaultType: z.nativeEnum(NoteType).optional(),
  defaultScope: z.nativeEnum(NoteScope).optional(),
  defaultTags: z.array(z.string()).optional(),
  order: z.number().int().min(0).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/notes/templates/[id]
 * Get a specific template (built-in or custom)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Check if it's a built-in template
    if (id.startsWith('builtin-')) {
      const templateName = id
        .replace('builtin-', '')
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      const builtInTemplate = BUILT_IN_TEMPLATES.find(
        t => t.name.toLowerCase().replace(/\s+/g, '-') === id.replace('builtin-', '')
      );

      if (!builtInTemplate) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      return NextResponse.json({
        template: {
          id,
          name: builtInTemplate.name,
          description: builtInTemplate.description,
          icon: builtInTemplate.icon,
          titleTemplate: builtInTemplate.titleTemplate,
          contentTemplate: builtInTemplate.contentTemplate,
          defaultType: builtInTemplate.defaultType,
          defaultScope: builtInTemplate.defaultScope,
          defaultTags: builtInTemplate.defaultTags,
          isBuiltIn: true,
          usageCount: 0,
          order: builtInTemplate.order,
          authorId: null,
          workspaceId: null,
          author: null,
        },
      });
    }

    // Custom template
    const template = await prisma.noteTemplate.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Verify user has access to the workspace
    if (template.workspaceId) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: session.user.id,
            workspaceId: template.workspaceId,
          },
        },
      });

      if (!membership) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

/**
 * PATCH /api/notes/templates/[id]
 * Update a template (custom only, built-in cannot be edited)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Built-in templates cannot be edited
    if (id.startsWith('builtin-')) {
      return NextResponse.json({ error: 'Built-in templates cannot be edited' }, { status: 403 });
    }

    const body = await request.json();

    // Validate input
    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Get existing template
    const existingTemplate = await prisma.noteTemplate.findUnique({
      where: { id },
    });

    if (!existingTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Built-in templates stored in DB cannot be edited
    if (existingTemplate.isBuiltIn) {
      return NextResponse.json({ error: 'Built-in templates cannot be edited' }, { status: 403 });
    }

    // Verify user has access to the workspace
    if (existingTemplate.workspaceId) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: session.user.id,
            workspaceId: existingTemplate.workspaceId,
          },
        },
      });

      if (!membership) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Check for duplicate name if name is being changed
    if (parsed.data.name && parsed.data.name !== existingTemplate.name) {
      const duplicateCheck = await prisma.noteTemplate.findFirst({
        where: {
          name: parsed.data.name,
          workspaceId: existingTemplate.workspaceId,
          id: { not: id },
        },
      });

      if (duplicateCheck) {
        return NextResponse.json(
          { error: 'A template with this name already exists' },
          { status: 400 }
        );
      }
    }

    // Update the template
    const template = await prisma.noteTemplate.update({
      where: { id },
      data: parsed.data,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

/**
 * DELETE /api/notes/templates/[id]
 * Delete a template (custom only, built-in cannot be deleted)
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Built-in templates cannot be deleted
    if (id.startsWith('builtin-')) {
      return NextResponse.json({ error: 'Built-in templates cannot be deleted' }, { status: 403 });
    }

    // Get existing template
    const existingTemplate = await prisma.noteTemplate.findUnique({
      where: { id },
    });

    if (!existingTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Built-in templates stored in DB cannot be deleted
    if (existingTemplate.isBuiltIn) {
      return NextResponse.json({ error: 'Built-in templates cannot be deleted' }, { status: 403 });
    }

    // Verify user has access to the workspace
    if (existingTemplate.workspaceId) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: session.user.id,
            workspaceId: existingTemplate.workspaceId,
          },
        },
      });

      if (!membership) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Delete the template
    await prisma.noteTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
