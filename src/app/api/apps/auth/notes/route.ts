/**
 * Third-Party App API: Notes Endpoints
 * GET /api/apps/auth/notes - List notes with filtering
 * POST /api/apps/auth/notes - Create new note
 *
 * Required scopes:
 * - notes:read for GET
 * - notes:write for POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';
import { NoteType, NoteScope } from '@prisma/client';
import { stripHtmlTags } from '@/lib/html-sanitizer';

/**
 * Strip HTML tags from content for plain text output
 * Uses the shared linear-time parser to avoid security issues
 */
function stripHtml(html: string): string {
  return stripHtmlTags(html, true).replace(/\s+/g, ' ').trim();
}

// Schema for creating notes
// Note: Default scope is WORKSPACE (not PERSONAL) because PERSONAL notes
// are not accessible via MCP API endpoints - this prevents confusion where
// created notes cannot be retrieved via the same API
const CreateNoteSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string(),
  type: z.nativeEnum(NoteType).optional().default(NoteType.GENERAL),
  scope: z.nativeEnum(NoteScope).optional().default(NoteScope.WORKSPACE),
  projectId: z.string().cuid().optional(),
  isAiContext: z.boolean().optional().default(false),
  aiContextPriority: z.number().int().min(0).max(100).optional().default(0),
  tagIds: z.array(z.string()).optional(),
});

/**
 * GET /api/apps/auth/notes
 * List notes accessible to the app user
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');
      const type = searchParams.get('type') as NoteType | null;
      const scope = searchParams.get('scope') as NoteScope | null;
      const search = searchParams.get('search');
      const isAiContext = searchParams.get('aiContext') === 'true';
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const offset = parseInt(searchParams.get('offset') || '0');

      // Build where clause - only show notes the user can access via MCP
      // PERSONAL notes are excluded (they're private to the owner)
      const where: any = {
        workspaceId: context.workspace.id,
        scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC, NoteScope.PROJECT] },
      };

      if (projectId) {
        where.projectId = projectId;
      }

      if (type) {
        where.type = type;
      }

      if (scope && scope !== NoteScope.PERSONAL) {
        where.scope = scope;
      }

      if (isAiContext) {
        where.isAiContext = true;
      }

      if (search) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { content: { contains: search, mode: 'insensitive' } },
          ],
        });
      }

      // Exclude secret note types (use secrets endpoint instead)
      const secretTypes = [NoteType.ENV_VARS, NoteType.API_KEYS, NoteType.CREDENTIALS];

      // Handle type filter: if specific type requested, validate and use it
      // Otherwise, exclude secret types from results
      if (type) {
        // Check if requested type is a secret type
        if (secretTypes.includes(type)) {
          return NextResponse.json(
            { error: 'invalid_type', error_description: 'Use /api/apps/auth/secrets endpoint for secret notes' },
            { status: 400 }
          );
        }
        where.type = type;
      } else {
        where.type = { notIn: secretTypes };
      }

      const [notes, total] = await Promise.all([
        prisma.note.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: [
            { aiContextPriority: 'desc' },
            { updatedAt: 'desc' },
          ],
          select: {
            id: true,
            title: true,
            content: true,
            type: true,
            scope: true,
            isAiContext: true,
            aiContextPriority: true,
            isPinned: true,
            createdAt: true,
            updatedAt: true,
            projectId: true,
            project: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            author: {
              select: {
                id: true,
                name: true,
              },
            },
            tags: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        }),
        prisma.note.count({ where }),
      ]);

      const response = {
        notes: notes.map(note => ({
          id: note.id,
          title: note.title,
          excerpt: stripHtml(note.content).substring(0, 500) + (note.content.length > 500 ? '...' : ''),
          type: note.type,
          scope: note.scope,
          isAiContext: note.isAiContext,
          aiContextPriority: note.aiContextPriority,
          isPinned: note.isPinned,
          projectId: note.projectId,
          projectName: note.project?.name || null,
          author: note.author,
          tags: note.tags,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        })),
        total,
        hasMore: offset + notes.length < total,
      };

      return NextResponse.json(response);
    } catch (error) {
      console.error('Error fetching notes:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['notes:read'] }
);

/**
 * POST /api/apps/auth/notes
 * Create a new note
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const noteData = CreateNoteSchema.parse(body);

      // Validate project if projectId is provided
      if (noteData.projectId) {
        const project = await prisma.project.findFirst({
          where: {
            id: noteData.projectId,
            workspaceId: context.workspace.id,
          },
        });

        if (!project) {
          return NextResponse.json(
            { error: 'project_not_found', error_description: 'Project not found or access denied' },
            { status: 404 }
          );
        }
      }

      // Validate scope requirements
      if (noteData.scope === NoteScope.PROJECT && !noteData.projectId) {
        return NextResponse.json(
          { error: 'validation_error', error_description: 'Project ID is required for PROJECT scope notes' },
          { status: 400 }
        );
      }

      // Prevent creating secret notes via this endpoint
      const secretTypes = [NoteType.ENV_VARS, NoteType.API_KEYS, NoteType.CREDENTIALS];
      if (secretTypes.includes(noteData.type)) {
        return NextResponse.json(
          { error: 'forbidden', error_description: 'Cannot create secret notes via this endpoint' },
          { status: 403 }
        );
      }

      const note = await prisma.note.create({
        data: {
          title: noteData.title,
          content: noteData.content,
          type: noteData.type,
          scope: noteData.scope,
          projectId: noteData.projectId || null,
          workspaceId: context.workspace.id,
          authorId: context.user.id,
          isAiContext: noteData.isAiContext,
          aiContextPriority: noteData.aiContextPriority,
          isFavorite: false,
          ...(noteData.tagIds && noteData.tagIds.length > 0 && {
            tags: {
              connect: noteData.tagIds.map(id => ({ id })),
            },
          }),
        },
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          scope: true,
          isAiContext: true,
          aiContextPriority: true,
          projectId: true,
          createdAt: true,
          updatedAt: true,
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          author: {
            select: {
              id: true,
              name: true,
            },
          },
          tags: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
        },
      });

      return NextResponse.json(note, { status: 201 });
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

      console.error('Error creating note:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['notes:write'] }
);
