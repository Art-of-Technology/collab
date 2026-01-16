/**
 * API Route for Saving a Note as a Template
 *
 * POST /api/notes/[id]/save-as-template - Create a template from an existing note
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { NoteType, NoteScope } from '@prisma/client';

// Schema for saving as template
const saveAsTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  titleTemplate: z.string().min(1).max(200).optional(), // If not provided, use note title with placeholders
  defaultTags: z.array(z.string()).default([]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/notes/[id]/save-as-template
 * Create a template from an existing note's content
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: noteId } = await context.params;
    const body = await request.json();

    // Validate input
    const parsed = saveAsTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, description, icon, titleTemplate, defaultTags } = parsed.data;

    // Get the note
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        scope: true,
        workspaceId: true,
        authorId: true,
      },
    });

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    // Verify user has access
    if (note.authorId !== session.user.id) {
      // Check workspace membership if it's a workspace note
      if (note.workspaceId) {
        const membership = await prisma.workspaceMember.findUnique({
          where: {
            userId_workspaceId: {
              userId: session.user.id,
              workspaceId: note.workspaceId,
            },
          },
        });

        if (!membership) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    if (!note.workspaceId) {
      return NextResponse.json(
        { error: 'Cannot create templates from notes without a workspace' },
        { status: 400 }
      );
    }

    // Check for duplicate name in workspace
    const existingTemplate = await prisma.noteTemplate.findFirst({
      where: {
        name,
        workspaceId: note.workspaceId,
      },
    });

    if (existingTemplate) {
      return NextResponse.json(
        { error: 'A template with this name already exists' },
        { status: 400 }
      );
    }

    // Create the template from the note's content
    const template = await prisma.noteTemplate.create({
      data: {
        name,
        description: description || `Template created from "${note.title}"`,
        icon: icon || null,
        titleTemplate: titleTemplate || '{{title}}',
        contentTemplate: note.content,
        defaultType: note.type,
        defaultScope: note.scope,
        defaultTags,
        isBuiltIn: false,
        workspaceId: note.workspaceId,
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
    console.error('Error saving note as template:', error);
    return NextResponse.json({ error: 'Failed to save as template' }, { status: 500 });
  }
}
