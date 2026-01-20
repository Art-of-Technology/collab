/**
 * Third-Party App API: Single Knowledge Base Article Endpoint
 * GET /api/apps/auth/notes/knowledge/[id] - Get full knowledge base article
 *
 * Required scopes: knowledge:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { NoteType, NoteScope } from '@prisma/client';
import { stripHtmlTags } from '@/lib/html-sanitizer';

// Note types that are considered knowledge base articles
const KNOWLEDGE_TYPES = [
  NoteType.GUIDE,
  NoteType.README,
  NoteType.ARCHITECTURE,
  NoteType.TROUBLESHOOT,
  NoteType.RUNBOOK,
  NoteType.DECISION,
];

/**
 * Strip HTML tags from content for plain text output
 * Uses the shared linear-time parser to avoid security issues
 */
function stripHtml(html: string): string {
  return stripHtmlTags(html, true).replace(/\s+/g, ' ').trim();
}

/**
 * GET /api/apps/auth/notes/knowledge/[id]
 * Get full knowledge base article by ID
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, params: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params.params;

      const article = await prisma.note.findFirst({
        where: {
          id,
          workspaceId: context.workspace.id,
          type: { in: KNOWLEDGE_TYPES },
          scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC, NoteScope.PROJECT] },
        },
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          scope: true,
          isPinned: true,
          version: true,
          projectId: true,
          createdAt: true,
          updatedAt: true,
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
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!article) {
        return NextResponse.json(
          { error: 'article_not_found', error_description: 'Knowledge base article not found or access denied' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: article.id,
        title: article.title,
        content: stripHtml(article.content),
        type: article.type,
        scope: article.scope,
        isPinned: article.isPinned,
        version: article.version,
        projectId: article.projectId,
        projectName: article.project?.name || null,
        author: article.author,
        tags: article.tags,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
      });
    } catch (error) {
      console.error('Error fetching knowledge article:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['knowledge:read'] }
);
