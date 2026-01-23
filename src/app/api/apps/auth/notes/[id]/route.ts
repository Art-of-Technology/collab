/**
 * Third-Party App API: Single Note Endpoint
 * GET /api/apps/auth/notes/[id] - Get a single note by ID
 *
 * Required scopes: notes:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { NoteType, NoteScope } from '@prisma/client';
import { stripHtmlTags } from '@/lib/html-sanitizer';

/**
 * Strip HTML tags from content for plain text output
 * Uses the shared linear-time parser to avoid security issues
 */
function stripHtml(html: string): string {
  return stripHtmlTags(html, true).replace(/\s+/g, ' ').trim();
}

/**
 * GET /api/apps/auth/notes/[id]
 * Get a single note by ID
 */
export const GET = withAppAuth(
  // Note: In Next.js 15, withAppAuth injects context as 2nd arg, so route params come as 3rd arg
  // with structure { params: Promise<{ id: string }> } due to async params in App Router
  async (request: NextRequest, context: AppAuthContext, routeParams: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await routeParams.params;

      // Find the note
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
          { error: 'note_not_found', error_description: 'Note not found or access denied' },
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
      console.error('Error fetching note:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['notes:read'] }
);
