/**
 * Third-Party App API: Knowledge Base Endpoint
 * GET /api/apps/auth/notes/knowledge - Search and browse knowledge base articles
 *
 * Returns notes of documentation types (GUIDE, HOW_TO, FAQ, TROUBLESHOOT, README, etc.)
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
 * GET /api/apps/auth/notes/knowledge
 * Search and browse knowledge base articles
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const q = searchParams.get('q'); // Search query
      const type = searchParams.get('type') as NoteType | null;
      const projectId = searchParams.get('projectId');
      const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
      const offset = parseInt(searchParams.get('offset') || '0');

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id,
        type: { in: KNOWLEDGE_TYPES },
        scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC, NoteScope.PROJECT] },
      };

      // Filter by specific type if provided
      if (type && KNOWLEDGE_TYPES.includes(type)) {
        where.type = type;
      }

      // Filter by project
      if (projectId) {
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            workspaceId: context.workspace.id,
          },
        });

        if (!project) {
          return NextResponse.json(
            { error: 'project_not_found', error_description: 'Project not found or access denied' },
            { status: 404 }
          );
        }

        where.projectId = projectId;
      }

      // Search query
      if (q) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
          ],
        });
      }

      const [articles, total] = await Promise.all([
        prisma.note.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: [
            { isPinned: 'desc' },
            { updatedAt: 'desc' },
          ],
          select: {
            id: true,
            title: true,
            content: true,
            type: true,
            scope: true,
            isPinned: true,
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
        }),
        prisma.note.count({ where }),
      ]);

      // If only one result and searching, include full content
      const includeFullContent = q && articles.length === 1;

      const response = {
        articles: articles.map(article => ({
          id: article.id,
          title: article.title,
          type: article.type,
          excerpt: stripHtml(article.content).substring(0, 500) + (article.content.length > 500 ? '...' : ''),
          ...(includeFullContent && { content: stripHtml(article.content) }),
          scope: article.scope,
          isPinned: article.isPinned,
          projectId: article.projectId,
          projectName: article.project?.name || null,
          author: article.author,
          tags: article.tags,
          updatedAt: article.updatedAt,
        })),
        total,
        hasMore: offset + articles.length < total,
      };

      return NextResponse.json(response);
    } catch (error) {
      console.error('Error fetching knowledge articles:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['knowledge:read'] }
);
