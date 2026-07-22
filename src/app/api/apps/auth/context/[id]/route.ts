/**
 * Third-Party App API: Single Context Endpoint
 * GET /api/apps/auth/context/[id] - Get a single context document by ID
 *
 * Required scopes: context:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { NoteType, NoteScope } from '@prisma/client';
import { stripHtmlToPlainText as stripHtml } from '@/lib/html-sanitizer';
import { z } from 'zod';
import { emitContextUpdated } from '@/lib/event-bus';

/**
 * GET /api/apps/auth/context/[id]
 * Get a single context document by ID
 */
export const GET = withAppAuth(
  // Note: In Next.js 15, withAppAuth injects context as 2nd arg, so route params come as 3rd arg
  // with structure { params: Promise<{ id: string }> } due to async params in App Router
  async (request: NextRequest, context: AppAuthContext, routeParams: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await routeParams.params;

      // Find the context document
      const note = await prisma.note.findFirst({
        where: {
          id,
          workspaceId: context.workspace.id,
          // Only allow access to non-personal notes via MCP
          scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC, NoteScope.PROJECT] },
        },
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          scope: true,
          isAiContext: true,
          aiContextPriority: true,
          isPinned: true,
          version: true,
          isEncrypted: true,
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
      });

      if (!note) {
        return NextResponse.json(
          { error: 'context_not_found', error_description: 'Context document not found or access denied' },
          { status: 404 }
        );
      }

      // Check if it's a secret type - mask content unless secrets:read scope
      const secretTypes = [NoteType.ENV_VARS, NoteType.API_KEYS, NoteType.CREDENTIALS];
      if (secretTypes.includes(note.type) || note.isEncrypted) {
        // Check if user has secrets:read scope
        const hasSecretsScope = context.token.scopes.includes('secrets:read');
        if (!hasSecretsScope) {
          // Return explicit fields to avoid exposing sensitive metadata
          return NextResponse.json({
            id: note.id,
            title: note.title,
            content: '[REDACTED - secrets:read scope required]',
            type: note.type,
            scope: note.scope,
            isAiContext: note.isAiContext,
            aiContextPriority: note.aiContextPriority,
            isPinned: note.isPinned,
            version: note.version,
            projectId: note.projectId,
            projectName: note.project?.name || null,
            author: note.author,
            tags: note.tags,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          });
        }
      }

      return NextResponse.json({
        id: note.id,
        title: note.title,
        content: stripHtml(note.content),
        type: note.type,
        scope: note.scope,
        isAiContext: note.isAiContext,
        aiContextPriority: note.aiContextPriority,
        isPinned: note.isPinned,
        version: note.version,
        projectId: note.projectId,
        projectName: note.project?.name || null,
        author: note.author,
        tags: note.tags,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      });
    } catch (error) {
      console.error('Error fetching context document:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['context:read'] }
);

/**
 * PUT /api/apps/auth/context/[id]
 * Update an existing context document
 */
export const PUT = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, routeParams: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await routeParams.params;
      const body = await request.json();

      // Validate request body
      const UpdateNoteSchema = z.object({
        title: z.string().min(1).max(500).optional(),
        content: z.string().optional(),
        type: z.nativeEnum(NoteType).optional(),
        scope: z.nativeEnum(NoteScope).optional(),
        projectId: z.string().cuid().optional().nullable(),
        isAiContext: z.boolean().optional(),
        aiContextPriority: z.number().int().min(0).max(100).optional(),
        tagIds: z.array(z.string()).optional(),
      });

      const validationResult = UpdateNoteSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Invalid request body' },
          { status: 400 }
        );
      }

      const updateData = validationResult.data;

      // Verify note exists in the workspace
      const existingNote = await prisma.note.findFirst({
        where: {
          id,
          workspaceId: context.workspace.id,
          scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC, NoteScope.PROJECT] },
        },
      });

      if (!existingNote) {
        return NextResponse.json(
          { error: 'context_not_found', error_description: 'Context document not found or access denied' },
          { status: 404 }
        );
      }

      // Prevent updating TO secret types
      const secretTypes = [NoteType.ENV_VARS, NoteType.API_KEYS, NoteType.CREDENTIALS];
      if (updateData.type && secretTypes.includes(updateData.type)) {
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Cannot update to secret types' },
          { status: 400 }
        );
      }

      // If scope is being changed to PROJECT, require projectId
      if (updateData.scope === NoteScope.PROJECT && !updateData.projectId) {
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'projectId is required for PROJECT scope' },
          { status: 400 }
        );
      }

      // Build update object
      const updatePayload: any = {};
      if (updateData.title !== undefined) updatePayload.title = updateData.title;
      if (updateData.content !== undefined) updatePayload.content = updateData.content;
      if (updateData.type !== undefined) updatePayload.type = updateData.type;
      if (updateData.scope !== undefined) updatePayload.scope = updateData.scope;
      if (updateData.projectId !== undefined) updatePayload.projectId = updateData.projectId;
      if (updateData.isAiContext !== undefined) updatePayload.isAiContext = updateData.isAiContext;
      if (updateData.aiContextPriority !== undefined) updatePayload.aiContextPriority = updateData.aiContextPriority;

      // Handle tags
      if (updateData.tagIds !== undefined) {
        updatePayload.tags = {
          set: updateData.tagIds.map(id => ({ id })),
        };
      }

      // Update the note
      const updatedNote = await prisma.note.update({
        where: { id },
        data: updatePayload,
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          scope: true,
          isAiContext: true,
          aiContextPriority: true,
          isPinned: true,
          version: true,
          isEncrypted: true,
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
      });

      // Fire-and-forget: emit context event for Qdrant sync
      emitContextUpdated(
        {
          id: updatedNote.id,
          title: updatedNote.title,
          content: updatedNote.content,
          type: updatedNote.type,
          scope: updatedNote.scope,
          isAiContext: updatedNote.isAiContext,
          aiContextPriority: updatedNote.aiContextPriority,
          projectId: updatedNote.projectId,
          authorId: context.user.id,
        },
        updatePayload,
        {
          workspaceId: context.workspace.id,
          workspaceName: context.workspace.name,
          workspaceSlug: context.workspace.slug,
          source: 'mcp',
        },
        { async: true }
      ).catch((err) => console.error('Failed to emit context.updated from MCP:', err));

      return NextResponse.json({
        id: updatedNote.id,
        title: updatedNote.title,
        content: stripHtml(updatedNote.content),
        type: updatedNote.type,
        scope: updatedNote.scope,
        isAiContext: updatedNote.isAiContext,
        aiContextPriority: updatedNote.aiContextPriority,
        isPinned: updatedNote.isPinned,
        version: updatedNote.version,
        projectId: updatedNote.projectId,
        projectName: updatedNote.project?.name || null,
        author: updatedNote.author,
        tags: updatedNote.tags,
        createdAt: updatedNote.createdAt,
        updatedAt: updatedNote.updatedAt,
      });
    } catch (error) {
      console.error('Error updating context document:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['context:write'] }
);

