/**
 * Third-Party App API: Secrets Endpoint
 * GET /api/apps/auth/secrets - List accessible secrets (metadata only, not values)
 *
 * Returns secret notes (ENV_VARS, API_KEYS, CREDENTIALS) with key names only.
 * Values must be revealed separately via the reveal endpoint.
 *
 * Required scopes: secrets:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { NoteType, NoteScope } from '@prisma/client';

// Note types that are considered secrets
const SECRET_TYPES = [
  NoteType.ENV_VARS,
  NoteType.API_KEYS,
  NoteType.CREDENTIALS,
];

/**
 * Parse secret variables from encrypted storage to get key names only
 */
function getSecretKeyNames(secretVariables: string | null): string[] {
  if (!secretVariables) return [];

  try {
    // The secretVariables field contains encrypted variable data
    // We can only extract key names from the structure, not values
    const parsed = JSON.parse(secretVariables);
    if (Array.isArray(parsed)) {
      // Each item has: { key, encryptedValue, iv, ... }
      return parsed.map((item: any) => item.key).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * GET /api/apps/auth/secrets
 * List accessible secrets (metadata only)
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id,
        type: { in: SECRET_TYPES },
        isEncrypted: true,
        // Only allow access to non-personal secrets via MCP
        scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC, NoteScope.PROJECT] },
      };

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

      const secrets = await prisma.note.findMany({
        where,
        orderBy: [
          { type: 'asc' },
          { updatedAt: 'desc' },
        ],
        select: {
          id: true,
          title: true,
          type: true,
          scope: true,
          isRestricted: true,
          expiresAt: true,
          secretVariables: true,
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
        secrets: secrets.map(secret => {
          const keys = getSecretKeyNames(secret.secretVariables);
          return {
            id: secret.id,
            title: secret.title,
            type: secret.type,
            scope: secret.scope,
            isRestricted: secret.isRestricted,
            projectId: secret.projectId,
            projectName: secret.project?.name || null,
            variableCount: keys.length,
            keys, // Just the key names, not values
            expiresAt: secret.expiresAt,
            updatedAt: secret.updatedAt,
          };
        }),
      };

      return NextResponse.json(response);
    } catch (error) {
      console.error('Error fetching secrets:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['secrets:read'] }
);
