/**
 * Third-Party App API: System Prompts Endpoint
 * GET /api/apps/auth/notes/system-prompts - Get system prompts for AI context
 *
 * Returns notes marked as AI context (SYSTEM_PROMPT, CODING_STYLE, TECH_STACK types)
 *
 * Required scopes: prompts:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { NoteType, NoteScope } from '@prisma/client';

// Note types that are considered AI context/prompts
const PROMPT_TYPES = [
  NoteType.SYSTEM_PROMPT,
  NoteType.CODING_STYLE,
  NoteType.TECH_STACK,
];

/**
 * Strip HTML tags from content for plain text output
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * GET /api/apps/auth/notes/system-prompts
 * Get system prompts specifically for AI context
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');
      const scopeFilter = searchParams.get('scope'); // 'workspace' | 'project' | 'all'
      const typeFilter = searchParams.get('type') as NoteType | null;

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id,
        isAiContext: true,
        type: { in: PROMPT_TYPES },
        scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC, NoteScope.PROJECT] },
      };

      // Filter by specific type if provided
      if (typeFilter && PROMPT_TYPES.includes(typeFilter)) {
        where.type = typeFilter;
      }

      // Filter by scope
      if (scopeFilter === 'workspace') {
        where.projectId = null;
        where.scope = { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC] };
      } else if (scopeFilter === 'project' && projectId) {
        where.projectId = projectId;
      } else if (projectId) {
        // 'all' - include both workspace and project prompts
        where.OR = [
          { projectId: null, scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC] } },
          { projectId },
        ];
        delete where.scope;
      }

      // Verify project exists if projectId provided
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
      }

      const prompts = await prisma.note.findMany({
        where,
        orderBy: [
          { type: 'asc' }, // SYSTEM_PROMPT first
          { aiContextPriority: 'desc' },
          { updatedAt: 'desc' },
        ],
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          scope: true,
          aiContextPriority: true,
          projectId: true,
          updatedAt: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const response = {
        prompts: prompts.map(prompt => ({
          id: prompt.id,
          title: prompt.title,
          content: stripHtml(prompt.content),
          type: prompt.type,
          scope: prompt.scope,
          priority: prompt.aiContextPriority,
          projectId: prompt.projectId,
          projectName: prompt.project?.name || null,
          updatedAt: prompt.updatedAt,
        })),
      };

      return NextResponse.json(response);
    } catch (error) {
      console.error('Error fetching system prompts:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['prompts:read'] }
);
