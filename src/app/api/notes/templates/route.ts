/**
 * API Routes for Note Templates
 *
 * GET /api/notes/templates - List all templates (built-in + workspace custom)
 * POST /api/notes/templates - Create a new custom template
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { BUILT_IN_TEMPLATES } from '@/lib/note-templates';
import { NoteType, NoteScope } from '@prisma/client';

// Schema for creating a template
const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  titleTemplate: z.string().min(1).max(200),
  contentTemplate: z.string().min(1),
  defaultType: z.nativeEnum(NoteType).default(NoteType.GENERAL),
  defaultScope: z.nativeEnum(NoteScope).default(NoteScope.PERSONAL),
  defaultTags: z.array(z.string()).default([]),
  order: z.number().int().min(0).default(100),
});

/**
 * GET /api/notes/templates
 * List all templates (built-in + workspace custom)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const type = searchParams.get('type') as NoteType | null;
    const includeBuiltIn = searchParams.get('includeBuiltIn') !== 'false';

    // Build templates list
    const templates: Array<{
      id: string;
      name: string;
      description: string | null;
      icon: string | null;
      titleTemplate: string;
      contentTemplate: string;
      defaultType: NoteType;
      defaultScope: NoteScope;
      defaultTags: string[];
      isBuiltIn: boolean;
      usageCount: number;
      order: number;
      authorId: string | null;
      workspaceId: string | null;
      author?: { id: string; name: string | null; image: string | null } | null;
    }> = [];

    // Add built-in templates if requested
    if (includeBuiltIn) {
      const builtInTemplates = BUILT_IN_TEMPLATES.filter(t => !type || t.defaultType === type);
      for (const template of builtInTemplates) {
        templates.push({
          id: `builtin-${template.name.toLowerCase().replace(/\s+/g, '-')}`,
          name: template.name,
          description: template.description,
          icon: template.icon,
          titleTemplate: template.titleTemplate,
          contentTemplate: template.contentTemplate,
          defaultType: template.defaultType,
          defaultScope: template.defaultScope,
          defaultTags: template.defaultTags,
          isBuiltIn: true,
          usageCount: 0, // Built-in templates don't track usage globally
          order: template.order,
          authorId: null,
          workspaceId: null,
          author: null,
        });
      }
    }

    // Add workspace custom templates if workspace is specified
    if (workspaceId) {
      const whereClause: {
        workspaceId: string;
        isBuiltIn: boolean;
        defaultType?: NoteType;
      } = {
        workspaceId,
        isBuiltIn: false,
      };

      if (type) {
        whereClause.defaultType = type;
      }

      const customTemplates = await prisma.noteTemplate.findMany({
        where: whereClause,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      });

      for (const template of customTemplates) {
        templates.push({
          id: template.id,
          name: template.name,
          description: template.description,
          icon: template.icon,
          titleTemplate: template.titleTemplate,
          contentTemplate: template.contentTemplate,
          defaultType: template.defaultType,
          defaultScope: template.defaultScope,
          defaultTags: template.defaultTags,
          isBuiltIn: template.isBuiltIn,
          usageCount: template.usageCount,
          order: template.order + 100, // Custom templates come after built-in
          authorId: template.authorId,
          workspaceId: template.workspaceId,
          author: template.author,
        });
      }
    }

    // Sort all templates by order
    templates.sort((a, b) => a.order - b.order);

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

/**
 * POST /api/notes/templates
 * Create a new custom template
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
    }

    // Verify user is a member of the workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: session.user.id,
          workspaceId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    // Validate input
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      name,
      description,
      icon,
      titleTemplate,
      contentTemplate,
      defaultType,
      defaultScope,
      defaultTags,
      order,
    } = parsed.data;

    // Check for duplicate name in workspace
    const existingTemplate = await prisma.noteTemplate.findFirst({
      where: {
        name,
        workspaceId,
      },
    });

    if (existingTemplate) {
      return NextResponse.json(
        { error: 'A template with this name already exists' },
        { status: 400 }
      );
    }

    // Create the template
    const template = await prisma.noteTemplate.create({
      data: {
        name,
        description,
        icon,
        titleTemplate,
        contentTemplate,
        defaultType,
        defaultScope,
        defaultTags,
        order,
        isBuiltIn: false,
        workspaceId,
        authorId: session.user.id,
      },
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

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
