/**
 * API Route for Using a Template
 *
 * POST /api/notes/templates/[id]/use - Apply template and get processed content
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { BUILT_IN_TEMPLATES } from '@/lib/note-templates';
import { replacePlaceholders, PlaceholderContext } from '@/lib/template-placeholders';

// Schema for using a template
const useTemplateSchema = z.object({
  title: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  workspaceId: z.string(),
  customPlaceholders: z.record(z.string()).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/notes/templates/[id]/use
 * Apply a template with placeholder values
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();

    // Validate input
    const parsed = useTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, projectId, workspaceId, customPlaceholders } = parsed.data;

    // Get user and workspace info for context
    const [user, workspace, project] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      }),
      projectId
        ? prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
          })
        : null,
    ]);

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    let templateData: {
      id: string;
      name: string;
      titleTemplate: string;
      contentTemplate: string;
      defaultType: string;
      defaultScope: string;
      defaultTags: string[];
      isBuiltIn: boolean;
    };

    // Get template (built-in or custom)
    if (id.startsWith('builtin-')) {
      const builtInTemplate = BUILT_IN_TEMPLATES.find(
        t => t.name.toLowerCase().replace(/\s+/g, '-') === id.replace('builtin-', '')
      );

      if (!builtInTemplate) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      templateData = {
        id,
        name: builtInTemplate.name,
        titleTemplate: builtInTemplate.titleTemplate,
        contentTemplate: builtInTemplate.contentTemplate,
        defaultType: builtInTemplate.defaultType,
        defaultScope: builtInTemplate.defaultScope,
        defaultTags: builtInTemplate.defaultTags,
        isBuiltIn: true,
      };
    } else {
      const customTemplate = await prisma.noteTemplate.findUnique({
        where: { id },
      });

      if (!customTemplate) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      // Increment usage count for custom templates
      await prisma.noteTemplate.update({
        where: { id },
        data: { usageCount: { increment: 1 } },
      });

      templateData = {
        id: customTemplate.id,
        name: customTemplate.name,
        titleTemplate: customTemplate.titleTemplate,
        contentTemplate: customTemplate.contentTemplate,
        defaultType: customTemplate.defaultType,
        defaultScope: customTemplate.defaultScope,
        defaultTags: customTemplate.defaultTags,
        isBuiltIn: customTemplate.isBuiltIn,
      };
    }

    // Get auto-incrementing number for templates that use it
    let autoNumber = 1;
    if (templateData.titleTemplate.includes('{{number}}')) {
      // Count existing notes with similar titles to determine next number
      const similarNotesCount = await prisma.note.count({
        where: {
          workspaceId,
          title: {
            startsWith: templateData.name.split('{{')[0],
          },
        },
      });
      autoNumber = similarNotesCount + 1;
    }

    // Build placeholder context
    const placeholderContext: PlaceholderContext = {
      date: new Date(),
      projectName: project?.name || 'Project',
      number: autoNumber,
      title: title ?? '',
      userName: user?.name || 'User',
      workspaceName: workspace.name,
    };

    // Replace placeholders in title and content
    const processedTitle = replacePlaceholders(templateData.titleTemplate, placeholderContext);
    const processedContent = replacePlaceholders(templateData.contentTemplate, placeholderContext);

    return NextResponse.json({
      title: processedTitle,
      content: processedContent,
      defaultType: templateData.defaultType,
      defaultScope: templateData.defaultScope,
      defaultTags: templateData.defaultTags,
      templateId: templateData.isBuiltIn ? null : templateData.id, // Only store custom template IDs
      templateName: templateData.name,
    });
  } catch (error) {
    console.error('Error using template:', error);
    return NextResponse.json({ error: 'Failed to use template' }, { status: 500 });
  }
}
