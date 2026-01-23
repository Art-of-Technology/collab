/**
 * Third-Party App API: AI Context Endpoint
 * GET /api/apps/auth/ai-context - Get AI context including system prompts, tech stack, and coding style
 *
 * This is the primary endpoint for AI agents to get all relevant context for a workspace/project.
 * Returns merged system prompts in priority order along with workspace and project info.
 *
 * Required scopes: prompts:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { NoteType, NoteScope } from '@prisma/client';
import { stripHtmlToPlainText as stripHtml } from '@/lib/html-sanitizer';

// Note types that are considered AI context
const AI_CONTEXT_TYPES = [
  NoteType.SYSTEM_PROMPT,
  NoteType.CODING_STYLE,
  NoteType.TECH_STACK,
];

/**
 * GET /api/apps/auth/ai-context
 * Get AI context including system prompts, tech stack, and coding style
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');
      const includeKnowledge = searchParams.get('includeKnowledge') === 'true';

      // 1. Fetch workspace-level AI context notes
      const workspacePrompts = await prisma.note.findMany({
        where: {
          workspaceId: context.workspace.id,
          isAiContext: true,
          scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC] },
          type: { in: AI_CONTEXT_TYPES },
          projectId: null, // Exclude project-specific notes
        },
        orderBy: [
          { type: 'asc' }, // SYSTEM_PROMPT first
          { aiContextPriority: 'desc' },
        ],
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          scope: true,
          aiContextPriority: true,
          updatedAt: true,
        },
      });

      // 2. Fetch project-level AI context notes (if projectId provided)
      let projectPrompts: typeof workspacePrompts = [];
      let project: { id: string; name: string; description: string | null } | null = null;

      if (projectId) {
        // Verify project exists and belongs to workspace
        project = await prisma.project.findFirst({
          where: {
            id: projectId,
            workspaceId: context.workspace.id,
          },
          select: {
            id: true,
            name: true,
            description: true,
          },
        });

        if (!project) {
          return NextResponse.json(
            { error: 'project_not_found', error_description: 'Project not found or access denied' },
            { status: 404 }
          );
        }

        projectPrompts = await prisma.note.findMany({
          where: {
            projectId,
            isAiContext: true,
            type: { in: AI_CONTEXT_TYPES },
          },
          orderBy: [
            { type: 'asc' },
            { aiContextPriority: 'desc' },
          ],
          select: {
            id: true,
            title: true,
            content: true,
            type: true,
            scope: true,
            aiContextPriority: true,
            updatedAt: true,
          },
        });
      }

      // 3. Combine prompts (workspace first, then project)
      const allPrompts = [
        ...workspacePrompts.map((p, i) => ({
          ...p,
          effectivePriority: i,
          source: 'WORKSPACE' as const,
        })),
        ...projectPrompts.map((p, i) => ({
          ...p,
          effectivePriority: 100 + i,
          source: 'PROJECT' as const,
        })),
      ].sort((a, b) => a.effectivePriority - b.effectivePriority);

      // 4. Generate merged context string
      const sections: string[] = [];

      // Group by type for better organization
      const systemPrompts = allPrompts.filter(p => p.type === NoteType.SYSTEM_PROMPT);
      const techStack = allPrompts.filter(p => p.type === NoteType.TECH_STACK);
      const codingStyle = allPrompts.filter(p => p.type === NoteType.CODING_STYLE);

      if (systemPrompts.length > 0) {
        sections.push(
          '# System Instructions\n\n' +
            systemPrompts.map(p => `## ${p.title}\n\n${stripHtml(p.content)}`).join('\n\n')
        );
      }

      if (techStack.length > 0) {
        sections.push(
          '# Tech Stack\n\n' +
            techStack.map(p => `## ${p.title}\n\n${stripHtml(p.content)}`).join('\n\n')
        );
      }

      if (codingStyle.length > 0) {
        sections.push(
          '# Coding Style & Conventions\n\n' +
            codingStyle.map(p => `## ${p.title}\n\n${stripHtml(p.content)}`).join('\n\n')
        );
      }

      const mergedContext = sections.join('\n\n---\n\n');

      // 5. Optionally include relevant knowledge base articles
      let knowledge: Array<{ id: string; title: string; type: string; excerpt: string }> = [];

      // Build knowledge scopes array explicitly for better readability
      const knowledgeScopes: NoteScope[] = [NoteScope.WORKSPACE, NoteScope.PUBLIC];
      if (projectId) {
        knowledgeScopes.push(NoteScope.PROJECT);
      }

      if (includeKnowledge) {
        const knowledgeNotes = await prisma.note.findMany({
          where: {
            workspaceId: context.workspace.id,
            type: { in: [NoteType.GUIDE, NoteType.README, NoteType.ARCHITECTURE] },
            scope: { in: knowledgeScopes },
            ...(projectId && { projectId }),
          },
          take: 10,
          orderBy: [
            { isPinned: 'desc' },
            { updatedAt: 'desc' },
          ],
          select: {
            id: true,
            title: true,
            type: true,
            content: true,
          },
        });

        knowledge = knowledgeNotes.map(note => ({
          id: note.id,
          title: note.title,
          type: note.type,
          excerpt: stripHtml(note.content).substring(0, 500) + (note.content.length > 500 ? '...' : ''),
        }));
      }

      // 6. Build response
      const response: {
        systemPrompts: Array<{
          id: string;
          title: string;
          content: string;
          type: string;
          scope: string;
          priority: number;
          source: 'WORKSPACE' | 'PROJECT';
          updatedAt: Date;
        }>;
        mergedContext: string;
        workspace: {
          id: string;
          slug: string;
          name: string;
        };
        project: { id: string; name: string; description: string | null } | null;
        knowledge?: typeof knowledge;
        metadata: {
          generatedAt: string;
          promptCount: number;
        };
      } = {
        systemPrompts: allPrompts.map(p => ({
          id: p.id,
          title: p.title,
          content: stripHtml(p.content),
          type: p.type,
          scope: p.scope,
          priority: p.aiContextPriority,
          source: p.source,
          updatedAt: p.updatedAt,
        })),
        mergedContext,
        workspace: {
          id: context.workspace.id,
          slug: context.workspace.slug,
          name: context.workspace.name,
        },
        project,
        metadata: {
          generatedAt: new Date().toISOString(),
          promptCount: allPrompts.length,
        },
      };

      if (includeKnowledge && knowledge.length > 0) {
        response.knowledge = knowledge;
      }

      return NextResponse.json(response);
    } catch (error) {
      console.error('Error fetching AI context:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['prompts:read'] }
);
