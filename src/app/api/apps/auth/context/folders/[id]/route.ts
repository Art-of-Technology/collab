/**
 * Third-Party App API: One Context folder
 * GET /api/apps/auth/context/folders/[id] - the folder and the folders, Notes and files in it
 *
 * Required scope: context:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { agentContextFailure, readAgentFolder } from '@/lib/agent-context-folders';

export const GET = withAppAuth(
  async (_request: NextRequest, context: AppAuthContext, routeParams: { params: Promise<{ id: string }> }) => {
    if (!await userHasWorkspaceAccess(context.user.id, context.workspace.id)) {
      return NextResponse.json(
        { error: 'workspace_access_denied', error_description: 'Active workspace access required' },
        { status: 403 },
      );
    }
    try {
      const { id } = await routeParams.params;
      const path = `/${encodeURIComponent(context.workspace.slug || context.workspace.id)}`;
      return NextResponse.json(await readAgentFolder(context.user.id, context.workspace.id, path, id));
    } catch (error) {
      const failure = agentContextFailure(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  },
  { requiredScopes: ['context:read'] },
);
